import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { connectDatabase } from '../config/db.js';
import type { Faculty } from '../constants/enums.js';
import { DEFAULT_CERTIFICATE_HOURS, FACULTIES } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { Volunteer } from '../models/Volunteer.js';
import type { ParsedActivity, ParsedVolunteer } from './parseWorkbook.js';
import { parseSeedWorkbook } from './parseWorkbook.js';

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
}

export interface SeedDatabaseResult {
  volunteersCount: number;
  activitiesCount: number;
  adminCount: number;
}

/**
 * Idempotently seeds settings, admin and faculty dean users, volunteers, and activities.
 */
export async function seedDatabase({
  volunteers,
  activities,
  adminEmail,
  adminPassword,
}: SeedDatabaseOptions): Promise<SeedDatabaseResult> {
  await upsertSettings();
  await upsertAdminUser(adminEmail, adminPassword);
  await upsertDemoDeans(adminPassword);

  const volunteerObjectIds = await upsertVolunteers(volunteers);
  await upsertActivities(activities, volunteerObjectIds);

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
    const counts = await seedDatabase({
      volunteers,
      activities,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });
    const deanCount = await User.countDocuments({ role: 'dean' });
    console.log(
      `Seeded: ${counts.volunteersCount} volunteers, ${counts.activitiesCount} activities, ${counts.adminCount} admin, ${deanCount} deans`
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
