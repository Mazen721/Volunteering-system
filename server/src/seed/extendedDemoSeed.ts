import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';
import type {
  ActivityType,
  ApplicationStatus,
  ApprovalMode,
  CoverPresetKey,
  Faculty,
  InterestKey,
  OpportunityStatus,
} from '../constants/enums.js';
import { FACULTIES, defaultCoverPreset } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import type { ApplicationLean } from '../models/Application.js';
import { Application } from '../models/Application.js';
import type { CategoryCounts, OpportunityLean } from '../models/Opportunity.js';
import { Opportunity } from '../models/Opportunity.js';
import type { UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import type { DemoStudentSeed } from './seed.js';

export const EXTENDED_DEMO_STUDENTS: readonly DemoStudentSeed[] = [
  {
    email: 'aya.student@mnu.edu.eg',
    fullName: 'آية إبراهيم السيد',
    volunteerId: '20260004',
    faculty: FACULTIES[3],
    status: 'active',
    interests: ['technology', 'event_organizing', 'education'],
  },
  {
    email: 'mariam.student@mnu.edu.eg',
    fullName: 'مريم طارق فؤاد',
    volunteerId: '20260006',
    faculty: FACULTIES[5],
    status: 'active',
    interests: ['charity_community', 'event_organizing', 'awareness_campaigns'],
  },
  {
    email: 'nour.student@mnu.edu.eg',
    fullName: 'نور طاهر حسين',
    volunteerId: '20260008',
    faculty: FACULTIES[6],
    status: 'active',
    interests: ['medical', 'awareness_campaigns', 'charity_community'],
  },
  {
    email: 'omar.pending@mnu.edu.eg',
    fullName: 'عمر خالد المنصوري',
    volunteerId: '20260102',
    faculty: FACULTIES[3],
    status: 'pending',
    interests: ['technology', 'sports', 'event_organizing'],
  },
  {
    email: 'salma.pending@mnu.edu.eg',
    fullName: 'سلمى عادل الشافعي',
    volunteerId: '20260103',
    faculty: FACULTIES[2],
    status: 'pending',
    interests: ['medical', 'awareness_campaigns'],
  },
];

interface WorkflowOpportunitySpec {
  key: string;
  title: string;
  description: string;
  requirements: string;
  coverPreset?: CoverPresetKey;
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
  approvalMode: ApprovalMode;
  status: OpportunityStatus;
  createdBy: Types.ObjectId;
}

interface WorkflowApplicationSpec {
  opportunity: OpportunityLean;
  studentUser: UserLean;
  status: ApplicationStatus;
  note: string;
  attended: boolean;
  hoursGranted: number;
  supervisorName: string;
}

interface RosterContext {
  admin: UserLean;
  deansByFaculty: Map<Faculty, UserLean>;
  studentsByEmail: Map<string, UserLean>;
}

function buildStudentAccountAttributes(
  student: DemoStudentSeed,
  passwordHash: string,
  adminId: Types.ObjectId,
  linkedVolunteer: VolunteerLean | null
) {
  return {
    email: student.email,
    passwordHash,
    fullName: student.fullName,
    role: 'student' as const,
    faculty: linkedVolunteer ? linkedVolunteer.faculty : student.faculty,
    status: student.status,
    volunteer: linkedVolunteer ? linkedVolunteer._id : null,
    registration: {
      volunteerId: student.volunteerId,
      category: 'student' as const,
      faculty: student.faculty,
      facultyMismatch: false,
    },
    interests: student.interests,
    approvedBy: student.status === 'active' ? adminId : null,
    approvedAt: student.status === 'active' ? new Date() : null,
    rejectionReason: null,
  };
}

async function upsertExtendedStudentAccount(
  student: DemoStudentSeed,
  passwordHash: string,
  adminId: Types.ObjectId
): Promise<void> {
  const linkedVolunteer =
    student.status === 'active'
      ? await Volunteer.findOne({ volunteerId: student.volunteerId }).lean<VolunteerLean>()
      : null;
  const attributes = buildStudentAccountAttributes(student, passwordHash, adminId, linkedVolunteer);

  await User.findOneAndUpdate(
    { email: student.email },
    { $set: attributes },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

async function seedExtendedStudentAccounts(
  passwordHash: string,
  adminId: Types.ObjectId
): Promise<void> {
  for (const studentSpec of EXTENDED_DEMO_STUDENTS) {
    await upsertExtendedStudentAccount(studentSpec, passwordHash, adminId);
  }
}

async function queryRosterContext(): Promise<RosterContext> {
  const admin = await User.findOne({ role: 'admin' }).lean<UserLean>();
  if (!admin) {
    throw new Error('Admin user must exist before seeding extended workflow data');
  }

  const [deans, students] = await Promise.all([
    User.find({ role: 'dean' }).lean<UserLean[]>(),
    User.find({ role: 'student' }).lean<UserLean[]>(),
  ]);

  const deansByFaculty = new Map<Faculty, UserLean>();
  for (const dean of deans) {
    if (dean.faculty) {
      deansByFaculty.set(dean.faculty, dean);
    }
  }
  const studentsByEmail = new Map<string, UserLean>(
    students.map((student) => [student.email, student])
  );

  return { admin, deansByFaculty, studentsByEmail };
}

function buildAdminOpportunitySpecs(admin: UserLean, now: number): WorkflowOpportunitySpec[] {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  return [
    {
      key: 'admin_innovation_conf',
      title: 'مؤتمر جامعة المنصورة الأهلية للابتكار والتحول الرقمي',
      description: 'تنظيم جلسات ومعرض مشروعات التحول الرقمي والابتكار الطلابي بالحرم الجامعي.',
      requirements: 'إجادة مهارات التواصل والتنظيم والالتزام بمواعيد اللجان التنظيمية.',
      fields: ['technology', 'event_organizing', 'education'],
      activityType: 'مؤتمر مجتمعي',
      locationName: 'القاعة الكبرى للمؤتمرات - المبنى الرئيسي',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 5 * dayMs),
      endAt: new Date(now + 5 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now + 4 * dayMs),
      hours: 6,
      contactName: 'مسؤول النظام - مركز المسؤولية المجتمعية',
      contactPhone: '01000000101',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 40, academic: 5, admin: 5 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'admin_dakahlia_convoy',
      title: 'قافلة جامعة المنصورة الأهلية الشاملة بقرى الدقهلية',
      description:
        'قافلة طبية وتنموية شاملة لتقديم الفحوصات المجانية والتوعية الصحية لأهالي القرى.',
      requirements: 'حضور التدريب المسبق والالتزام بفرق العمل الميدانية.',
      fields: ['medical', 'charity_community', 'awareness_campaigns'],
      activityType: 'قافلة',
      locationName: 'نقطة التجمع - البوابة الرئيسية للجامعة',
      locationAddress: 'جامعة المنصورة الأهلية - جمصة',
      startAt: new Date(now - 10 * dayMs),
      endAt: new Date(now - 10 * dayMs + 8 * hourMs),
      registrationDeadline: new Date(now - 12 * dayMs),
      hours: 8,
      contactName: 'إدارة القوافل المجتمعية',
      contactPhone: '01000000102',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 35, academic: 5, admin: 5 },
      approvalMode: 'auto',
      status: 'completed',
      createdBy: admin._id,
    },
    {
      key: 'admin_green_campus_draft',
      title: 'مبادرة تشجير وتجميل الحرم الجامعي بجمصة',
      description: 'مبادرة بيئية لزيادة المساحات الخضراء ونشر ثقافة الاستدامة داخل الحرم الجامعي.',
      requirements: 'ارتداء ملابس مناسبة للعمل الميداني البيئي.',
      fields: ['agriculture_environment', 'charity_community'],
      activityType: 'مبادرة',
      locationName: 'الحدائق المركزية بالحرم الجامعي',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 10 * dayMs),
      endAt: new Date(now + 10 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 8 * dayMs),
      hours: 4,
      contactName: 'لجنة الاستدامة البيئية',
      contactPhone: '01000000103',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 50, academic: 5, admin: 5 },
      approvalMode: 'auto',
      status: 'draft',
      createdBy: admin._id,
    },
  ];
}

function buildMedicalAndDentalDeanSpecs(
  roster: RosterContext,
  now: number
): WorkflowOpportunitySpec[] {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const medDean = roster.deansByFaculty.get(FACULTIES[0]) ?? roster.admin;
  const dentDean = roster.deansByFaculty.get(FACULTIES[1]) ?? roster.admin;
  const pharmDean = roster.deansByFaculty.get(FACULTIES[2]) ?? roster.admin;

  return [
    {
      key: 'med_first_aid_seminar',
      title: 'ندوة الإسعافات الأولية والطوارئ الإكلينيكية',
      description:
        'ندوة تطبيقية لتدريب طلاب كلية الطب البشري على بروتوكولات الإنعاش والإسعاف الأولي.',
      requirements: 'إحضار المعطف الطبي الأبيض والبطاقة الجامعية.',
      fields: ['medical', 'education'],
      activityType: 'ندوة',
      locationName: 'المدرج الكبير - كلية الطب البشري',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى الكليات الطبية',
      startAt: new Date(now + 4 * dayMs),
      endAt: new Date(now + 4 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 3 * dayMs),
      hours: 4,
      contactName: medDean.fullName,
      contactPhone: '01000000201',
      contactEmail: medDean.email,
      faculty: FACULTIES[0],
      slots: { student: 25, academic: 3, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: medDean._id,
    },
    {
      key: 'dent_oral_care_campaign',
      title: 'حملة فحص وتوعية صحة الفم والأسنان بالعيادات الخارجية',
      description: 'حملة ميدانية لفحص الأسنان وتقديم إرشادات الوقاية للمترددين على عيادات الجامعة.',
      requirements: 'الالتزام بمعايير مكافحة العدوى وارتداء مهمات الوقاية الشخصية.',
      fields: ['medical', 'awareness_campaigns'],
      activityType: 'حملة توعية',
      locationName: 'مجمع عيادات طب الأسنان التعليمي',
      locationAddress: 'جامعة المنصورة الأهلية - كلية طب الأسنان',
      startAt: new Date(now + 2 * dayMs),
      endAt: new Date(now + 2 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 1 * dayMs),
      hours: 4,
      contactName: dentDean.fullName,
      contactPhone: '01000000202',
      contactEmail: dentDean.email,
      faculty: FACULTIES[1],
      slots: { student: 20, academic: 3, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: dentDean._id,
    },
    {
      key: 'dent_live_convoy',
      title: 'قافلة طب الأسنان المجتمعية بمدينة جمصة (مباشر)',
      description: 'قافلة علاجية وتوعوية جارية الآن لطلاب كلية طب الأسنان مع تسجيل الحضور الفوري.',
      requirements: 'التواجد في العيادة المتنقلة وتسجيل الحضور عبر رمز QR.',
      fields: ['medical', 'charity_community'],
      activityType: 'قافلة',
      locationName: 'العيادات المتنقلة - كلية طب الأسنان',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now - 20 * 60 * 1000),
      endAt: new Date(now + 3 * hourMs),
      registrationDeadline: new Date(now - 45 * 60 * 1000),
      hours: 5,
      contactName: dentDean.fullName,
      contactPhone: '01000000203',
      contactEmail: dentDean.email,
      faculty: FACULTIES[1],
      slots: { student: 20, academic: 2, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: dentDean._id,
    },
    {
      key: 'pharm_antibiotics_campaign',
      title: 'حملة التوعية بالاستخدام الآمن للمضادات الحيوية والدواء',
      description:
        'توعية الطلاب والمجتمع بمخاطر الاستخدام العشوائي للمضادات الحيوية وطرق حفظ الدواء.',
      requirements: 'مراجعة الدليل الإرشادي الصيدلي قبل بدء الحملة.',
      fields: ['medical', 'awareness_campaigns'],
      activityType: 'حملة توعية',
      locationName: 'بهو كلية الصيدلة',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى كلية الصيدلة',
      startAt: new Date(now + 6 * dayMs),
      endAt: new Date(now + 6 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 5 * dayMs),
      hours: 4,
      contactName: pharmDean.fullName,
      contactPhone: '01000000204',
      contactEmail: pharmDean.email,
      faculty: FACULTIES[2],
      slots: { student: 25, academic: 3, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: pharmDean._id,
    },
  ];
}

function buildEngineeringAndOtherDeanSpecs(
  roster: RosterContext,
  now: number
): WorkflowOpportunitySpec[] {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const engDean = roster.deansByFaculty.get(FACULTIES[3]) ?? roster.admin;
  const healthDean = roster.deansByFaculty.get(FACULTIES[4]) ?? roster.admin;
  const econDean = roster.deansByFaculty.get(FACULTIES[5]) ?? roster.admin;
  const nursDean = roster.deansByFaculty.get(FACULTIES[6]) ?? roster.admin;

  return [
    {
      key: 'eng_robotics_expo',
      title: 'معرض مشاريع التخرج والروبوتات بكلية الهندسة',
      description: 'تنظيم وإدارة أجنحة معرض الروبوتات والأنظمة المدمجة واستقبال الوفود المشاركة.',
      requirements: 'القدرة على شرح الجوانب التقنية وتنظيم حركة الزوار داخل المعرض.',
      fields: ['technology', 'event_organizing'],
      activityType: 'مؤتمر مجتمعي',
      locationName: 'صالة المعارض الهندسية - كلية الهندسة',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى كلية الهندسة',
      startAt: new Date(now + 4 * dayMs),
      endAt: new Date(now + 4 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now + 3 * dayMs),
      hours: 6,
      contactName: engDean.fullName,
      contactPhone: '01000000301',
      contactEmail: engDean.email,
      faculty: FACULTIES[3],
      slots: { student: 30, academic: 4, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: engDean._id,
    },
    {
      key: 'eng_live_ai_workshop',
      title: 'ورشة عمل الذكاء الاصطناعي وتطبيقاته الهندسية (مباشر)',
      description:
        'ورشة عمل تدريبية وتنظيمية جارية الآن بكلية الهندسة مع تفعيل تسجيل الحضور المباشر.',
      requirements: 'إحضار الحاسب المحمول وتسجيل الحضور عند الدخول.',
      fields: ['technology', 'education'],
      activityType: 'ورشة عمل',
      locationName: 'معمل الأنظمة الذكية - كلية الهندسة',
      locationAddress: 'جامعة المنصورة الأهلية - كلية الهندسة',
      startAt: new Date(now - 15 * 60 * 1000),
      endAt: new Date(now + 3 * hourMs),
      registrationDeadline: new Date(now - 30 * 60 * 1000),
      hours: 4,
      contactName: engDean.fullName,
      contactPhone: '01000000302',
      contactEmail: engDean.email,
      faculty: FACULTIES[3],
      slots: { student: 25, academic: 3, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: engDean._id,
    },
    {
      key: 'eng_labs_completed',
      title: 'مبادرة تطوير معامل الحاسب الآلي والأنظمة الذكية',
      description: 'مبادرة طلابية لتجهيز وتحديث برمجيات معامل كلية الهندسة قبل بدء الفصل الدراسي.',
      requirements: 'معرفة أساسية بأنظمة التشغيل والشبكات.',
      fields: ['technology', 'charity_community'],
      activityType: 'مبادرة',
      locationName: 'مجمع معامل كلية الهندسة',
      locationAddress: 'جامعة المنصورة الأهلية - كلية الهندسة',
      startAt: new Date(now - 5 * dayMs),
      endAt: new Date(now - 5 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now - 6 * dayMs),
      hours: 6,
      contactName: engDean.fullName,
      contactPhone: '01000000303',
      contactEmail: engDean.email,
      faculty: FACULTIES[3],
      slots: { student: 20, academic: 2, admin: 2 },
      approvalMode: 'auto',
      status: 'completed',
      createdBy: engDean._id,
    },
    {
      key: 'health_tech_diagnostics',
      title: 'يوم التوعية بتقنيات المختبرات والأشعة التشخيصية',
      description:
        'فعالية علمية وتوعوية لتعريف الطلاب بمعايير الجودة والسلامة الحيوية في المختبرات.',
      requirements: 'الالتزام بإجراءات السلامة المهنية داخل المعامل.',
      fields: ['medical', 'technology', 'awareness_campaigns'],
      activityType: 'ورشة عمل',
      locationName: 'معامل كلية تكنولوجيا العلوم الصحية',
      locationAddress: 'جامعة المنصورة الأهلية - جمصة',
      startAt: new Date(now + 7 * dayMs),
      endAt: new Date(now + 7 * dayMs + 5 * hourMs),
      registrationDeadline: new Date(now + 5 * dayMs),
      hours: 5,
      contactName: healthDean.fullName,
      contactPhone: '01000000304',
      contactEmail: healthDean.email,
      faculty: FACULTIES[4],
      slots: { student: 20, academic: 3, admin: 3 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: healthDean._id,
    },
    {
      key: 'econ_entrepreneurship_forum',
      title: 'ملتقى ريادة الأعمال والشمول المالي بجامعة المنصورة الأهلية',
      description:
        'تنظيم جلسات حوارية وورش عمل لنشر ثقافة ريادة الأعمال والشمول المالي بين الطلاب.',
      requirements: 'مهارات التنظيم وإدارة الجلسات الحوارية.',
      fields: ['education', 'event_organizing', 'awareness_campaigns'],
      activityType: 'ندوة',
      locationName: 'مدرج كلية الاقتصاد والعلوم الإدارية',
      locationAddress: 'جامعة المنصورة الأهلية - جمصة',
      startAt: new Date(now + 3 * dayMs),
      endAt: new Date(now + 3 * dayMs + 5 * hourMs),
      registrationDeadline: new Date(now + 2 * dayMs),
      hours: 5,
      contactName: econDean.fullName,
      contactPhone: '01000000305',
      contactEmail: econDean.email,
      faculty: FACULTIES[5],
      slots: { student: 30, academic: 4, admin: 3 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: econDean._id,
    },
    {
      key: 'econ_career_completed',
      title: 'برنامج التأهيل المهني وإدارة المشروعات الطلابية',
      description:
        'برنامج تدريبي لتأهيل طلاب كلية الاقتصاد والعلوم الإدارية لسوق العمل وإدارة المبادرات.',
      requirements: 'حضور كامل ساعات البرنامج التدريبي.',
      fields: ['education', 'charity_community'],
      activityType: 'برنامج تأهيلي',
      locationName: 'قاعة التدريب - كلية الاقتصاد والعلوم الإدارية',
      locationAddress: 'جامعة المنصورة الأهلية - جمصة',
      startAt: new Date(now - 12 * dayMs),
      endAt: new Date(now - 12 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now - 14 * dayMs),
      hours: 6,
      contactName: econDean.fullName,
      contactPhone: '01000000306',
      contactEmail: econDean.email,
      faculty: FACULTIES[5],
      slots: { student: 25, academic: 2, admin: 2 },
      approvalMode: 'auto',
      status: 'completed',
      createdBy: econDean._id,
    },
    {
      key: 'nurs_community_care_course',
      title: 'دورة مهارات الرعاية التمريضية المجتمعية والإسعاف الأولي',
      description:
        'دورة تدريبية لإعداد فرق التمريض التطوعية للمشاركة في القوافل الطبية وحملات التوعية.',
      requirements: 'اجتياز المقابلة التنظيمية والالتزام بالزي الرسمي للكلية.',
      fields: ['medical', 'education', 'charity_community'],
      activityType: 'دورة تدريبية',
      locationName: 'معمل المهارات الإكلينيكية - كلية التمريض',
      locationAddress: 'جامعة المنصورة الأهلية - كلية التمريض',
      startAt: new Date(now + 5 * dayMs),
      endAt: new Date(now + 5 * dayMs + 5 * hourMs),
      registrationDeadline: new Date(now + 4 * dayMs),
      hours: 5,
      contactName: nursDean.fullName,
      contactPhone: '01000000307',
      contactEmail: nursDean.email,
      faculty: FACULTIES[6],
      slots: { student: 25, academic: 3, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: nursDean._id,
    },
  ];
}

/**
 * Fresh upcoming opportunities (Round A+B seed refresh): relative dates keep
 * the board and home page populated with actionable work on every seed run,
 * so ended history never has to pad the discovery surfaces. Starts spread
 * from ~36 hours to 45 days out, across all nine interest fields, with a mix
 * of all-faculty and faculty-targeted items and two deadlines closing within
 * days for urgency.
 */
function buildFreshUpcomingSpecs(roster: RosterContext, now: number): WorkflowOpportunitySpec[] {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const admin = roster.admin;
  const medDean = roster.deansByFaculty.get(FACULTIES[0]) ?? roster.admin;
  const engDean = roster.deansByFaculty.get(FACULTIES[3]) ?? roster.admin;
  const nursDean = roster.deansByFaculty.get(FACULTIES[6]) ?? roster.admin;

  return [
    {
      key: 'fresh_blood_donation_drive',
      title: 'حملة التبرع بالدم بالتعاون مع بنك الدم الإقليمي',
      description: 'تنظيم حملة للتبرع بالدم داخل الحرم الجامعي واستقبال المتبرعين وتوعيتهم.',
      requirements: 'حضور الجلسة التعريفية القصيرة قبل بدء الحملة.',
      coverPreset: 'blood-donation',
      fields: ['medical', 'charity_community'],
      activityType: 'حملة توعية',
      locationName: 'ساحة الأنشطة الطلابية - المبنى الرئيسي',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 36 * hourMs),
      endAt: new Date(now + 36 * hourMs + 4 * hourMs),
      registrationDeadline: new Date(now + 12 * hourMs),
      hours: 4,
      contactName: 'منسق مركز المسؤولية المجتمعية',
      contactPhone: '01000000401',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 20, academic: 2, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'fresh_med_clinical_skills_day',
      title: 'يوم المهارات الإكلينيكية وفحص العلامات الحيوية',
      description:
        'يوم تدريبي عملي لطلاب كلية الطب البشري على قياس العلامات الحيوية ومهارات الفحص الأولي.',
      requirements: 'إحضار المعطف الطبي الأبيض وسماعة الفحص الشخصية.',
      coverPreset: 'doctor-consult',
      fields: ['medical', 'education'],
      activityType: 'ورشة عمل',
      locationName: 'معمل المهارات الإكلينيكية - كلية الطب البشري',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى الكليات الطبية',
      startAt: new Date(now + 3 * dayMs),
      endAt: new Date(now + 3 * dayMs + 5 * hourMs),
      registrationDeadline: new Date(now + 2 * dayMs),
      hours: 5,
      contactName: medDean.fullName,
      contactPhone: '01000000402',
      contactEmail: medDean.email,
      faculty: FACULTIES[0],
      slots: { student: 30, academic: 4, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: medDean._id,
    },
    {
      key: 'fresh_arts_heritage_festival',
      title: 'مهرجان التراث والفنون الطلابي بالحرم الجامعي',
      description: 'تنظيم أجنحة المهرجان التراثي والفني واستقبال الزوار والعروض الطلابية.',
      requirements: 'مهارات تنظيم وتواصل والقدرة على العمل ضمن فرق الاستقبال.',
      coverPreset: 'art-mural',
      fields: ['arts_culture', 'event_organizing'],
      activityType: 'مبادرة',
      locationName: 'المسرح المكشوف - الحرم الجامعي',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 9 * dayMs),
      endAt: new Date(now + 9 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now + 4 * dayMs),
      hours: 6,
      contactName: 'لجنة الأنشطة الثقافية والفنية',
      contactPhone: '01000000403',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 35, academic: 3, admin: 4 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'fresh_med_research_forum',
      title: 'منتدى البحث العلمي الطلابي بكلية الطب البشري',
      description: 'تنظيم جلسات المنتدى وعروض الأبحاث الطلابية واستقبال لجان التحكيم.',
      requirements: 'الاطلاع على جدول الجلسات وحضور الاجتماع التنظيمي المسبق.',
      coverPreset: 'lecture-hall',
      fields: ['education', 'medical'],
      activityType: 'ندوة',
      locationName: 'قاعة المؤتمرات - كلية الطب البشري',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى الكليات الطبية',
      startAt: new Date(now + 12 * dayMs),
      endAt: new Date(now + 12 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 10 * dayMs),
      hours: 4,
      contactName: medDean.fullName,
      contactPhone: '01000000404',
      contactEmail: medDean.email,
      faculty: FACULTIES[0],
      slots: { student: 25, academic: 6, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: medDean._id,
    },
    {
      key: 'fresh_sports_campus_run',
      title: 'ماراثون الجامعة الرياضي لتشجيع نمط الحياة الصحي',
      description: 'تنظيم مسار الماراثون ونقاط المياه والإسعافات الأولية على امتداد الحرم الجامعي.',
      requirements: 'لياقة بدنية مناسبة للعمل الميداني طوال فترة السباق.',
      coverPreset: 'runners-dusk',
      fields: ['sports', 'awareness_campaigns'],
      activityType: 'مبادرة',
      locationName: 'الملعب الرئيسي - جامعة المنصورة الأهلية',
      locationAddress: 'مدينة جمصة - جامعة المنصورة الأهلية',
      startAt: new Date(now + 15 * dayMs),
      endAt: new Date(now + 15 * dayMs + 3 * hourMs),
      registrationDeadline: new Date(now + 12 * dayMs),
      hours: 3,
      contactName: 'إدارة النشاط الرياضي',
      contactPhone: '01000000405',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 40, academic: 3, admin: 3 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'fresh_tech_ai_bootcamp',
      title: 'معسكر البرمجة والذكاء الاصطناعي لطلاب الهندسة',
      description: 'تنظيم ومساندة جلسات المعسكر التدريبي في البرمجة وتطبيقات الذكاء الاصطناعي.',
      requirements: 'خلفية أساسية في البرمجة وإحضار الحاسب المحمول.',
      coverPreset: 'coding-laptop',
      fields: ['technology', 'education'],
      activityType: 'دورة تدريبية',
      locationName: 'معامل الحاسب - كلية الهندسة',
      locationAddress: 'جامعة المنصورة الأهلية - مبنى كلية الهندسة',
      startAt: new Date(now + 18 * dayMs),
      endAt: new Date(now + 18 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now + 15 * dayMs),
      hours: 6,
      contactName: engDean.fullName,
      contactPhone: '01000000406',
      contactEmail: engDean.email,
      faculty: FACULTIES[3],
      slots: { student: 24, academic: 4, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: engDean._id,
    },
    {
      key: 'fresh_green_agriculture_week',
      title: 'أسبوع التشجير والزراعة المستدامة بمدينة جمصة',
      description: 'زراعة أشجار الظل وتنسيق المساحات الخضراء مع فرق الاستدامة البيئية بالمدينة.',
      requirements: 'ارتداء ملابس مناسبة للعمل الميداني الزراعي.',
      coverPreset: 'tree-planting',
      fields: ['agriculture_environment', 'charity_community'],
      activityType: 'زيارة ميدانية',
      locationName: 'الحدائق المركزية بمدينة جمصة',
      locationAddress: 'مدينة جمصة - محافظة الدقهلية',
      startAt: new Date(now + 20 * dayMs),
      endAt: new Date(now + 20 * dayMs + 5 * hourMs),
      registrationDeadline: new Date(now + 17 * dayMs),
      hours: 5,
      contactName: 'لجنة الاستدامة البيئية',
      contactPhone: '01000000407',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 30, academic: 4, admin: 4 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'fresh_nursing_elderly_care',
      title: 'زيارة رعاية كبار السن ودعم دور المسنين بالمنصورة',
      description: 'زيارة تطوعية لتقديم الدعم الصحي والنفسي وقياس العلامات الحيوية لكبار السن.',
      requirements: 'اجتياز المقابلة التنظيمية والالتزام بآداب التعامل مع كبار السن.',
      coverPreset: 'reaching-hands',
      fields: ['charity_community', 'medical'],
      activityType: 'زيارة ميدانية',
      locationName: 'دار المسنين الخيرية بالمنصورة',
      locationAddress: 'مدينة المنصورة - محافظة الدقهلية',
      startAt: new Date(now + 25 * dayMs),
      endAt: new Date(now + 25 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 21 * dayMs),
      hours: 4,
      contactName: nursDean.fullName,
      contactPhone: '01000000408',
      contactEmail: nursDean.email,
      faculty: FACULTIES[6],
      slots: { student: 18, academic: 3, admin: 2 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: nursDean._id,
    },
    {
      key: 'fresh_literacy_villages',
      title: 'قافلة محو الأمية وتعليم الكبار بقرى الدقهلية',
      description: 'فصول محو أمية متنقلة وتعليم مبادئ القراءة والحساب لأهالي قرى محافظة الدقهلية.',
      requirements: 'حضور التدريب التربوي المسبق للقافلة.',
      coverPreset: 'school-class',
      fields: ['education', 'charity_community'],
      activityType: 'قافلة',
      locationName: 'نقطة التجمع - البوابة الرئيسية للجامعة',
      locationAddress: 'جامعة المنصورة الأهلية - جمصة',
      startAt: new Date(now + 32 * dayMs),
      endAt: new Date(now + 32 * dayMs + 6 * hourMs),
      registrationDeadline: new Date(now + 28 * dayMs),
      hours: 6,
      contactName: 'إدارة القوافل المجتمعية',
      contactPhone: '01000000409',
      contactEmail: admin.email,
      faculty: null,
      slots: { student: 28, academic: 5, admin: 3 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: admin._id,
    },
    {
      key: 'fresh_med_surgery_awareness',
      title: 'حملة التوعية بالكشف المبكر وجراحات اليوم الواحد',
      description: 'توعية المجتمع بأهمية الكشف المبكر والإجراءات الآمنة لجراحات اليوم الواحد.',
      requirements: 'مراجعة المادة التوعوية المعتمدة قبل بدء الحملة.',
      coverPreset: 'surgery-team',
      fields: ['awareness_campaigns', 'medical'],
      activityType: 'حملة توعية',
      locationName: 'العيادات الخارجية - جامعة المنصورة الأهلية',
      locationAddress: 'الحرم الجامعي - المنطقة الطبية',
      startAt: new Date(now + 45 * dayMs),
      endAt: new Date(now + 45 * dayMs + 4 * hourMs),
      registrationDeadline: new Date(now + 40 * dayMs),
      hours: 4,
      contactName: medDean.fullName,
      contactPhone: '01000000410',
      contactEmail: medDean.email,
      faculty: FACULTIES[0],
      slots: { student: 22, academic: 3, admin: 2 },
      approvalMode: 'auto',
      status: 'published',
      createdBy: medDean._id,
    },
  ];
}

function buildOpportunityUpdatePayload(spec: WorkflowOpportunitySpec) {
  return {
    description: spec.description,
    requirements: spec.requirements,
    coverPreset: spec.coverPreset ?? defaultCoverPreset(spec.fields),
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
    approvalMode: spec.approvalMode,
    status: spec.status,
  };
}

async function upsertWorkflowOpportunity(spec: WorkflowOpportunitySpec): Promise<OpportunityLean> {
  const opportunity = await Opportunity.findOneAndUpdate(
    { title: spec.title, createdBy: spec.createdBy },
    {
      $set: buildOpportunityUpdatePayload(spec),
      $setOnInsert: {
        title: spec.title,
        createdBy: spec.createdBy,
        acceptedCounts: { student: 0, academic: 0, admin: 0 },
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();

  if (!opportunity) {
    throw new Error(`Failed to upsert workflow opportunity ${spec.title}`);
  }
  return opportunity;
}

async function upsertApplicationRecord(
  spec: WorkflowApplicationSpec
): Promise<ApplicationLean | null> {
  if (!spec.studentUser.volunteer || !spec.studentUser.faculty) {
    return null;
  }

  return Application.findOneAndUpdate(
    { opportunity: spec.opportunity._id, volunteer: spec.studentUser.volunteer },
    {
      $set: {
        user: spec.studentUser._id,
        faculty: spec.studentUser.faculty,
        category: 'student',
        status: spec.status,
      },
      $setOnInsert: {
        opportunity: spec.opportunity._id,
        volunteer: spec.studentUser.volunteer,
        note: spec.note,
        attended: spec.attended,
        checkedInAt: spec.attended ? spec.opportunity.startAt : null,
        hoursGranted: spec.hoursGranted,
        appliedAt: new Date(spec.opportunity.startAt.getTime() - 36 * 60 * 60 * 1000),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean<ApplicationLean>();
}

async function recountAcceptedStudentSlots(opportunityId: Types.ObjectId): Promise<void> {
  const acceptedStudents = await Application.countDocuments({
    opportunity: opportunityId,
    status: 'accepted',
    category: 'student',
  });
  await Opportunity.updateOne(
    { _id: opportunityId },
    { $set: { 'acceptedCounts.student': acceptedStudents } }
  );
}

async function creditCompletedApplicationActivity(
  spec: WorkflowApplicationSpec,
  applicationId: Types.ObjectId
): Promise<void> {
  if (
    spec.opportunity.status !== 'completed' ||
    !spec.attended ||
    spec.hoursGranted <= 0 ||
    !spec.studentUser.volunteer
  ) {
    return;
  }

  await Activity.findOneAndUpdate(
    { application: applicationId },
    {
      $setOnInsert: {
        volunteer: spec.studentUser.volunteer,
        title: spec.opportunity.title,
        type: spec.opportunity.activityType,
        hours: spec.hoursGranted,
        date: spec.opportunity.endAt,
        status: 'approved',
        supervisor: spec.supervisorName,
        opportunity: spec.opportunity._id,
        application: applicationId,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

async function syncWorkflowApplication(spec: WorkflowApplicationSpec): Promise<void> {
  const application = await upsertApplicationRecord(spec);
  if (!application) {
    return;
  }
  await recountAcceptedStudentSlots(spec.opportunity._id);
  await creditCompletedApplicationActivity(spec, application._id);
}

function buildWorkflowApplications(
  opportunitiesByKey: Map<string, OpportunityLean>,
  roster: RosterContext
): WorkflowApplicationSpec[] {
  const ahmed = roster.studentsByEmail.get('ahmed.student@mnu.edu.eg');
  const sara = roster.studentsByEmail.get('sara.student@mnu.edu.eg');
  const aya = roster.studentsByEmail.get('aya.student@mnu.edu.eg');
  const mariam = roster.studentsByEmail.get('mariam.student@mnu.edu.eg');
  const nour = roster.studentsByEmail.get('nour.student@mnu.edu.eg');
  const mazen = roster.studentsByEmail.get('mazen@mnu.edu.eg');

  const specs: WorkflowApplicationSpec[] = [];
  const pushIfReady = (
    oppKey: string,
    studentUser: UserLean | undefined,
    config: Omit<WorkflowApplicationSpec, 'opportunity' | 'studentUser'>
  ) => {
    const opportunity = opportunitiesByKey.get(oppKey);
    if (opportunity && studentUser) {
      specs.push({ opportunity, studentUser, ...config });
    }
  };

  pushIfReady('admin_innovation_conf', aya, {
    status: 'pending',
    note: 'أرغب في المشاركة بلجنة التنظيم التقني للمؤتمر.',
    attended: false,
    hoursGranted: 0,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('admin_innovation_conf', mariam, {
    status: 'pending',
    note: 'لدي خبرة في تنظيم المؤتمرات واستقبال الوفود.',
    attended: false,
    hoursGranted: 0,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('admin_innovation_conf', mazen, {
    status: 'accepted',
    note: 'متحمس للمشاركة في تنظيم المؤتمر التقني بجامعة المنصورة الأهلية.',
    attended: false,
    hoursGranted: 0,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('admin_dakahlia_convoy', ahmed, {
    status: 'accepted',
    note: 'مشاركة في لجنة الفحص الطبي الأولي.',
    attended: true,
    hoursGranted: 8,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('admin_dakahlia_convoy', sara, {
    status: 'accepted',
    note: 'مشاركة في عيادة الأسنان الميدانية بالقافلة.',
    attended: true,
    hoursGranted: 8,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('admin_dakahlia_convoy', nour, {
    status: 'accepted',
    note: 'مشاركة في فريق الرعاية التمريضية.',
    attended: false,
    hoursGranted: 0,
    supervisorName: roster.admin.fullName,
  });
  pushIfReady('med_first_aid_seminar', ahmed, {
    status: 'pending',
    note: 'أتطلع للمشاركة في تنظيم التدريب العملي للندوة.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الطب البشري',
  });
  pushIfReady('dent_oral_care_campaign', sara, {
    status: 'accepted',
    note: 'جاهزة للمشاركة في الفحص والتوعية بالعيادات الخارجية.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية طب الأسنان',
  });
  pushIfReady('dent_live_convoy', sara, {
    status: 'accepted',
    note: 'مشاركة بالقافلة الجارية بكلية طب الأسنان.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية طب الأسنان',
  });
  pushIfReady('eng_robotics_expo', aya, {
    status: 'pending',
    note: 'أود المساهمة في تنظيم جناح الأنظمة المدمجة والروبوتات.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الهندسة',
  });
  pushIfReady('eng_robotics_expo', mazen, {
    status: 'pending',
    note: 'أرغب في التطوع بتنظيم معرض مشاريع التخرج والروبوتات.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الهندسة',
  });
  pushIfReady('eng_live_ai_workshop', aya, {
    status: 'accepted',
    note: 'مشاركة في تنظيم ورشة الذكاء الاصطناعي.',
    attended: true,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الهندسة',
  });
  pushIfReady('eng_live_ai_workshop', mazen, {
    status: 'accepted',
    note: 'مشارك في ورشة عمل الذكاء الاصطناعي بكلية الهندسة.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الهندسة',
  });
  pushIfReady('eng_labs_completed', aya, {
    status: 'accepted',
    note: 'المشاركة في تجهيز معامل الحاسب الآلي.',
    attended: true,
    hoursGranted: 6,
    supervisorName: 'عميد كلية الهندسة',
  });
  pushIfReady('econ_entrepreneurship_forum', mariam, {
    status: 'accepted',
    note: 'تنظيم جلسات ملتقى ريادة الأعمال.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية الاقتصاد والعلوم الإدارية',
  });
  pushIfReady('econ_career_completed', mariam, {
    status: 'accepted',
    note: 'إتمام برنامج التأهيل المهني وإدارة المشروعات.',
    attended: true,
    hoursGranted: 6,
    supervisorName: 'عميد كلية الاقتصاد والعلوم الإدارية',
  });
  pushIfReady('nurs_community_care_course', nour, {
    status: 'pending',
    note: 'أرغب في الانضمام لفرق الرعاية التمريضية المجتمعية.',
    attended: false,
    hoursGranted: 0,
    supervisorName: 'عميد كلية التمريض',
  });

  return specs;
}

/**
 * Seeds rich Mansoura National University opportunities and applications across Admin and Faculty Deans.
 */
export async function seedExtendedWorkflowData(adminPassword: string): Promise<void> {
  const admin = await User.findOne({ role: 'admin' }).lean<UserLean>();
  if (!admin) {
    throw new Error('Admin user must exist before seeding extended workflow data');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await seedExtendedStudentAccounts(passwordHash, admin._id);
  const roster = await queryRosterContext();
  const now = Date.now();

  const allOpportunitySpecs = [
    ...buildAdminOpportunitySpecs(roster.admin, now),
    ...buildMedicalAndDentalDeanSpecs(roster, now),
    ...buildEngineeringAndOtherDeanSpecs(roster, now),
    ...buildFreshUpcomingSpecs(roster, now),
  ];

  const opportunitiesByKey = new Map<string, OpportunityLean>();
  for (const spec of allOpportunitySpecs) {
    const opportunity = await upsertWorkflowOpportunity(spec);
    opportunitiesByKey.set(spec.key, opportunity);
  }

  for (const applicationSpec of buildWorkflowApplications(opportunitiesByKey, roster)) {
    await syncWorkflowApplication(applicationSpec);
  }
}
