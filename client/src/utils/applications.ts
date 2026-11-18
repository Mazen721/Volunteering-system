import type { ApplicationStatus } from '../constants/enums';
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
