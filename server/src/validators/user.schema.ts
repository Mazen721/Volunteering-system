import { z } from 'zod';
import { FACULTIES } from '../constants/enums.js';

export const createDeanSchema = z.object({
  email: z
    .string({ error: 'البريد الإلكتروني مطلوب' })
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح')
    .transform((email) => email.toLowerCase()),
  fullName: z
    .string({ error: 'الاسم الكامل مطلوب' })
    .trim()
    .min(2, 'الاسم الكامل يجب أن لا يقل عن حرفين'),
  faculty: z.enum(FACULTIES, { error: 'الكلية المختارة غير صالحة' }),
  password: z.string({ error: 'كلمة المرور مطلوبة' }).min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف'),
});

export const updateUserSchema = z
  .object({
    status: z.enum(['active', 'disabled'], { error: 'حالة الحساب غير صالحة' }).optional(),
    fullName: z
      .string({ error: 'الاسم الكامل غير صالح' })
      .trim()
      .min(2, 'الاسم الكامل يجب أن لا يقل عن حرفين')
      .optional(),
    faculty: z.enum(FACULTIES, { error: 'الكلية المختارة غير صالحة' }).optional(),
    temporaryPassword: z
      .string({ error: 'كلمة المرور المؤقتة غير صالحة' })
      .min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف')
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  });

export type CreateDeanInput = z.infer<typeof createDeanSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
