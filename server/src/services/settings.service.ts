import { DEFAULT_CERTIFICATE_HOURS } from '../constants/enums.js';
import type { SettingsLean } from '../models/Settings.js';
import { Settings } from '../models/Settings.js';
import type { UpdateSettingsInput } from '../validators/settings.schema.js';

export interface SettingsPayload {
  settings: {
    key: string;
    certificateHours: number;
  };
  certificateHours: number;
}

/**
 * Reads global application settings, falling back to DEFAULT_CERTIFICATE_HOURS if not yet stored.
 */
export async function getSettings(): Promise<SettingsPayload> {
  const existing = await Settings.findOne({ key: 'global' }).lean<SettingsLean>();
  const certificateHours = existing?.certificateHours ?? DEFAULT_CERTIFICATE_HOURS;
  return {
    settings: { key: 'global', certificateHours },
    certificateHours,
  };
}

/**
 * Updates global application settings (admin only).
 */
export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsPayload> {
  const updated = await Settings.findOneAndUpdate(
    { key: 'global' },
    {
      $set: { certificateHours: input.certificateHours },
      $setOnInsert: { key: 'global' },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean<SettingsLean>();

  const certificateHours = updated?.certificateHours ?? input.certificateHours;
  return {
    settings: { key: 'global', certificateHours },
    certificateHours,
  };
}
