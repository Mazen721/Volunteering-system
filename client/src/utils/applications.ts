import type { ApplicationStatus, OpportunityPhase } from '../constants/enums';
import type { Application } from '../types';

const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'pending',
  'accepted',
  'waitlisted',
];

/**
 * Returns whether the application still occupies a slot or awaits a decision.
 */
export function hasActiveApplication(application: Application | undefined): boolean {
  return Boolean(application && ACTIVE_APPLICATION_STATUSES.includes(application.status));
}

/**
 * Returns whether an application lapsed undecided: it was still pending or
 * waitlisted when its opportunity ended, so no decision will ever come. The
 * stored status is left untouched — the lapse is derived from the
 * opportunity's phase wherever the application is presented as history.
 */
export function isLapsedApplication(
  application: { status: ApplicationStatus },
  opportunity: { phase: OpportunityPhase }
): boolean {
  return (
    (application.status === 'pending' || application.status === 'waitlisted') &&
    opportunity.phase === 'ended'
  );
}
