import mongoose from 'mongoose';
import type {
  ApplicationStatus,
  Faculty,
  VolunteerCategory,
} from '../constants/enums.js';
import { APPLICATION_STATUSES, CATEGORIES, FACULTIES } from '../constants/enums.js';
import type { VolunteerLean } from './Volunteer.js';

export interface ApplicationDoc {
  opportunity: mongoose.Types.ObjectId;
  volunteer: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  faculty: Faculty;
  category: VolunteerCategory;
  status: ApplicationStatus;
  note: string;
  decidedBy: mongoose.Types.ObjectId | null;
  decidedAt: Date | null;
  attended: boolean;
  checkedInAt: Date | null;
  hoursGranted: number;
  appliedAt: Date;
}

export interface ApplicationLean extends ApplicationDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationWithVolunteerLean extends Omit<ApplicationLean, 'volunteer'> {
  volunteer: VolunteerLean;
}

const applicationSchema = new mongoose.Schema<ApplicationDoc>(
  {
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: [true, 'الفرصة التطوعية مطلوبة'],
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Volunteer',
      required: [true, 'المتطوع مطلوب'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'حساب المستخدم مطلوب'],
    },
    faculty: {
      type: String,
      enum: {
        values: [...FACULTIES],
        message: 'الكلية غير صالحة',
      },
      required: [true, 'الكلية مطلوبة'],
    },
    category: {
      type: String,
      enum: {
        values: [...CATEGORIES],
        message: 'فئة المتطوع غير صالحة',
      },
      required: [true, 'فئة المتطوع مطلوبة'],
    },
    status: {
      type: String,
      enum: {
        values: [...APPLICATION_STATUSES],
        message: 'حالة الطلب غير صالحة',
      },
      required: [true, 'حالة الطلب مطلوبة'],
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    attended: {
      type: Boolean,
      default: false,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    hoursGranted: {
      type: Number,
      default: 0,
      min: 0,
    },
    appliedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { timestamps: true }
);

applicationSchema.index({ opportunity: 1, volunteer: 1 }, { unique: true });
applicationSchema.index({ opportunity: 1, status: 1, category: 1, appliedAt: 1 });
applicationSchema.index({ faculty: 1, status: 1 });
applicationSchema.index({ volunteer: 1, status: 1 });

export const Application = mongoose.model<ApplicationDoc>('Application', applicationSchema);
