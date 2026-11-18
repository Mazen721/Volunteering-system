import type { ApplicationStatus } from '../constants/enums';
import type { Opportunity, StudentApplication } from '../types';

export interface MyUpcomingItem {
  opportunity: Opportunity;
  status: ApplicationStatus;
}

/**
 * Merges accepted upcoming opportunities with pending or waitlisted
 * applications into one chronological list of the student's own work.
 */
export function buildMyUpcoming(summary: {
  upcomingAccepted: Opportunity[];
  activeApplications: StudentApplication[];
}): MyUpcomingItem[] {
  const accepted: MyUpcomingItem[] = summary.upcomingAccepted.map((opportunity) => ({
    opportunity,
    status: 'accepted',
  }));
  const acceptedIds = new Set(accepted.map((item) => item.opportunity._id));
  const reviewing: MyUpcomingItem[] = summary.activeApplications
    .filter(
      (application) =>
        (application.status === 'pending' || application.status === 'waitlisted') &&
        !acceptedIds.has(application.opportunity._id),
    )
    .map((application) => ({ opportunity: application.opportunity, status: application.status }));
  return [...accepted, ...reviewing].sort(
    (a, b) => new Date(a.opportunity.startAt).getTime() - new Date(b.opportunity.startAt).getTime(),
  );
}
