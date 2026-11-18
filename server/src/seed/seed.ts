import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { connectDatabase } from '../config/db.js';
import type { ActivityType, Faculty, InterestKey } from '../constants/enums.js';
import { DEFAULT_CERTIFICATE_HOURS, FACULTIES } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import { Application } from '../models/Application.js';
import type { CategoryCounts, OpportunityLean } from '../models/Opportunity.js';
import { Opportunity } from '../models/Opportunity.js';
import { Settings } from '../models/Settings.js';
import type { UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import type { ParsedActivity, ParsedVolunteer } from './parseWorkbook.js';
import { parseSeedWorkbook } from './parseWorkbook.js';
import { seedExtendedWorkflowData } from './extendedDemoSeed.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_FILE = path.join(CURRENT_DIR, 'data.xlsx');

export interface DemoDeanSeed {
  faculty: Faculty;
  email: string;
  fullName: string;
}

export const DEMO_DEANS: readonly DemoDeanSeed[] = [
  { faculty: FACULTIES[0], email: 'medicine.dean@mnu.edu.eg', fullName: 'عميد كلية الطب البشري' },
  { faculty: FACULTIES[1], email: 'dentistry.dean@mnu.edu.eg', fullName: 'عميد كلية طب الأسنان' },
  { faculty: FACULTIES[2], email: 'pharmacy.dean@mnu.edu.eg', fullName: 'عميد كلية الصيدلة' },
  { faculty: FACULTIES[3], email: 'engineering.dean@mnu.edu.eg', fullName: 'عميد كلية الهندسة' },
  {
    faculty: FACULTIES[4],
    email: 'health-tech.dean@mnu.edu.eg',
    fullName: 'عميد كلية تكنولوجيا العلوم الصحية',
  },
  {
    faculty: FACULTIES[5],
    email: 'economics.dean@mnu.edu.eg',
    fullName: 'عميد كلية الاقتصاد والعلوم الإدارية',
  },
  { faculty: FACULTIES[6], email: 'nursing.dean@mnu.edu.eg', fullName: 'عميد كلية التمريض' },
];

async function upsertSettings(): Promise<void> {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', certificateHours: DEFAULT_CERTIFICATE_HOURS } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function upsertAdminUser(email: string, password: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        email: normalizedEmail,
        passwordHash,
        fullName: 'مسؤول النظام',
        role: 'admin',
        faculty: null,
        status: 'active',
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

async function upsertDemoDeans(password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  for (const dean of DEMO_DEANS) {
    await User.findOneAndUpdate(
      { email: dean.email },
      {
        $set: {
          email: dean.email,
          passwordHash,
          fullName: dean.fullName,
          role: 'dean',
          faculty: dean.faculty,
          status: 'active',
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  }
}

async function upsertVolunteers(
  volunteers: ParsedVolunteer[]
): Promise<Map<string, Types.ObjectId>> {
  const volunteerObjectIds = new Map<string, Types.ObjectId>();

  for (const volunteer of volunteers) {
    const doc = await Volunteer.findOneAndUpdate(
      { volunteerId: volunteer.volunteerId },
      { $set: volunteer },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    if (!doc) {
      throw new Error(`Failed to upsert volunteer ${volunteer.volunteerId}`);
    }
    volunteerObjectIds.set(volunteer.volunteerId, doc._id);
  }

  return volunteerObjectIds;
}

async function upsertActivities(
  activities: ParsedActivity[],
  volunteerObjectIds: Map<string, Types.ObjectId>
): Promise<void> {
  for (const activity of activities) {
    const volunteerObjectId = volunteerObjectIds.get(activity.volunteerId);
    if (!volunteerObjectId) {
      throw new Error(`Missing volunteer object id for ${activity.volunteerId}`);
    }
    await Activity.findOneAndUpdate(
      { volunteer: volunteerObjectId, title: activity.title, date: activity.date },
      {
        $set: {
          type: activity.type,
          hours: activity.hours,
          status: activity.status,
          supervisor: activity.supervisor,
        },
        $setOnInsert: {
          volunteer: volunteerObjectId,
          title: activity.title,
          date: activity.date,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  }
}

export interface SeedDatabaseOptions {
  volunteers: ParsedVolunteer[];
  activities: ParsedActivity[];
  adminEmail: string;
  adminPassword: string;
  includeDemoData?: boolean;
}

export interface SeedDatabaseResult {
  volunteersCount: number;
  activitiesCount: number;
  adminCount: number;
}

export interface DemoStudentSeed {
  email: string;
  fullName: string;
  volunteerId: string;
  faculty: Faculty;
  status: 'active' | 'pending';
  interests: InterestKey[];
}

export const DEMO_STUDENTS: readonly DemoStudentSeed[] = [
  {
    email: 'ahmed.student@mnu.edu.eg',
    fullName: 'أحمد محمد علي',
    volunteerId: '20260001',
    faculty: FACULTIES[0],
    status: 'active',
    interests: ['medical', 'awareness_campaigns', 'event_organizing'],
  },
  {
    email: 'sara.student@mnu.edu.eg',
    fullName: 'سارة محمود حسن',
    volunteerId: '20260002',
    faculty: FACULTIES[1],
    status: 'active',
    interests: ['medical', 'charity_community', 'awareness_campaigns'],
  },
  {
    email: 'pending.student@mnu.edu.eg',
    fullName: 'يوسف كريم طارق',
    volunteerId: '20260101',
    faculty: FACULTIES[1],
    status: 'pending',
    interests: ['medical', 'education'],
  },
];

async function upsertDemoStudents(
  passwordHash: string,
  adminId: Types.ObjectId
): Promise<Map<string, UserLean>> {
  const usersByEmail = new Map<string, UserLean>();

  for (const student of DEMO_STUDENTS) {
    const linkedVolunteer =
      student.status === 'active'
        ? await Volunteer.findOne({ volunteerId: student.volunteerId }).lean<VolunteerLean>()
        : null;

    const doc = await User.findOneAndUpdate(
      { email: student.email },
      {
        $set: {
          email: student.email,
          passwordHash,
          fullName: student.fullName,
          role: 'student',
          faculty: linkedVolunteer ? linkedVolunteer.faculty : student.faculty,
          status: student.status,
          volunteer: linkedVolunteer ? linkedVolunteer._id : null,
          registration: {
            volunteerId: student.volunteerId,
            category: 'student',
            faculty: student.faculty,
            facultyMismatch: false,
          },
          interests: student.interests,
          approvedBy: student.status === 'active' ? adminId : null,
          approvedAt: student.status === 'active' ? new Date() : null,
          rejectionReason: null,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean<UserLean>();

    if (!doc) {
      throw new Error(`Failed to upsert demo student ${student.email}`);
    }
    usersByEmail.set(student.email, doc);
  }

  return usersByEmail;
}

interface DemoOpportunitySpec {
  title: string;
  description: string;
  requirements: string;
  fields: InterestKey[];
  activityType: ActivityType;
  locationName: string;
  locationAddress: string;
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
  hours: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  faculty: Faculty | null;
  slots: CategoryCounts;
  status: 'published' | 'completed';
  createdBy: Types.ObjectId;
}

async function upsertDemoOpportunity(spec: DemoOpportunitySpec): Promise<OpportunityLean> {
  const doc = await Opportunity.findOneAndUpdate(
    { title: spec.title, createdBy: spec.createdBy },
    {
      $set: {
        description: spec.description,
        requirements: spec.requirements,
        fields: spec.fields,
        activityType: spec.activityType,
        location: { name: spec.locationName, address: spec.locationAddress, mapUrl: '' },
        startAt: spec.startAt,
        endAt: spec.endAt,
        registrationDeadline: spec.registrationDeadline,
        hours: spec.hours,
        contactName: spec.contactName,
        contactPhone: spec.contactPhone,
        contactEmail: spec.contactEmail,
        faculty: spec.faculty,
        slots: spec.slots,
        approvalMode: 'auto',
        status: spec.status,
      },
      $setOnInsert: {
        title: spec.title,
        createdBy: spec.createdBy,
        acceptedCounts: { student: 0, academic: 0, admin: 0 },
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();

  if (!doc) {
    throw new Error(`Failed to upsert demo opportunity ${spec.title}`);
  }
  return doc;
}

async function syncDemoApplicationAndActivity(params: {
  opportunity: OpportunityLean;
  studentUser: UserLean;
  attended: boolean;
  hoursGranted: number;
  creditActivity: boolean;
  supervisorName: string;
}): Promise<void> {
  if (!params.studentUser.volunteer || !params.studentUser.faculty) {
    throw new Error(`Active student ${params.studentUser.email} is missing linked volunteer`);
  }

  const application = await Application.findOneAndUpdate(
    { opportunity: params.opportunity._id, volunteer: params.studentUser.volunteer },
    {
      $set: {
        user: params.studentUser._id,
        faculty: params.studentUser.faculty,
        category: 'student',
        status: 'accepted',
      },
      $setOnInsert: {
        opportunity: params.opportunity._id,
        volunteer: params.studentUser.volunteer,
        note: 'مشاركة تجريبية مهيأة تلقائياً',
        attended: params.attended,
        checkedInAt: params.attended ? params.opportunity.startAt : null,
        hoursGranted: params.hoursGranted,
        appliedAt: new Date(params.opportunity.startAt.getTime() - 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();

  if (!application) {
    throw new Error(`Failed to upsert demo application for ${params.studentUser.email}`);
  }

  const acceptedStudents = await Application.countDocuments({
    opportunity: params.opportunity._id,
    status: 'accepted',
    category: 'student',
  });
  await Opportunity.updateOne(
    { _id: params.opportunity._id },
    { $set: { 'acceptedCounts.student': acceptedStudents } }
  );

  if (params.creditActivity) {
    await Activity.findOneAndUpdate(
      { application: application._id },
      {
        $setOnInsert: {
          volunteer: params.studentUser.volunteer,
          title: params.opportunity.title,
          type: params.opportunity.activityType,
          hours: params.opportunity.hours,
          date: params.opportunity.endAt,
          status: 'approved',
          supervisor: params.supervisorName,
          opportunity: params.opportunity._id,
          application: application._id,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  }
}

function buildDemoOpportunitySpecs(
  admin: UserLean,
  medicineDean: UserLean | null
): {
  upcoming: DemoOpportunitySpec;
  live: DemoOpportunitySpec;
  completed: DemoOpportunitySpec;
} {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  return {
    upcoming: {
      title: 'حملة التوعية الصحية بجامعة المنصورة الأهلية',
      description: 'حملة توعوية داخل الحرم الجامعي للتعريف بالإسعافات الأولية والصحة العامة.',
      requirements: 'الالتزام بالزي الجامعي وحضور الجلسة التعريفية.',
      fields: ['medical', 'awareness_campaigns'],
      activityType: 'حملة توعية',
      locationName: 'ساحة الأنشطة الطلابية - المبنى الرئيسي',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 3 * dayMs),
      endAt: new Date(now + 3 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 2 * dayMs),
      hours: 4,
      contactName: 'منسق مركز المسؤولية المجتمعية',
      contactPhone: '01000000001',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 30, academic: 5, admin: 5 },
      status: 'published',
      createdBy: admin._id,
    },
    live: {
      title: 'قافلة الكشف الطبي والتوعية المجتمعية (مباشر)',
      description: 'قافلة طبية وتوعوية جارية الآن مع فتح تسجيل الحضور المباشر برمز QR المتجدد.',
      requirements: 'إبراز البطاقة الجامعية وتسجيل الحضور عند البوابة.',
      fields: ['medical', 'charity_community'],
      activityType: 'قافلة',
      locationName: 'العيادات الخارجية - جامعة المنصورة الأهلية',
      locationAddress: 'الحرم الجامعي - المنطقة الطبية',
      startAt: new Date(now - 15 * 60 * 1000),
      endAt: new Date(now + 2 * hourMs),
      registrationDeadline: new Date(now - 30 * 60 * 1000),
      hours: 5,
      contactName: 'د. محمد صلاح',
      contactPhone: '01000000002',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 25, academic: 5, admin: 5 },
      status: 'published',
      createdBy: admin._id,
    },
    completed: {
      title: 'مبادرة تنظيم يوم استقبال الطلاب الجدد',
      description: 'تنظيم وإرشاد الطلاب الجدد داخل كلية الطب البشري خلال أسبوع التهيئة.',
      requirements: 'التواجد قبل الموعد بربع ساعة.',
      fields: ['event_organizing', 'education'],
      activityType: 'مبادرة',
      locationName: 'مدرج كلية الطب البشري',
      locationAddress: 'جامعة المنصورة الأهلية - قطاع الطب',
      startAt: new Date(now - 7 * dayMs),
      endAt: new Date(now - 7 * dayMs + 3 * hourMs),
      registrationDeadline: new Date(now - 8 * dayMs),
      hours: 3,
      contactName: 'مكتب عميد كلية الطب البشري',
      contactPhone: '01000000003',
      contactEmail: DEMO_DEANS[0].email,
      faculty: FACULTIES[0],
      slots: { student: 20, academic: 2, admin: 2 },
      status: 'completed',
      createdBy: medicineDean?._id ?? admin._id,
    },
  };
}

async function seedDemoOpportunitiesAndLinks(
  admin: UserLean,
  medicineDean: UserLean | null,
  students: Map<string, UserLean>
): Promise<void> {
  const specs = buildDemoOpportunitySpecs(admin, medicineDean);
  await upsertDemoOpportunity(specs.upcoming);
  const liveOpportunity = await upsertDemoOpportunity(specs.live);
  const completedOpportunity = await upsertDemoOpportunity(specs.completed);

  const sara = students.get('sara.student@mnu.edu.eg');
  if (sara) {
    await syncDemoApplicationAndActivity({
      opportunity: liveOpportunity,
      studentUser: sara,
      attended: false,
      hoursGranted: 0,
      creditActivity: false,
      supervisorName: admin.fullName,
    });
  }

  const ahmed = students.get('ahmed.student@mnu.edu.eg');
  if (ahmed) {
    await syncDemoApplicationAndActivity({
      opportunity: completedOpportunity,
      studentUser: ahmed,
      attended: true,
      hoursGranted: completedOpportunity.hours,
      creditActivity: true,
      supervisorName: medicineDean?.fullName ?? admin.fullName,
    });
  }
}

/**
 * Idempotently seeds approved/pending demo students and upcoming, live, and completed opportunities.
 */
export async function seedDemoData(adminPassword: string): Promise<void> {
  const admin = await User.findOne({ role: 'admin' }).lean<UserLean>();
  if (!admin) {
    throw new Error('Admin user must exist before seeding demo data');
  }
  const medicineDean = await User.findOne({ email: DEMO_DEANS[0].email }).lean<UserLean>();
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const students = await upsertDemoStudents(passwordHash, admin._id);
  await seedDemoOpportunitiesAndLinks(admin, medicineDean, students);
}

/**
 * Idempotently seeds settings, admin and faculty dean users, volunteers, activities, and optional v2 demo data.
 */
export async function seedDatabase({
  volunteers,
  activities,
  adminEmail,
  adminPassword,
  includeDemoData = false,
}: SeedDatabaseOptions): Promise<SeedDatabaseResult> {
  await upsertSettings();
  await upsertAdminUser(adminEmail, adminPassword);
  await upsertDemoDeans(adminPassword);

  const volunteerObjectIds = await upsertVolunteers(volunteers);
  await upsertActivities(activities, volunteerObjectIds);

  if (includeDemoData) {
    await seedDemoData(adminPassword);
  }

  const [volunteersCount, activitiesCount, adminCount] = await Promise.all([
    Volunteer.countDocuments(),
    Activity.countDocuments(),
    User.countDocuments({ role: 'admin' }),
  ]);

  return { volunteersCount, activitiesCount, adminCount };
}

async function runCliSeed(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.mongoUri);

  try {
    const { volunteers, activities } = await parseSeedWorkbook(DEFAULT_SEED_FILE);
    await seedDatabase({
      volunteers,
      activities,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
      includeDemoData: true,
    });
    await seedExtendedWorkflowData(env.adminPassword);

    const [
      volunteersCount,
      activitiesCount,
      adminCount,
      deanCount,
      studentCount,
      opportunityCount,
      applicationCount,
    ] = await Promise.all([
      Volunteer.countDocuments(),
      Activity.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'dean' }),
      User.countDocuments({ role: 'student' }),
      Opportunity.countDocuments(),
      Application.countDocuments(),
    ]);
    console.log(
      `Seeded: ${volunteersCount} volunteers, ${activitiesCount} activities, ${adminCount} admin, ${deanCount} deans, ${studentCount} students, ${opportunityCount} opportunities, ${applicationCount} applications`
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCliSeed().catch((err: unknown) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
