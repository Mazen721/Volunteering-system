import type { InterestKey } from '../constants/enums';
import type { Opportunity } from '../types';

/**
 * Preset cover photos for opportunities. The server stores only the preset
 * key on the opportunity; this module maps keys to the bundled photos and
 * resolves a cover for any opportunity (its own preset, else the default of
 * its primary field, else the generic volunteering photo).
 */
export interface CoverPreset {
  key: string;
  file: string;
  fields: InterestKey[];
}

export const COVER_PRESETS: CoverPreset[] = [
  { key: 'doctor-care', file: 'doctor-care.jpg', fields: ['medical', 'awareness_campaigns'] },
  { key: 'dental-care', file: 'dental-care.jpg', fields: ['medical'] },
  { key: 'medical-tablet', file: 'medical-tablet.jpg', fields: ['medical', 'awareness_campaigns'] },
  { key: 'gardening', file: 'gardening.jpg', fields: ['agriculture_environment'] },
  { key: 'seedling', file: 'seedling.jpg', fields: ['agriculture_environment'] },
  { key: 'classroom', file: 'classroom.jpg', fields: ['education'] },
  {
    key: 'lecture-hall',
    file: 'lecture-hall.jpg',
    fields: ['education', 'awareness_campaigns', 'arts_culture'],
  },
  { key: 'charity-boxes', file: 'charity-boxes.jpg', fields: ['charity_community'] },
  {
    key: 'donation-hands',
    file: 'donation-hands.jpg',
    fields: ['charity_community', 'awareness_campaigns'],
  },
  {
    key: 'volunteers-packing',
    file: 'volunteers-packing.jpg',
    fields: ['charity_community', 'sports', 'event_organizing'],
  },
  { key: 'robotics', file: 'robotics.jpg', fields: ['technology'] },
  {
    key: 'graduation',
    file: 'graduation.jpg',
    fields: ['event_organizing', 'arts_culture', 'education'],
  },
  {
    key: 'helping-hands',
    file: 'helping-hands.jpg',
    fields: ['charity_community', 'awareness_campaigns', 'medical'],
  },
];

export const COVER_PRESET_KEYS: string[] = COVER_PRESETS.map((preset) => preset.key);

export const GENERIC_COVER_KEY = 'helping-hands';

/** The default cover preset key for an interest field (its first preset). */
export const DEFAULT_COVER_BY_FIELD: Record<InterestKey, string> = {
  medical: 'doctor-care',
  agriculture_environment: 'gardening',
  education: 'classroom',
  charity_community: 'charity-boxes',
  technology: 'robotics',
  sports: 'volunteers-packing',
  arts_culture: 'graduation',
  awareness_campaigns: 'helping-hands',
  event_organizing: 'volunteers-packing',
};

const PRESET_BY_KEY = new Map(COVER_PRESETS.map((preset) => [preset.key, preset]));

export function coverUrlForKey(key: string | null | undefined): string {
  const preset = (key && PRESET_BY_KEY.get(key)) || PRESET_BY_KEY.get(GENERIC_COVER_KEY)!;
  return `/assets/covers/${preset.file}`;
}

/** Default preset key for a list of fields (primary field wins). */
export function defaultCoverKeyForFields(fields: readonly InterestKey[]): string {
  const primary = fields[0];
  return primary ? DEFAULT_COVER_BY_FIELD[primary] : GENERIC_COVER_KEY;
}

/** Presets relevant to the given fields, in catalogue order. */
export function coverPresetsForFields(fields: readonly InterestKey[]): CoverPreset[] {
  if (fields.length === 0) {
    return COVER_PRESETS;
  }
  return COVER_PRESETS.filter((preset) => preset.fields.some((field) => fields.includes(field)));
}

/**
 * Resolves the cover image URL for an opportunity: its stored preset when
 * valid, otherwise its primary field's default, otherwise the generic photo.
 */
export function resolveOpportunityCover(
  opportunity: Pick<Opportunity, 'coverPreset' | 'fields'>
): string {
  if (opportunity.coverPreset && PRESET_BY_KEY.has(opportunity.coverPreset)) {
    return coverUrlForKey(opportunity.coverPreset);
  }
  return coverUrlForKey(defaultCoverKeyForFields(opportunity.fields));
}
