import mongoose from 'mongoose';
import { DEFAULT_CERTIFICATE_HOURS } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import type { SettingsLean } from '../models/Settings.js';
import { Settings } from '../models/Settings.js';
import type { VolunteerFilter, VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from './errors.js';

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildVolunteerFilter(
  identifier: string,
  scope: ScopeFilter = {}
): VolunteerFilter {
  const baseFilter: VolunteerFilter = mongoose.isValidObjectId(identifier)
    ? { $or: [{ _id: new mongoose.Types.ObjectId(identifier) }, { volunteerId: identifier }] }
    : { volunteerId: identifier };

  return scope.faculty ? { ...baseFilter, faculty: scope.faculty } : baseFilter;
}

export async function findVolunteerOrThrow(
  identifier: string,
  scope: ScopeFilter = {}
): Promise<VolunteerLean> {
  const volunteer = await Volunteer.findOne(buildVolunteerFilter(identifier, scope)).lean<VolunteerLean>();
  if (!volunteer) {
    throw new AppError(404, 'المتطوع غير موجود');
  }
  return volunteer;
}

export async function getCertificateHours(): Promise<number> {
  const settings = await Settings.findOne({ key: 'global' }).lean<SettingsLean>();
  return settings?.certificateHours ?? DEFAULT_CERTIFICATE_HOURS;
}
