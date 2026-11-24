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

  it('ships_an_expanded_library_of_at_least_40_presets', () => {
    assert.ok(
      COVER_PRESET_KEYS.length >= 40,
      `expected at least 40 cover presets, got ${COVER_PRESET_KEYS.length}`
    );
  });

  it('accepts_the_new_expanded_preset_keys', () => {
    for (const key of ['blood-donation', 'tree-planting', 'coding-laptop', 'festival-confetti']) {
      const parsed = opportunitySchema.safeParse({ ...basePayload, coverPreset: key });
      assert.equal(parsed.success, true, `preset ${key} should be accepted`);
    }
  });
});

const SMALL_JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;

describe('Problem 2 custom cover uploads', () => {
  it('accepts_a_valid_custom_cover_data_url', () => {
    const parsed = opportunitySchema.safeParse({
      ...basePayload,
      customCover: SMALL_JPEG_DATA_URL,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.customCover, SMALL_JPEG_DATA_URL);
    }
  });

  it('accepts_an_empty_custom_cover_so_an_upload_can_be_cleared', () => {
    const parsed = opportunitySchema.safeParse({ ...basePayload, customCover: '' });
    assert.equal(parsed.success, true);
  });

  it('accepts_a_missing_custom_cover', () => {
    const parsed = opportunitySchema.safeParse(basePayload);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.customCover, undefined);
    }
  });

  it('rejects_a_non_image_data_url', () => {
    const parsed = opportunitySchema.safeParse({
      ...basePayload,
      customCover: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    });
    assert.equal(parsed.success, false);
  });

  it('rejects_a_remote_url_instead_of_a_data_url', () => {
    const parsed = opportunitySchema.safeParse({
      ...basePayload,
      customCover: 'https://example.com/cover.jpg',
    });
    assert.equal(parsed.success, false);
  });

  it('rejects_an_oversize_custom_cover', () => {
    const oversized = `data:image/jpeg;base64,${'A'.repeat(1_400_000)}`;
    const parsed = opportunitySchema.safeParse({ ...basePayload, customCover: oversized });
    assert.equal(parsed.success, false);
  });
});
