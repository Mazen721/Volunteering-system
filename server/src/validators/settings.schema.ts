import { z } from 'zod';

export const updateSettingsSchema = z.object({
  certificateHours: z
    .number({ error: 'عدد ساعات الشهادة مطلوب' })
    .finite('عدد ساعات الشهادة غير صالح')
    .min(1, 'عدد ساعات الشهادة يجب أن يكون ساعة واحدة على الأقل'),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
