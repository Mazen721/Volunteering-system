import { API_BASE_URL } from '../api/client';
import type { InterestKey } from '../constants/enums';
import type { Opportunity } from '../types';

/**
 * Cover photos for opportunities. An opportunity may carry a custom photo
 * uploaded by its creator (a data URL stored on the document) or a preset
 * key; this module maps preset keys to the bundled photos and resolves a
 * cover for any opportunity: its uploaded photo first, then its own preset,
 * then the default of its primary field, then the generic volunteering photo.
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
  { key: 'blood-donation', file: 'blood-donation.jpg', fields: ['medical'] },
  { key: 'doctor-consult', file: 'doctor-consult.jpg', fields: ['medical'] },
  { key: 'surgery-team', file: 'surgery-team.jpg', fields: ['medical'] },
  {
    key: 'blood-pressure',
    file: 'blood-pressure.jpg',
    fields: ['medical', 'charity_community'],
  },
  { key: 'tree-planting', file: 'tree-planting.jpg', fields: ['agriculture_environment'] },
  { key: 'seedling-trays', file: 'seedling-trays.jpg', fields: ['agriculture_environment'] },
  { key: 'garden-tools', file: 'garden-tools.jpg', fields: ['agriculture_environment'] },
  { key: 'school-class', file: 'school-class.jpg', fields: ['education'] },
  { key: 'kids-classroom', file: 'kids-classroom.jpg', fields: ['education'] },
  { key: 'kids-drawing', file: 'kids-drawing.jpg', fields: ['education'] },
  { key: 'library-hall', file: 'library-hall.jpg', fields: ['education'] },
  { key: 'food-bank-packing', file: 'food-bank-packing.jpg', fields: ['charity_community'] },
  { key: 'food-bank-team', file: 'food-bank-team.jpg', fields: ['charity_community'] },
  { key: 'clothing-drive', file: 'clothing-drive.jpg', fields: ['charity_community'] },
  {
    key: 'happy-kids',
    file: 'happy-kids.jpg',
    fields: ['charity_community', 'education'],
  },
  { key: 'donation-coins', file: 'donation-coins.jpg', fields: ['charity_community'] },
  {
    key: 'reaching-hands',
    file: 'reaching-hands.jpg',
    fields: ['charity_community', 'awareness_campaigns'],
  },
  { key: 'coding-laptop', file: 'coding-laptop.jpg', fields: ['technology'] },
  { key: 'code-screen', file: 'code-screen.jpg', fields: ['technology'] },
  { key: 'engineer-lab', file: 'engineer-lab.jpg', fields: ['technology'] },
  {
    key: 'students-laptops',
    file: 'students-laptops.jpg',
    fields: ['technology', 'education'],
  },
  { key: 'cycling-race', file: 'cycling-race.jpg', fields: ['sports'] },
  { key: 'fitness-class', file: 'fitness-class.jpg', fields: ['sports'] },
  { key: 'track-start', file: 'track-start.jpg', fields: ['sports'] },
  { key: 'soccer-ball', file: 'soccer-ball.jpg', fields: ['sports'] },
  { key: 'runners-dusk', file: 'runners-dusk.jpg', fields: ['sports'] },
  { key: 'art-mural', file: 'art-mural.jpg', fields: ['arts_culture'] },
  { key: 'paint-brushes', file: 'paint-brushes.jpg', fields: ['arts_culture'] },
  { key: 'concert-singer', file: 'concert-singer.jpg', fields: ['arts_culture'] },
  { key: 'sheet-music', file: 'sheet-music.jpg', fields: ['arts_culture'] },
  {
    key: 'painted-hands',
    file: 'painted-hands.jpg',
    fields: ['arts_culture', 'charity_community'],
  },
  {
    key: 'event-microphone',
    file: 'event-microphone.jpg',
    fields: ['awareness_campaigns', 'event_organizing'],
  },
  { key: 'conference-stage', file: 'conference-stage.jpg', fields: ['event_organizing'] },
  { key: 'event-stage', file: 'event-stage.jpg', fields: ['event_organizing'] },
  {
    key: 'festival-confetti',
    file: 'festival-confetti.jpg',
    fields: ['event_organizing', 'arts_culture'],
  },
  {
    key: 'event-volunteer',
    file: 'event-volunteer.jpg',
    fields: ['event_organizing', 'sports'],
  },
  {
    key: 'planning-workshop',
    file: 'planning-workshop.jpg',
    fields: ['event_organizing', 'technology'],
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
 * Resolves the cover image for an opportunity: its uploaded custom photo
 * when present, then its stored preset when valid, otherwise its primary
 * field's default, otherwise the generic photo.
 */
export function resolveOpportunityCover(
  opportunity: Pick<Opportunity, 'coverPreset' | 'customCover' | 'fields'>
): string {
  if (opportunity.customCover) {
    // List payloads carry the cover route path instead of the photo bytes;
    // detail payloads still carry the full data URL (edit form), and older
    // payloads may carry either — only the path form needs the API origin.
    return opportunity.customCover.startsWith('/opportunities/')
      ? `${API_BASE_URL}${opportunity.customCover}`
      : opportunity.customCover;
  }
  if (opportunity.coverPreset && PRESET_BY_KEY.has(opportunity.coverPreset)) {
    return coverUrlForKey(opportunity.coverPreset);
  }
  return coverUrlForKey(defaultCoverKeyForFields(opportunity.fields));
}
