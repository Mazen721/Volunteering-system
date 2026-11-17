import { z } from 'zod';
import { CATEGORIES, FACULTIES } from '../constants/enums.js';

export const volunteerSchema = z.object({
  volunteerId: z
    .string({ error: 'الرقم التعريفي للمتطوع مطلوب' })
    .trim()
    .min(1, 'الرقم التعريفي للمتطوع مطلوب'),
  fullName: z
    .string({ error: 'اسم المتطوع مطلوب' })
    .trim()
    .min(2, 'اسم المتطوع يجب أن لا يقل عن حرفين'),
  category: z.enum(CATEGORIES, { error: 'فئة المتطوع غير صالحة' }),
  faculty: z.enum(FACULTIES, { error: 'الكلية المختارة غير صالحة' }),
});

export const volunteerUpdateSchema = volunteerSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  });

export type VolunteerInput = z.infer<typeof volunteerSchema>;
export type VolunteerUpdateInput = z.infer<typeof volunteerUpdateSchema>;
