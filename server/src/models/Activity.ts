import mongoose from 'mongoose';
import type { ActivityStatus, ActivityType } from '../constants/enums.js';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from '../constants/enums.js';
import type { VolunteerLean } from './Volunteer.js';

export interface ActivityDoc {
  volunteer: mongoose.Types.ObjectId;
  title: string;
  type: ActivityType;
  hours: number;
  date: Date;
  status: ActivityStatus;
  supervisor: string;
  opportunity?: mongoose.Types.ObjectId | null;
  application?: mongoose.Types.ObjectId | null;
}

export interface ActivityLean extends ActivityDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityWithVolunteerLean extends Omit<ActivityLean, 'volunteer'> {
  volunteer: VolunteerLean;
}

const activitySchema = new mongoose.Schema<ActivityDoc>(
  {
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Volunteer',
      required: [true, 'المتطوع مطلوب'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان النشاط مطلوب'],
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: [...ACTIVITY_TYPES],
        message: 'نوع النشاط غير صالح',
      },
      required: [true, 'نوع النشاط مطلوب'],
    },
    hours: {
      type: Number,
      required: [true, 'عدد الساعات مطلوب'],
      validate: {
        validator: (hours: number) => Number.isFinite(hours) && hours > 0,
        message: 'عدد الساعات يجب أن يكون أكبر من صفر',
      },
    },
    date: {
      type: Date,
      required: [true, 'تاريخ النشاط مطلوب'],
    },
    status: {
      type: String,
      enum: {
        values: [...ACTIVITY_STATUSES],
        message: 'حالة الاعتماد غير صالحة',
      },
      default: 'pending',
      index: true,
    },
    supervisor: {
      type: String,
      required: [true, 'اسم مشرف النشاط مطلوب'],
      trim: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      default: null,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
    },
  },
  { timestamps: true }
);

activitySchema.index({ volunteer: 1, title: 1, date: 1 });
// Partial unique index guarantees idempotent hour crediting per application while allowing manual activities with null.
activitySchema.index(
  { application: 1 },
  { unique: true, partialFilterExpression: { application: { $type: 'objectId' } } }
);

export const Activity = mongoose.model<ActivityDoc>('Activity', activitySchema);
