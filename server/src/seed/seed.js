import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { loadEnv } from '../config/env.js';
import { connectDatabase } from '../config/db.js';
import { DEFAULT_CERTIFICATE_HOURS } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import { Admin } from '../models/Admin.js';
import { Settings } from '../models/Settings.js';
import { Volunteer } from '../models/Volunteer.js';
import { parseSeedWorkbook } from './parseWorkbook.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_FILE = path.join(CURRENT_DIR, 'data.xlsx');

async function upsertSettings() {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', certificateHours: DEFAULT_CERTIFICATE_HOURS } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function upsertAdmin(email, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  await Admin.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { email: email.toLowerCase(), passwordHash } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function upsertVolunteers(volunteers) {
  const volunteerObjectIds = new Map();

  for (const volunteer of volunteers) {
    const doc = await Volunteer.findOneAndUpdate(
      { volunteerId: volunteer.volunteerId },
      { $set: volunteer },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    volunteerObjectIds.set(volunteer.volunteerId, doc._id);
  }

  return volunteerObjectIds;
}

async function upsertActivities(activities, volunteerObjectIds) {
  for (const activity of activities) {
    const volunteerObjectId = volunteerObjectIds.get(activity.volunteerId);
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

/**
 * Idempotently seeds settings, admin, volunteers, and activities into MongoDB.
 */
export async function seedDatabase({ volunteers, activities, adminEmail, adminPassword }) {
  await upsertSettings();
  await upsertAdmin(adminEmail, adminPassword);

  const volunteerObjectIds = await upsertVolunteers(volunteers);
  await upsertActivities(activities, volunteerObjectIds);

  const [volunteersCount, activitiesCount, adminCount] = await Promise.all([
    Volunteer.countDocuments(),
    Activity.countDocuments(),
    Admin.countDocuments(),
  ]);

  return { volunteersCount, activitiesCount, adminCount };
}

async function runCliSeed() {
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
    console.log(
      `Seeded: ${counts.volunteersCount} volunteers, ${counts.activitiesCount} activities, ${counts.adminCount} admin`
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCliSeed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}
