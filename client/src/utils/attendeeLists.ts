import type { Application, VolunteerBase } from '../types';

export function getVolunteerInfo(application: Application): VolunteerBase | null {
  return application.volunteer && typeof application.volunteer !== 'string'
    ? application.volunteer
    : null;
}

/** Earlier check-ins first; volunteers who never checked in go last. */
export function byCheckInTime(earlier: Application, later: Application): number {
  const earlierTime = earlier.checkedInAt
    ? new Date(earlier.checkedInAt).getTime()
    : Number.MAX_VALUE;
  const laterTime = later.checkedInAt ? new Date(later.checkedInAt).getTime() : Number.MAX_VALUE;
  return earlierTime - laterTime;
}

/** Worst repeat offenders first: absence total descending, then name. */
export function byAbsenceCountThenName(left: Application, right: Application): number {
  const byCount = (right.absenceCount ?? 0) - (left.absenceCount ?? 0);
  if (byCount !== 0) {
    return byCount;
  }
  const leftName = getVolunteerInfo(left)?.fullName ?? '';
  const rightName = getVolunteerInfo(right)?.fullName ?? '';
  return leftName.localeCompare(rightName, 'ar');
}

/** Name lists in the completion dialog stay compact: first few, then a toggle. */
export const COMPACT_LIST_LIMIT = 4;
