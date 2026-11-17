import { z } from 'zod';
import { FACULTIES } from '../constants/enums.js';

export const approveRegistrationSchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z.object({
    facultyOverride: z.enum(FACULTIES, { error: 'الكلية المختارة غير صالحة' }).optional(),
  })
);

export const rejectRegistrationSchema = z.object({
  rejectionReason: z
    .string({ error: 'سبب الرفض مطلوب' })
    .trim()
    .min(3, 'سبب الرفض يجب أن لا يقل عن 3 أحرف'),
});

export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;
export type RejectRegistrationInput = z.infer<typeof rejectRegistrationSchema>;
