import type { Opportunity, StudentDashboardSummary } from '../types';

export type FeaturedHomeKind = 'live' | 'next' | 'suggested' | 'welcome';

export interface FeaturedHome {
  kind: FeaturedHomeKind;
  opportunity: Opportunity | null;
  /** True when a still-open application of his is awaiting a decision. */
  reviewOnly: boolean;
  /** The opportunity his oldest still-open pending application belongs to. */
  pendingOpportunity: Opportunity | null;
}

/**
 * Picks what the student home hero shows, in priority order: his live
 * activity, his next accepted activity, then the top recommendation. The
 * hero is never empty: a review-only student still gets the recommendation
 * (flagged via reviewOnly so the page can add a calm note naming the pending
 * opportunity), and with no opportunities at all the page falls back to a
 * warm welcome hero. Only a genuinely pending application on an opportunity
 * that has not ended counts as "under review" — accepted history on past
 * events must not trigger the note.
 */
export function selectFeaturedHome(
  summary: Pick<
    StudentDashboardSummary,
    'happeningNow' | 'upcomingAccepted' | 'activeApplications'
  >,
  recommendations: Opportunity[]
): FeaturedHome {
  const pendingApplication = summary.activeApplications.find(
    (application) => application.status === 'pending' && application.opportunity.phase !== 'ended'
  );
  const reviewOnly = Boolean(pendingApplication);
  const pendingOpportunity = pendingApplication?.opportunity ?? null;

  const live = summary.happeningNow[0];
  if (live) {
    return { kind: 'live', opportunity: live, reviewOnly: false, pendingOpportunity };
  }
  const next = summary.upcomingAccepted[0];
  if (next) {
    return { kind: 'next', opportunity: next, reviewOnly: false, pendingOpportunity };
  }
  const top = recommendations[0];
  if (top) {
    return { kind: 'suggested', opportunity: top, reviewOnly, pendingOpportunity };
  }
  return { kind: 'welcome', opportunity: null, reviewOnly, pendingOpportunity };
}
