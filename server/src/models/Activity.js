import mongoose from 'mongoose';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from '../constants/enums.js';

const activitySchema = new mongoose.Schema(
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
        values: ACTIVITY_TYPES,
        message: 'نوع النشاط غير صالح',
      },
      required: [true, 'نوع النشاط مطلوب'],
    },
    hours: {
      type: Number,
      required: [true, 'عدد الساعات مطلوب'],
      validate: {
        validator: (hours) => Number.isFinite(hours) && hours > 0,
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
        values: ACTIVITY_STATUSES,
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
  },
  { timestamps: true }
);

activitySchema.index({ volunteer: 1, title: 1, date: 1 });

export const Activity = mongoose.model('Activity', activitySchema);
