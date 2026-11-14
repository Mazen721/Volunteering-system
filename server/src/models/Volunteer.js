import mongoose from 'mongoose';
import { CATEGORIES, FACULTIES } from '../constants/enums.js';

const volunteerSchema = new mongoose.Schema(
  {
    volunteerId: {
      type: String,
      required: [true, 'الرقم التعريفي للمتطوع مطلوب'],
      unique: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: [true, 'اسم المتطوع مطلوب'],
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: CATEGORIES,
        message: 'فئة المتطوع غير صالحة',
      },
      required: [true, 'فئة المتطوع مطلوبة'],
    },
    faculty: {
      type: String,
      enum: {
        values: FACULTIES,
        message: 'الكلية المختارة غير صالحة',
      },
      required: [true, 'الكلية مطلوبة'],
    },
  },
  { timestamps: true }
);

volunteerSchema.index({ category: 1, faculty: 1 });

export const Volunteer = mongoose.model('Volunteer', volunteerSchema);
