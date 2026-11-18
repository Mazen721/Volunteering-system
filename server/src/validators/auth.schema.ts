import { z } from 'zod';
import { CATEGORIES, FACULTIES, INTEREST_KEYS } from '../constants/enums.js';

export const loginSchema = z.object({
  email: z
    .string({ error: 'البريد الإلكتروني مطلوب' })
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح'),
  password: z.string({ error: 'كلمة المرور مطلوبة' }).min(1, 'كلمة المرور مطلوبة'),
});

export const registerSchema = z.object({
  email: z
    .string({ error: 'البريد الإلكتروني مطلوب' })
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح')
    .transform((email) => email.toLowerCase()),
  password: z.string({ error: 'كلمة المرور مطلوبة' }).min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف'),
  fullName: z
    .string({ error: 'الاسم الكامل مطلوب' })
    .trim()
    .min(2, 'الاسم الكامل يجب أن لا يقل عن حرفين'),
  volunteerId: z
    .string({ error: 'الرقم التعريفي للمتطوع مطلوب' })
    .trim()
    .min(1, 'الرقم التعريفي للمتطوع مطلوب'),
  category: z.enum(CATEGORIES, { error: 'فئة المتطوع غير صالحة' }),
  faculty: z.enum(FACULTIES, { error: 'الكلية المختارة غير صالحة' }),
  interests: z
    .array(z.enum(INTEREST_KEYS, { error: 'مجال الاهتمام غير صالح' }), {
      error: 'يرجى اختيار مجال اهتمام واحد على الأقل',
    })
    .min(1, 'يرجى اختيار مجال اهتمام واحد على الأقل')
    .transform((interests) => Array.from(new Set(interests))),
});

export const updateProfileSchema = z
  .object({
    interests: z
      .array(z.enum(INTEREST_KEYS, { error: 'مجال الاهتمام غير صالح' }), {
        error: 'يرجى اختيار مجال اهتمام واحد على الأقل',
      })
      .min(1, 'يرجى اختيار مجال اهتمام واحد على الأقل')
      .transform((interests) => Array.from(new Set(interests)))
      .optional(),
    currentPassword: z.string({ error: 'كلمة المرور الحالية مطلوبة' }).optional(),
    newPassword: z
      .string({ error: 'كلمة المرور الجديدة مطلوبة' })
      .min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف')
      .optional(),
  })
  .superRefine((values, context) => {
    if (values.newPassword && !values.currentPassword) {
      context.addIssue({
        code: 'custom',
        path: ['currentPassword'],
        message: 'كلمة المرور الحالية مطلوبة',
      });
    }
    if (values.currentPassword && !values.newPassword) {
      context.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'كلمة المرور الجديدة مطلوبة',
      });
    }
    if (values.interests === undefined && !values.newPassword) {
      context.addIssue({
        code: 'custom',
        message: 'لا توجد بيانات للتحديث',
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
