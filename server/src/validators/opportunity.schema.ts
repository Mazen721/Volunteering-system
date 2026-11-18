import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  APPROVAL_MODES,
  CATEGORIES,
  FACULTIES,
  INTEREST_KEYS,
} from '../constants/enums.js';
import { parseCairoDateTime } from '../utils/cairoTime.js';

/**
 * Parses timezone-less wall-clock strings as Africa/Cairo time and rejects invalid dates.
 */
function cairoDateSchema(message: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? parseCairoDateTime(value) : value),
    z
      .date({ error: message })
      .refine((date) => !Number.isNaN(date.getTime()), { message })
  );
}

const locationSchema = z.object({
  name: z
    .string({ error: 'اسم موقع الفرصة مطلوب' })
    .trim()
    .min(2, 'اسم موقع الفرصة يجب أن لا يقل عن حرفين'),
  address: z
    .string({ error: 'عنوان موقع الفرصة مطلوب' })
    .trim()
    .min(3, 'عنوان موقع الفرصة يجب أن لا يقل عن 3 أحرف'),
  mapUrl: z
    .string()
    .trim()
    .url('رابط الخريطة غير صالح')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
});

const slotCountFields = {
  student: z
    .number({ error: 'عدد مقاعد الطلاب مطلوب' })
    .int('عدد المقاعد يجب أن يكون عدداً صحيحاً')
    .min(0, 'عدد المقاعد لا يمكن أن يكون سالباً'),
  academic: z
    .number({ error: 'عدد مقاعد الكادر الأكاديمي مطلوب' })
    .int('عدد المقاعد يجب أن يكون عدداً صحيحاً')
    .min(0, 'عدد المقاعد لا يمكن أن يكون سالباً'),
  admin: z
    .number({ error: 'عدد مقاعد الجهاز الإداري مطلوب' })
    .int('عدد المقاعد يجب أن يكون عدداً صحيحاً')
    .min(0, 'عدد المقاعد لا يمكن أن يكون سالباً'),
};

const slotCountsSchema = z.object(slotCountFields);

const slotCountsCreateSchema = z.object({
  student: slotCountFields.student.default(0),
  academic: slotCountFields.academic.default(0),
  admin: slotCountFields.admin.default(0),
});

const slotCountsUpdateSchema = z
  .object({
    student: slotCountFields.student.optional(),
    academic: slotCountFields.academic.optional(),
    admin: slotCountFields.admin.optional(),
  })
  .refine((slots) => Object.keys(slots).length > 0, {
    message: 'يجب إرسال فئة واحدة على الأقل من المقاعد',
  });

const opportunityFieldsSchema = z.object({
  title: z
    .string({ error: 'عنوان الفرصة التطوعية مطلوب' })
    .trim()
    .min(3, 'عنوان الفرصة يجب أن لا يقل عن 3 أحرف'),
  description: z
    .string({ error: 'وصف الفرصة التطوعية مطلوب' })
    .trim()
    .min(10, 'وصف الفرصة يجب أن لا يقل عن 10 أحرف'),
  requirements: z.string().trim(),
  fields: z
    .array(z.enum(INTEREST_KEYS, { error: 'مجال الاهتمام غير صالح' }), {
      error: 'يجب اختيار مجال اهتمام واحد على الأقل',
    })
    .min(1, 'يجب اختيار مجال اهتمام واحد على الأقل')
    .transform((fields) => Array.from(new Set(fields))),
  activityType: z.enum(ACTIVITY_TYPES, { error: 'نوع النشاط غير صالح' }),
  location: locationSchema,
  startAt: cairoDateSchema('وقت بدء الفرصة غير صالح'),
  endAt: cairoDateSchema('وقت انتهاء الفرصة غير صالح'),
  registrationDeadline: cairoDateSchema('موعد غلق التسجيل غير صالح'),
  hours: z
    .number({ error: 'عدد ساعات الفرصة يجب أن يكون رقماً' })
    .positive('عدد الساعات يجب أن يكون أكبر من صفر'),
  contactName: z
    .string({ error: 'اسم مسؤول التواصل مطلوب' })
    .trim()
    .min(2, 'اسم مسؤول التواصل يجب أن لا يقل عن حرفين'),
  contactPhone: z
    .string({ error: 'رقم التواصل مطلوب' })
    .trim()
    .min(5, 'رقم التواصل غير صالح'),
  contactEmail: z
    .string({ error: 'البريد الإلكتروني للتواصل مطلوب' })
    .trim()
    .email('البريد الإلكتروني للتواصل غير صالح')
    .transform((email) => email.toLowerCase()),
  faculty: z.enum(FACULTIES, { error: 'الكلية المستهدفة غير صالحة' }).nullable(),
  slots: slotCountsSchema,
  approvalMode: z.enum(APPROVAL_MODES, { error: 'طريقة القبول غير صالحة' }),
});

function hasPositiveSlot(slots: { student: number; academic: number; admin: number }): boolean {
  return CATEGORIES.some((category) => slots[category] > 0);
}

interface OpportunitySchedulePayload {
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
}

function validateSchedule(payload: OpportunitySchedulePayload, context: z.RefinementCtx): void {
  if (payload.endAt.getTime() <= payload.startAt.getTime()) {
    context.addIssue({
      code: 'custom',
      path: ['endAt'],
      message: 'وقت الانتهاء يجب أن يكون بعد وقت البدء',
    });
  }
  if (payload.registrationDeadline.getTime() > payload.startAt.getTime()) {
    context.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'موعد غلق التسجيل يجب أن يكون قبل أو يساوي وقت البدء',
    });
  }
}

export const opportunitySchema = opportunityFieldsSchema
  .extend({
    requirements: z.string().trim().default(''),
    faculty: z
      .enum(FACULTIES, { error: 'الكلية المستهدفة غير صالحة' })
      .nullable()
      .default(null),
    slots: slotCountsCreateSchema,
  })
  .superRefine((payload, context) => {
    validateSchedule(payload, context);
    if (!hasPositiveSlot(payload.slots)) {
      context.addIssue({
        code: 'custom',
        path: ['slots'],
        message: 'يجب تخصيص مقعد واحد على الأقل لإحدى الفئات',
      });
    }
  });

export const opportunityUpdateSchema = opportunityFieldsSchema
  .extend({ slots: slotCountsUpdateSchema })
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  })
  .superRefine((payload, context) => {
    if (payload.startAt && payload.endAt && payload.endAt <= payload.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'وقت الانتهاء يجب أن يكون بعد وقت البدء',
      });
    }
    if (payload.startAt && payload.registrationDeadline && payload.registrationDeadline > payload.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['registrationDeadline'],
        message: 'موعد غلق التسجيل يجب أن يكون قبل أو يساوي وقت البدء',
      });
    }
  });

export type OpportunityInput = z.infer<typeof opportunitySchema>;
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;
export type OpportunityLocationInput = z.infer<typeof locationSchema>;
