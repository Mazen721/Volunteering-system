export const FACULTIES = [
  'كلية الطب البشري',
  'كلية طب الأسنان',
  'كلية الصيدلة',
  'كلية الهندسة',
  'كلية تكنولوجيا العلوم الصحية',
  'كلية الاقتصاد والعلوم الإدارية',
  'كلية التمريض',
] as const;

export type Faculty = (typeof FACULTIES)[number];

export const CATEGORIES = ['student', 'academic', 'admin'] as const;

export type VolunteerCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<VolunteerCategory, string> = {
  student: 'الطلاب',
  academic: 'أعضاء الكادر الأكاديمي',
  admin: 'أعضاء الجهاز الإداري',
};

export const CATEGORY_FROM_AR: Record<string, VolunteerCategory | undefined> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [label, key])
) as Record<string, VolunteerCategory | undefined>;

export const ACTIVITY_TYPES = [
  'قافلة',
  'مبادرة',
  'ندوة',
  'حملة توعية',
  'ورشة عمل',
  'دورة تدريبية',
  'مؤتمر مجتمعي',
  'زيارة ميدانية',
  'برنامج تأهيلي',
  'شراكات',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ['approved', 'pending', 'rejected'] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  approved: 'معتمد',
  pending: 'قيد المراجعة',
  rejected: 'مرفوض',
};

export const STATUS_FROM_AR: Record<string, ActivityStatus | undefined> = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([key, label]) => [label, key])
) as Record<string, ActivityStatus | undefined>;

export const USER_ROLES = ['admin', 'dean', 'student'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['pending', 'active', 'rejected', 'disabled'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const INTEREST_KEYS = [
  'medical',
  'agriculture_environment',
  'education',
  'charity_community',
  'technology',
  'sports',
  'arts_culture',
  'awareness_campaigns',
  'event_organizing',
] as const;

export type InterestKey = (typeof INTEREST_KEYS)[number];

export const INTEREST_LABELS: Record<InterestKey, string> = {
  medical: 'القطاع الطبي',
  agriculture_environment: 'الزراعة والبيئة',
  education: 'التعليم ومحو الأمية',
  charity_community: 'التكافل والعمل الخيري',
  technology: 'التكنولوجيا والتحول الرقمي',
  sports: 'الأنشطة الرياضية',
  arts_culture: 'الفنون والثقافة',
  awareness_campaigns: 'حملات التوعية',
  event_organizing: 'تنظيم الفعاليات',
};

/**
 * Preset cover photos an opportunity can carry. Keys are stable identifiers
 * stored on the opportunity; the client maps each key to a bundled photo.
 * Every interest field has at least one preset, plus a generic fallback.
 */
export const COVER_PRESET_KEYS = [
  'doctor-care',
  'dental-care',
  'medical-tablet',
  'gardening',
  'seedling',
  'classroom',
  'lecture-hall',
  'charity-boxes',
  'donation-hands',
  'volunteers-packing',
  'robotics',
  'graduation',
  'helping-hands',
  'blood-donation',
  'doctor-consult',
  'surgery-team',
  'blood-pressure',
  'tree-planting',
  'seedling-trays',
  'garden-tools',
  'school-class',
  'kids-classroom',
  'kids-drawing',
  'library-hall',
  'food-bank-packing',
  'food-bank-team',
  'clothing-drive',
  'happy-kids',
  'donation-coins',
  'reaching-hands',
  'coding-laptop',
  'code-screen',
  'engineer-lab',
  'students-laptops',
  'cycling-race',
  'fitness-class',
  'track-start',
  'soccer-ball',
  'runners-dusk',
  'art-mural',
  'paint-brushes',
  'concert-singer',
  'sheet-music',
  'painted-hands',
  'event-microphone',
  'conference-stage',
  'event-stage',
  'festival-confetti',
  'event-volunteer',
  'planning-workshop',
] as const;

/**
 * A custom cover photo uploaded by the opportunity creator, stored on the
 * document as a data URL. The client downscales before sending, so only
 * jpeg/png/webp data URLs up to ~1 MB of image data are accepted.
 */
export const CUSTOM_COVER_DATA_URL_PATTERN =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Max length of the whole data URL string (~1 MB of base64 image data). */
export const CUSTOM_COVER_MAX_LENGTH = 1_400_000;

export type CoverPresetKey = (typeof COVER_PRESET_KEYS)[number];

export const GENERIC_COVER_PRESET: CoverPresetKey = 'helping-hands';

/** The default cover preset for each interest field (its first preset). */
export const DEFAULT_COVER_PRESET_BY_FIELD: Record<InterestKey, CoverPresetKey> = {
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

/**
 * Resolves the cover preset an opportunity gets when none was chosen: the
 * default of its primary (first) field, or the generic volunteering photo.
 */
export function defaultCoverPreset(fields: readonly InterestKey[]): CoverPresetKey {
  const primary = fields[0];
  return primary ? DEFAULT_COVER_PRESET_BY_FIELD[primary] : GENERIC_COVER_PRESET;
}

export const OPPORTUNITY_STATUSES = ['draft', 'published', 'cancelled', 'completed'] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_PHASES = [
  'upcoming',
  'registration_closed',
  'in_progress',
  'ended',
] as const;

export type OpportunityPhase = (typeof OPPORTUNITY_PHASES)[number];

export const APPROVAL_MODES = ['auto', 'manual'] as const;

export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPLICATION_STATUSES = [
  'pending',
  'accepted',
  'waitlisted',
  'rejected',
  'cancelled',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DEFAULT_CERTIFICATE_HOURS = 30;
