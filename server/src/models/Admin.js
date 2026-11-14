import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

export const Admin = mongoose.model('Admin', adminSchema);
