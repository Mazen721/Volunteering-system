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
