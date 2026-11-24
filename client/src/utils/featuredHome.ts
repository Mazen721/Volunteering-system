import type { Opportunity, StudentDashboardSummary } from '../types';

export type FeaturedHomeKind = 'live' | 'next' | 'suggested' | 'welcome';

export interface FeaturedHome {
  kind: FeaturedHomeKind;
  opportunity: Opportunity | null;
  /** True when the student has applications but none accepted yet. */
  reviewOnly: boolean;
}

/**
 * Picks what the student home hero shows, in priority order: his live
 * activity, his next accepted activity, then the top recommendation. The
 * hero is never empty: a review-only student still gets the recommendation
 * (flagged via reviewOnly so the page can add a calm note), and with no
 * opportunities at all the page falls back to a warm welcome hero.
 */
export function selectFeaturedHome(
  summary: Pick<
    StudentDashboardSummary,
    'happeningNow' | 'upcomingAccepted' | 'activeApplications'
  >,
  recommendations: Opportunity[]
): FeaturedHome {
  const live = summary.happeningNow[0];
  if (live) {
    return { kind: 'live', opportunity: live, reviewOnly: false };
  }
  const next = summary.upcomingAccepted[0];
  if (next) {
    return { kind: 'next', opportunity: next, reviewOnly: false };
  }
  const reviewOnly = summary.activeApplications.length > 0;
  const top = recommendations[0];
  if (top) {
    return { kind: 'suggested', opportunity: top, reviewOnly };
  }
  return { kind: 'welcome', opportunity: null, reviewOnly };
}
