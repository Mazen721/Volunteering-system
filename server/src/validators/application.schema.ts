import { z } from 'zod';
import { APPLICATION_STATUSES } from '../constants/enums.js';

const DECISION_STATUSES = ['accepted', 'rejected', 'waitlisted'] as const;

export const applicationApplySchema = z.object({
  note: z
    .string({ error: 'الملاحظة غير صالحة' })
    .trim()
    .max(500, 'الملاحظة يجب أن لا تتجاوز 500 حرف')
    .optional()
    .default(''),
});

export const applicationDecisionSchema = z.object({
  status: z.enum(DECISION_STATUSES, { error: 'حالة الطلب غير صالحة' }),
});

export const applicationListQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES, { error: 'حالة الطلب غير صالحة' }).optional(),
  category: z.enum(['student', 'academic', 'admin'], { error: 'فئة المتطوع غير صالحة' }).optional(),
});

export const checkInSubmitSchema = z.object({
  token: z.string({ error: 'رمز الحضور مطلوب' }).trim().min(1, 'رمز الحضور مطلوب'),
});

export const manualCheckInSchema = z.object({
  applicationId: z.string({ error: 'معرف الطلب مطلوب' }).trim().min(1, 'معرف الطلب مطلوب'),
  attended: z.boolean({ error: 'حالة الحضور مطلوبة' }),
});

export const assignDeputySchema = z.object({
  deputyUserId: z
    .string({ error: 'معرف مسؤول الحضور غير صالح' })
    .trim()
    .min(1, 'معرف مسؤول الحضور غير صالح')
    .nullable(),
});

export type ApplicationApplyInput = z.infer<typeof applicationApplySchema>;
export type ApplicationDecisionStatus = (typeof DECISION_STATUSES)[number];
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;
export type CheckInSubmitInput = z.infer<typeof checkInSubmitSchema>;
export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>;
export type AssignDeputyInput = z.infer<typeof assignDeputySchema>;
