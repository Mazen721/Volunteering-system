import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_PRESET_KEYS,
  DEFAULT_COVER_PRESET_BY_FIELD,
  GENERIC_COVER_PRESET,
  INTEREST_KEYS,
  defaultCoverPreset,
} from '../src/constants/enums.js';
import { opportunitySchema } from '../src/validators/opportunity.schema.js';

const basePayload = {
  title: 'فرصة تجريبية للغلاف',
  description: 'وصف تفصيلي لفرصة تجريبية لاختبار صور الغلاف',
  requirements: '',
  fields: ['medical'],
  activityType: 'قافلة',
  location: { name: 'مركز خدمة المجتمع', address: 'الحرم الجامعي' },
  startAt: '2026-12-10T09:00',
  endAt: '2026-12-10T13:00',
  registrationDeadline: '2026-12-09T09:00',
  hours: 4,
  contactName: 'مسؤول الفرصة',
  contactPhone: '01000000000',
  contactEmail: 'cover@mnu.edu.eg',
  faculty: null,
  slots: { student: 10, academic: 0, admin: 0 },
  approvalMode: 'auto',
};

describe('Phase 8 cover presets', () => {
  it('accepts_a_valid_cover_preset_key', () => {
    const parsed = opportunitySchema.safeParse({ ...basePayload, coverPreset: 'gardening' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.coverPreset, 'gardening');
    }
  });

  it('accepts_a_missing_cover_preset_so_the_service_can_default_it', () => {
    const parsed = opportunitySchema.safeParse(basePayload);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.coverPreset, undefined);
    }
  });

  it('rejects_an_unknown_cover_preset_key', () => {
    const parsed = opportunitySchema.safeParse({ ...basePayload, coverPreset: 'not-a-photo' });
    assert.equal(parsed.success, false);
  });

  it('defaults_to_the_primary_field_preset', () => {
    assert.equal(defaultCoverPreset(['technology']), 'robotics');
    assert.equal(defaultCoverPreset(['medical', 'education']), 'doctor-care');
    assert.equal(defaultCoverPreset(['education', 'medical']), 'classroom');
  });

  it('defaults_to_the_generic_photo_when_there_are_no_fields', () => {
    assert.equal(defaultCoverPreset([]), GENERIC_COVER_PRESET);
  });

  it('has_a_valid_default_preset_for_every_interest_field', () => {
    for (const field of INTEREST_KEYS) {
      const key = DEFAULT_COVER_PRESET_BY_FIELD[field];
      assert.ok(
        (COVER_PRESET_KEYS as readonly string[]).includes(key),
        `default for ${field} must be a known preset`
      );
    }
  });
});
