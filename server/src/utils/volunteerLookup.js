import mongoose from 'mongoose';
import { DEFAULT_CERTIFICATE_HOURS } from '../constants/enums.js';
import { Settings } from '../models/Settings.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from './errors.js';

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildVolunteerFilter(identifier) {
  if (mongoose.isValidObjectId(identifier)) {
    return { $or: [{ _id: new mongoose.Types.ObjectId(identifier) }, { volunteerId: identifier }] };
  }
  return { volunteerId: identifier };
}

export async function findVolunteerOrThrow(identifier) {
  const volunteer = await Volunteer.findOne(buildVolunteerFilter(identifier)).lean();
  if (!volunteer) {
    throw new AppError(404, 'المتطوع غير موجود');
  }
  return volunteer;
}

export async function getCertificateHours() {
  const settings = await Settings.findOne({ key: 'global' }).lean();
  return settings?.certificateHours ?? DEFAULT_CERTIFICATE_HOURS;
}
