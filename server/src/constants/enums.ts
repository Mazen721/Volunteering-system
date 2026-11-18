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
