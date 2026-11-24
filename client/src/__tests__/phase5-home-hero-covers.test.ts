import { describe, expect, it } from 'vitest';
import type { Opportunity, StudentApplication } from '../types';
import {
  COVER_PRESET_KEYS,
  coverPresetsForFields,
  defaultCoverKeyForFields,
  resolveOpportunityCover,
} from '../utils/covers';
import { selectFeaturedHome } from '../utils/featuredHome';

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    _id: 'op-1',
    title: 'فرصة',
    description: 'وصف',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'مكان', address: 'عنوان' },
    startAt: '2026-12-01T07:00:00.000Z',
    endAt: '2026-12-01T09:00:00.000Z',
    registrationDeadline: '2026-11-30T07:00:00.000Z',
    hours: 2,
    contactName: 'مسؤول',
    contactPhone: '01000000000',
    contactEmail: 'op@mnu.edu.eg',
    faculty: null,
    slots: { student: 4, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy: 'admin',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'upcoming',
    checkInOpen: false,
    remainingSlots: { student: 4, academic: 0, admin: 0 },
    ...overrides,
  } as Opportunity;
}

const emptySummary = {
  happeningNow: [] as Opportunity[],
  upcomingAccepted: [] as Opportunity[],
  activeApplications: [] as unknown as StudentApplication[],
};

describe('Phase 5 featured home selection', () => {
  it('prefers_the_live_activity_over_next_and_suggested', () => {
    const live = buildOpportunity({ _id: 'live' });
    const next = buildOpportunity({ _id: 'next' });
    const top = buildOpportunity({ _id: 'top' });
    const featured = selectFeaturedHome(
      { ...emptySummary, happeningNow: [live], upcomingAccepted: [next] },
      [top]
    );
    expect(featured.kind).toBe('live');
    expect(featured.opportunity?._id).toBe('live');
  });

  it('uses_the_next_accepted_activity_when_nothing_is_live', () => {
    const next = buildOpportunity({ _id: 'next' });
    const featured = selectFeaturedHome({ ...emptySummary, upcomingAccepted: [next] }, []);
    expect(featured.kind).toBe('next');
    expect(featured.opportunity?._id).toBe('next');
  });

  it('features_the_top_recommendation_for_a_new_student', () => {
    const top = buildOpportunity({ _id: 'top' });
    const featured = selectFeaturedHome(emptySummary, [top]);
    expect(featured.kind).toBe('suggested');
    expect(featured.reviewOnly).toBe(false);
  });

  it('never_returns_an_empty_hero_for_a_review_only_student', () => {
    const top = buildOpportunity({ _id: 'top' });
    const application = { _id: 'app-1' } as unknown as StudentApplication;
    const featured = selectFeaturedHome({ ...emptySummary, activeApplications: [application] }, [
      top,
    ]);
    expect(featured.kind).toBe('suggested');
    expect(featured.reviewOnly).toBe(true);

    const noRecommendations = selectFeaturedHome(
      { ...emptySummary, activeApplications: [application] },
      []
    );
    expect(noRecommendations.kind).toBe('welcome');
    expect(noRecommendations.reviewOnly).toBe(true);
  });

  it('falls_back_to_a_welcome_hero_when_there_are_no_opportunities', () => {
    const featured = selectFeaturedHome(emptySummary, []);
    expect(featured.kind).toBe('welcome');
    expect(featured.opportunity).toBeNull();
  });
});

describe('Phase 5 cover presets', () => {
  it('resolves_the_stored_preset_to_its_bundled_photo', () => {
    const url = resolveOpportunityCover(
      buildOpportunity({ coverPreset: 'gardening', fields: ['medical'] })
    );
    expect(url).toBe('/assets/covers/gardening.jpg');
  });

  it('falls_back_to_the_primary_field_default_when_no_preset_is_stored', () => {
    const url = resolveOpportunityCover(buildOpportunity({ fields: ['technology'] }));
    expect(url).toBe('/assets/covers/robotics.jpg');
  });

  it('falls_back_to_the_generic_photo_for_an_unknown_preset_key', () => {
    const url = resolveOpportunityCover(
      buildOpportunity({ coverPreset: 'not-a-preset', fields: [] })
    );
    expect(url).toBe('/assets/covers/helping-hands.jpg');
  });

  it('has_at_least_one_preset_for_every_interest_field', () => {
    const fields = [
      'medical',
      'agriculture_environment',
      'education',
      'charity_community',
      'technology',
      'sports',
      'arts_culture',
      'awareness_campaigns',
      'event_organizing',
    ] as const;
    for (const field of fields) {
      expect(coverPresetsForFields([field]).length).toBeGreaterThan(0);
      expect(COVER_PRESET_KEYS).toContain(defaultCoverKeyForFields([field]));
    }
  });
});
