import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ error: 'البريد الإلكتروني مطلوب' })
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح'),
  password: z.string({ error: 'كلمة المرور مطلوبة' }).min(1, 'كلمة المرور مطلوبة'),
});
