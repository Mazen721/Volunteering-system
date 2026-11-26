import mongoose from 'mongoose';

export type NotificationType = 'absence_warning';

export interface NotificationDoc {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  opportunity: mongoose.Types.ObjectId | null;
  read: boolean;
  readAt: Date | null;
}

export interface NotificationLean extends NotificationDoc {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new mongoose.Schema<NotificationDoc>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'حساب المستلم مطلوب'],
      index: true,
    },
    type: {
      type: String,
      enum: { values: ['absence_warning'], message: 'نوع الإشعار غير صالح' },
      required: [true, 'نوع الإشعار مطلوب'],
    },
    title: {
      type: String,
      required: [true, 'عنوان الإشعار مطلوب'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'نص الإشعار مطلوب'],
      trim: true,
    },
    link: {
      type: String,
      default: null,
      trim: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.model<NotificationDoc>('Notification', notificationSchema);
