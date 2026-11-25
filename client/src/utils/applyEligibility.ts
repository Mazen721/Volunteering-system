import type { Faculty, VolunteerCategory } from '../constants/enums';
import type { Opportunity } from '../types';

/**
 * The specific reason a student cannot apply to an opportunity, derived on
 * the client from the API payload (phase, faculty targeting, category
 * quotas). It mirrors the server's apply rules in application.service.ts:
 *  - the opportunity must be visible to his faculty (another faculty's
 *    opportunity is restricted),
 *  - registration closes at the deadline (phase registration_closed),
 *  - once the activity starts, applying is impossible (phase in_progress),
 *  - an ended opportunity is history (phase ended),
 *  - his own category must have a quota at all (slots[category] > 0).
 *
 * A FULL category (quota > 0 but no seats left) is deliberately NOT a block
 * reason: the server still accepts the application into the waitlist /
 * pending queue, so the details page keeps the apply button and explains
 * that path with the waitlist notice instead.
 */
export type ApplyBlockReason =
  'started' | 'deadlinePassed' | 'ended' | 'facultyRestricted' | 'noCategoryQuota';

export interface ApplyViewer {
  category: VolunteerCategory | null;
  faculty: Faculty | null;
}

type EligibilitySlice = Pick<Opportunity, 'status' | 'phase' | 'faculty' | 'slots'>;

export function getApplyBlockReason(
  opportunity: EligibilitySlice,
  viewer: ApplyViewer
): ApplyBlockReason | null {
  if (opportunity.status !== 'published') {
    return null;
  }
  if (opportunity.faculty && viewer.faculty && opportunity.faculty !== viewer.faculty) {
    return 'facultyRestricted';
  }
  switch (opportunity.phase) {
    case 'in_progress':
      return 'started';
    case 'ended':
      return 'ended';
    case 'registration_closed':
      return 'deadlinePassed';
    case 'upcoming':
      break;
  }
  if (viewer.category && opportunity.slots[viewer.category] <= 0) {
    return 'noCategoryQuota';
  }
  return null;
}
