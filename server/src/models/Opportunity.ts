import mongoose from 'mongoose';
import type {
  ActivityType,
  ApprovalMode,
  Faculty,
  InterestKey,
  OpportunityStatus,
} from '../constants/enums.js';
import {
  ACTIVITY_TYPES,
  APPROVAL_MODES,
  CATEGORIES,
  COVER_PRESET_KEYS,
  CUSTOM_COVER_DATA_URL_PATTERN,
  CUSTOM_COVER_MAX_LENGTH,
  FACULTIES,
  INTEREST_KEYS,
  OPPORTUNITY_STATUSES,
} from '../constants/enums.js';
import type { CoverPresetKey } from '../constants/enums.js';

export interface CategoryCounts {
  student: number;
  academic: number;
  admin: number;
}

export interface OpportunityLocation {
  name: string;
  address: string;
  mapUrl?: string;
}

export interface OpportunityDoc {
  title: string;
  description: string;
  requirements: string;
  coverPreset: CoverPresetKey | '';
  customCover: string;
  fields: InterestKey[];
  activityType: ActivityType;
  location: OpportunityLocation;
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
  hours: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  faculty: Faculty | null;
  slots: CategoryCounts;
  acceptedCounts: CategoryCounts;
  approvalMode: ApprovalMode;
  status: OpportunityStatus;
  createdBy: mongoose.Types.ObjectId;
  attendanceDeputy: mongoose.Types.ObjectId | null;
}

export interface OpportunityLean extends OpportunityDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns a fresh zeroed category-count object for slots and accepted counters.
 */
export function createEmptyCategoryCounts(): CategoryCounts {
  return { student: 0, academic: 0, admin: 0 };
}

/**
 * Indicates whether at least one affiliation category has a positive slot allocation.
 */
export function hasPositiveSlot(slots: CategoryCounts): boolean {
  return CATEGORIES.some((category) => Number(slots[category]) > 0);
}

const categoryCountsSchema = new mongoose.Schema<CategoryCounts>(
  {
    student: { type: Number, required: true, min: 0, default: 0 },
    academic: { type: Number, required: true, min: 0, default: 0 },
    admin: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema<OpportunityLocation>(
  {
    name: {
      type: String,
      required: [true, 'اسم موقع الفرصة مطلوب'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'عنوان موقع الفرصة مطلوب'],
      trim: true,
    },
    mapUrl: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const opportunitySchema = new mongoose.Schema<OpportunityDoc>(
  {
    title: {
      type: String,
      required: [true, 'عنوان الفرصة التطوعية مطلوب'],
      trim: true,
      minlength: [3, 'عنوان الفرصة يجب أن لا يقل عن 3 أحرف'],
    },
    description: {
      type: String,
      required: [true, 'وصف الفرصة التطوعية مطلوب'],
      trim: true,
    },
    requirements: {
      type: String,
      default: '',
      trim: true,
    },
    fields: {
      type: [
        {
          type: String,
          enum: {
            values: [...INTEREST_KEYS],
            message: 'مجال الاهتمام غير صالح',
          },
        },
      ],
      required: [true, 'يجب اختيار مجال اهتمام واحد على الأقل'],
      validate: {
        validator: (fields: InterestKey[]) => Array.isArray(fields) && fields.length > 0,
        message: 'يجب اختيار مجال اهتمام واحد على الأقل',
      },
    },
    coverPreset: {
      type: String,
      enum: {
        values: [...COVER_PRESET_KEYS, ''],
        message: 'صورة الغلاف غير صالحة',
      },
      default: '',
    },
    customCover: {
      type: String,
      default: '',
      maxlength: [CUSTOM_COVER_MAX_LENGTH, 'صورة الغلاف المرفوعة أكبر من الحد المسموح'],
      validate: {
        validator: (value: string) => value === '' || CUSTOM_COVER_DATA_URL_PATTERN.test(value),
        message: 'صورة الغلاف المرفوعة غير صالحة',
      },
    },
    activityType: {
      type: String,
      enum: {
        values: [...ACTIVITY_TYPES],
        message: 'نوع النشاط غير صالح',
      },
      required: [true, 'نوع النشاط مطلوب'],
    },
    location: {
      type: locationSchema,
      required: [true, 'موقع الفرصة مطلوب'],
    },
    startAt: {
      type: Date,
      required: [true, 'وقت بدء الفرصة مطلوب'],
    },
    endAt: {
      type: Date,
      required: [true, 'وقت انتهاء الفرصة مطلوب'],
      validate: {
        validator(endAt: Date) {
          const startAt = (this as unknown as OpportunityDoc).startAt;
          return !startAt || endAt.getTime() > startAt.getTime();
        },
        message: 'وقت الانتهاء يجب أن يكون بعد وقت البدء',
      },
    },
    registrationDeadline: {
      type: Date,
      required: [true, 'موعد غلق التسجيل مطلوب'],
      validate: {
        validator(deadline: Date) {
          const startAt = (this as unknown as OpportunityDoc).startAt;
          return !startAt || deadline.getTime() <= startAt.getTime();
        },
        message: 'موعد غلق التسجيل يجب أن يكون قبل أو يساوي وقت البدء',
      },
    },
    hours: {
      type: Number,
      required: [true, 'عدد ساعات الفرصة مطلوب'],
      validate: {
        validator: (hours: number) => Number.isFinite(hours) && hours > 0,
        message: 'عدد الساعات يجب أن يكون أكبر من صفر',
      },
    },
    contactName: {
      type: String,
      required: [true, 'اسم مسؤول التواصل مطلوب'],
      trim: true,
    },
    contactPhone: {
      type: String,
      required: [true, 'رقم التواصل مطلوب'],
      trim: true,
    },
    contactEmail: {
      type: String,
      required: [true, 'البريد الإلكتروني للتواصل مطلوب'],
      trim: true,
      lowercase: true,
    },
    faculty: {
      type: String,
      default: null,
      validate: {
        validator: (value: string | null) =>
          value === null || (FACULTIES as readonly string[]).includes(value),
        message: 'الكلية المستهدفة غير صالحة',
      },
    },
    slots: {
      type: categoryCountsSchema,
      required: [true, 'مقاعد الفئات مطلوبة'],
      validate: {
        validator: (slots: CategoryCounts) => hasPositiveSlot(slots),
        message: 'يجب تخصيص مقعد واحد على الأقل لإحدى الفئات',
      },
    },
    acceptedCounts: {
      type: categoryCountsSchema,
      default: () => ({ student: 0, academic: 0, admin: 0 }),
    },
    approvalMode: {
      type: String,
      enum: {
        values: [...APPROVAL_MODES],
        message: 'طريقة القبول غير صالحة',
      },
      required: [true, 'طريقة القبول مطلوبة'],
    },
    status: {
      type: String,
      enum: {
        values: [...OPPORTUNITY_STATUSES],
        message: 'حالة الفرصة غير صالحة',
      },
      default: 'draft',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attendanceDeputy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

opportunitySchema.index({ status: 1, faculty: 1, startAt: 1 });
opportunitySchema.index({ createdBy: 1, status: 1 });
// Action-items scan published opportunities by endAt (ended backlog and the
// not-yet-ended pending candidates) and sort on it.
opportunitySchema.index({ status: 1, endAt: -1 });
// The board's interest filter (?field=) matches inside the fields array.
opportunitySchema.index({ fields: 1 });
// "Opportunities where I am the attendance deputy" lookups (sparse: most
// opportunities never appoint one, so the index stays tiny).
opportunitySchema.index({ attendanceDeputy: 1 }, { sparse: true });

export const Opportunity = mongoose.model<OpportunityDoc>('Opportunity', opportunitySchema);
