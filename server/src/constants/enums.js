export const FACULTIES = [
  'كلية الطب البشري',
  'كلية طب الأسنان',
  'كلية الصيدلة',
  'كلية الهندسة',
  'كلية تكنولوجيا العلوم الصحية',
  'كلية الاقتصاد والعلوم الإدارية',
  'كلية التمريض',
];

export const CATEGORIES = ['student', 'academic', 'admin'];

export const CATEGORY_LABELS = {
  student: 'الطلاب',
  academic: 'أعضاء الكادر الأكاديمي',
  admin: 'أعضاء الجهاز الإداري',
};

export const CATEGORY_FROM_AR = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([key, label]) => [label, key])
);

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
];

export const ACTIVITY_STATUSES = ['approved', 'pending', 'rejected'];

export const STATUS_LABELS = {
  approved: 'معتمد',
  pending: 'قيد المراجعة',
  rejected: 'مرفوض',
};

export const STATUS_FROM_AR = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([key, label]) => [label, key])
);

export const DEFAULT_CERTIFICATE_HOURS = 30;
