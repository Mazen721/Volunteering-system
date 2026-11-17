import mongoose from 'mongoose';
import type {
  Faculty,
  InterestKey,
  UserRole,
  UserStatus,
  VolunteerCategory,
} from '../constants/enums.js';
import {
  CATEGORIES,
  FACULTIES,
  INTEREST_KEYS,
  USER_ROLES,
  USER_STATUSES,
} from '../constants/enums.js';

export interface RegistrationSnapshot {
  volunteerId: string;
  category: VolunteerCategory;
  faculty: Faculty;
  facultyMismatch: boolean;
}

export interface UserDoc {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  faculty: Faculty | null;
  status: UserStatus;
  volunteer: mongoose.Types.ObjectId | null;
  registration: RegistrationSnapshot | null;
  interests: InterestKey[];
  approvedBy: mongoose.Types.ObjectId | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  lastLoginAt: Date | null;
}

export interface UserLean extends UserDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const registrationSchema = new mongoose.Schema<RegistrationSnapshot>(
  {
    volunteerId: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: [...CATEGORIES],
        message: 'فئة المتطوع غير صالحة',
      },
      required: true,
    },
    faculty: {
      type: String,
      enum: {
        values: [...FACULTIES],
        message: 'الكلية المختارة غير صالحة',
      },
      required: true,
    },
    facultyMismatch: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema<UserDoc>(
  {
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
    },
    fullName: {
      type: String,
      required: [true, 'الاسم الكامل مطلوب'],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: [...USER_ROLES],
        message: 'نوع الحساب غير صالح',
      },
      required: [true, 'نوع الحساب مطلوب'],
    },
    faculty: {
      type: String,
      default: null,
      validate: {
        validator: (value: string | null) =>
          value === null || (FACULTIES as readonly string[]).includes(value),
        message: 'الكلية المختارة غير صالحة',
      },
    },
    status: {
      type: String,
      enum: {
        values: [...USER_STATUSES],
        message: 'حالة الحساب غير صالحة',
      },
      default: 'pending',
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Volunteer',
      default: null,
    },
    registration: {
      type: registrationSchema,
      default: null,
    },
    interests: {
      type: [
        {
          type: String,
          enum: {
            values: [...INTEREST_KEYS],
            message: 'مجال الاهتمام غير صالح',
          },
        },
      ],
      default: [],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Partial unique indexes ignore null values so multiple pending/admin users can coexist.
userSchema.index(
  { volunteer: 1 },
  { unique: true, partialFilterExpression: { volunteer: { $type: 'objectId' } } }
);
userSchema.index(
  { 'registration.volunteerId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'registration.volunteerId': { $type: 'string' },
      status: { $in: ['pending', 'active', 'disabled'] },
    },
  }
);
userSchema.index({ role: 1, status: 1, faculty: 1 });

export const User = mongoose.model<UserDoc>('User', userSchema);
