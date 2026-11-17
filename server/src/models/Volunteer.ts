import mongoose from 'mongoose';
import type { Faculty, VolunteerCategory } from '../constants/enums.js';
import { CATEGORIES, FACULTIES } from '../constants/enums.js';

export interface VolunteerDoc {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
}

export interface VolunteerLean extends VolunteerDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface VolunteerFilter {
  _id?: mongoose.Types.ObjectId;
  volunteerId?: string | RegExp;
  fullName?: string | RegExp;
  category?: VolunteerCategory;
  faculty?: Faculty | RegExp;
  $or?: VolunteerFilter[];
}

const volunteerSchema = new mongoose.Schema<VolunteerDoc>(
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
        values: [...CATEGORIES],
        message: 'فئة المتطوع غير صالحة',
      },
      required: [true, 'فئة المتطوع مطلوبة'],
    },
    faculty: {
      type: String,
      enum: {
        values: [...FACULTIES],
        message: 'الكلية المختارة غير صالحة',
      },
      required: [true, 'الكلية مطلوبة'],
    },
  },
  { timestamps: true }
);

volunteerSchema.index({ category: 1, faculty: 1 });

export const Volunteer = mongoose.model<VolunteerDoc>('Volunteer', volunteerSchema);
