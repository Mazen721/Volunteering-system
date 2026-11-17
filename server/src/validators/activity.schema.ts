import { z } from 'zod';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from '../constants/enums.js';

function isNotFutureDate(date: Date): boolean {
  const endOfTodayUtc = new Date();
  endOfTodayUtc.setUTCHours(23, 59, 59, 999);
  return date.getTime() <= endOfTodayUtc.getTime();
}

export const activitySchema = z.object({
  volunteerId: z
    .string({ error: 'الرقم التعريفي للمتطوع مطلوب' })
    .trim()
    .min(1, 'الرقم التعريفي للمتطوع مطلوب'),
  title: z
    .string({ error: 'عنوان النشاط مطلوب' })
    .trim()
    .min(2, 'عنوان النشاط يجب أن لا يقل عن حرفين'),
  type: z.enum(ACTIVITY_TYPES, { error: 'نوع النشاط غير صالح' }),
  hours: z.number({ error: 'عدد الساعات يجب أن يكون رقماً' }).positive('عدد الساعات يجب أن يكون أكبر من صفر'),
  date: z.coerce
    .date({ error: 'تاريخ النشاط غير صالح' })
    .refine(isNotFutureDate, 'لا يمكن تسجيل تاريخ نشاط في المستقبل'),
  status: z.enum(ACTIVITY_STATUSES, { error: 'حالة الاعتماد غير صالحة' }).default('pending'),
  supervisor: z.string({ error: 'اسم مشرف النشاط مطلوب' }).trim().min(2, 'اسم مشرف النشاط مطلوب'),
});

export const activityUpdateSchema = activitySchema
  .omit({ volunteerId: true })
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  });

export const activityStatusSchema = z.object({
  status: z.enum(ACTIVITY_STATUSES, { error: 'حالة الاعتماد غير صالحة' }),
});

export type ActivityInput = z.infer<typeof activitySchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
export type ActivityStatusInput = z.infer<typeof activityStatusSchema>;
