import { CATEGORIES } from '../constants/enums';
import type { VolunteerCategory } from '../constants/enums';
import type { Opportunity } from '../types';

export interface CategorySeat {
  category: VolunteerCategory;
  quota: number;
  remaining: number;
}

/**
 * Per-category remaining seats for an opportunity, in the canonical category
 * order, keeping only categories the organizer actually opened (quota > 0).
 *
 * The numbers come straight from the API payload: the server computes
 * `remainingSlots[category] = max(0, slots[category] − acceptedCounts[category])`,
 * so only ACCEPTED applications consume a seat — pending and waitlisted
 * applications do not. This helper mirrors that convention exactly; it never
 * recomputes anything from raw application lists.
 */
export function listCategorySeats(
  opportunity: Pick<Opportunity, 'slots' | 'remainingSlots'>
): CategorySeat[] {
  return CATEGORIES.filter((category) => (opportunity.slots[category] ?? 0) > 0).map(
    (category) => ({
      category,
      quota: opportunity.slots[category] ?? 0,
      remaining: opportunity.remainingSlots[category] ?? 0,
    })
  );
}

/** At or below this many seats left in his own category, the scarcity signal fires. */
export const SCARCE_SEATS_THRESHOLD = 3;
