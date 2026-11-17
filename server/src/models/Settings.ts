import mongoose from 'mongoose';
import { DEFAULT_CERTIFICATE_HOURS } from '../constants/enums.js';

export interface SettingsDoc {
  key: string;
  certificateHours: number;
}

export interface SettingsLean extends SettingsDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new mongoose.Schema<SettingsDoc>(
  {
    key: {
      type: String,
      unique: true,
      default: 'global',
    },
    certificateHours: {
      type: Number,
      required: [true, 'عدد ساعات الشهادة مطلوب'],
      min: [1, 'عدد ساعات الشهادة يجب أن يكون ساعة واحدة على الأقل'],
      default: DEFAULT_CERTIFICATE_HOURS,
    },
  },
  { timestamps: true }
);

export const Settings = mongoose.model<SettingsDoc>('Settings', settingsSchema);
