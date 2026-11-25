import type { ApplicationStatus } from '../constants/enums';
import type { Opportunity, StudentDashboardSummary } from '../types';
import { buildMyUpcoming } from './myUpcoming';
import { isOpportunityEnded, isStudentDiscoverable } from './opportunityPhase';

export type FeaturedHomeKind = 'live' | 'next' | 'suggested' | 'welcome';

export interface FeaturedHome {
  kind: FeaturedHomeKind;
  opportunity: Opportunity | null;
  /**
   * His application status when the hero features his own application
   * (live / next kinds); null when the hero shows a recommendation or the
   * welcome fallback.
   */
  myStatus: ApplicationStatus | null;
  /** True when a pending application of his (not the featured one) awaits a decision. */
  reviewOnly: boolean;
  /** The opportunity his soonest still-open pending application belongs to. */
  pendingOpportunity: Opportunity | null;
}

type SummarySlice = Pick<
  StudentDashboardSummary,
  'happeningNow' | 'upcomingAccepted' | 'activeApplications'
>;

interface OwnApplicationCandidate {
  opportunity: Opportunity;
  status: ApplicationStatus;
}

const OWN_STATUSES: readonly ApplicationStatus[] = ['accepted', 'pending', 'waitlisted'];

function isLiveNow(opportunity: Opportunity): boolean {
  return opportunity.phase === 'in_progress' || opportunity.checkInOpen;
}

function byStartAt(a: OwnApplicationCandidate, b: OwnApplicationCandidate): number {
  return (
    new Date(a.opportunity.startAt).getTime() - new Date(b.opportunity.startAt).getTime()
  );
}

/**
 * Picks what the student home hero shows. His own work always wins over
 * recommendations, in this order:
 *  1. An opportunity he applied to that is LIVE now (accepted participation
 *     first, then a still-undecided application on a live opportunity).
 *  2. His own application with the least time until it starts — accepted,
 *     pending, and waitlisted all count, earliest startAt wins — rendered
 *     honestly with its real status (pending work is never dressed up as
 *     confirmed participation).
 *  3. The top recommendation, then a warm welcome hero — never empty.
 *
 * The under-review note is de-duplicated: it only appears for a pending
 * application that is NOT the one the hero itself is featuring.
 */
export function selectFeaturedHome(
  summary: SummarySlice,
  recommendations: Opportunity[]
): FeaturedHome {
  const applications = summary.activeApplications;

  // 1) Live now: the server's happeningNow list (accepted, check-in open)
  // plus any of his live-phase applications it does not already cover.
  const liveById = new Map<string, OwnApplicationCandidate>();
  for (const opportunity of summary.happeningNow) {
    const application = applications.find(
      (entry) => entry.opportunity._id === opportunity._id
    );
    liveById.set(opportunity._id, {
      opportunity,
      status: application?.status ?? 'accepted',
    });
  }
  for (const application of applications) {
    if (!OWN_STATUSES.includes(application.status)) {
      continue;
    }
    const opportunity = application.opportunity;
    if (!isLiveNow(opportunity) || liveById.has(opportunity._id)) {
      continue;
    }
    liveById.set(opportunity._id, { opportunity, status: application.status });
  }
  const liveCandidates = [...liveById.values()].sort((a, b) => {
    const rank = (status: ApplicationStatus) => (status === 'accepted' ? 0 : 1);
    return rank(a.status) - rank(b.status) || byStartAt(a, b);
  });

  // 2) Soonest own application: the «شغلي القادم» merge (accepted upcoming +
  // pending/waitlisted, date-bounded), completed with accepted applications
  // the merge cannot see (e.g. registration already closed) so the hero
  // honours "his soonest application" across every active status.
  const nextById = new Map<string, OwnApplicationCandidate>();
  for (const item of buildMyUpcoming(summary)) {
    if (liveById.has(item.opportunity._id)) {
      continue;
    }
    nextById.set(item.opportunity._id, {
      opportunity: item.opportunity,
      status: item.status,
    });
  }
  for (const application of applications) {
    if (application.status !== 'accepted') {
      continue;
    }
    const opportunity = application.opportunity;
    if (
      nextById.has(opportunity._id) ||
      liveById.has(opportunity._id) ||
      isOpportunityEnded(opportunity)
    ) {
      continue;
    }
    nextById.set(opportunity._id, { opportunity, status: 'accepted' });
  }
  const nextCandidates = [...nextById.values()].sort(byStartAt);

  // The recommendation fallback honours the discovery rule too: an ended
  // (or completed/cancelled) opportunity is history and never headlines the
  // home page, whatever list it arrived in.
  const topRecommendation = recommendations.find(isStudentDiscoverable) ?? null;

  let kind: FeaturedHomeKind;
  let opportunity: Opportunity | null = null;
  let myStatus: ApplicationStatus | null = null;
  if (liveCandidates.length > 0) {
    kind = 'live';
    opportunity = liveCandidates[0].opportunity;
    myStatus = liveCandidates[0].status;
  } else if (nextCandidates.length > 0) {
    kind = 'next';
    opportunity = nextCandidates[0].opportunity;
    myStatus = nextCandidates[0].status;
  } else if (topRecommendation) {
    kind = 'suggested';
    opportunity = topRecommendation;
  } else {
    kind = 'welcome';
  }

  // Under-review note: his soonest pending application on an opportunity
  // that has not ended — unless the hero is already featuring that very
  // application, in which case the note would just repeat the hero.
  const pendingCandidate = applications
    .filter(
      (application) =>
        application.status === 'pending' &&
        !isOpportunityEnded(application.opportunity) &&
        application.opportunity._id !== opportunity?._id
    )
    .map((application) => ({
      opportunity: application.opportunity,
      status: application.status,
    }))
    .sort(byStartAt)[0];
  const pendingOpportunity = pendingCandidate?.opportunity ?? null;

  return {
    kind,
    opportunity,
    myStatus,
    reviewOnly: pendingOpportunity !== null,
    pendingOpportunity,
  };
}
