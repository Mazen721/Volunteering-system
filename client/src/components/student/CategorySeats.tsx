import { TriangleAlert, Users } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { VolunteerCategory } from '../../constants/enums';
import type { Opportunity } from '../../types';
import { SCARCE_SEATS_THRESHOLD, listCategorySeats } from '../../utils/categorySeats';
import { formatNumber } from '../../utils/format';

const DETAILS = AR.studentPortal.details;
const SHORT_LABELS = AR.studentPortal.common.categoryShortLabels;

interface CategorySeatsProps {
  opportunity: Opportunity;
  /** The viewing student's own volunteer category, when known. */
  myCategory: VolunteerCategory | null;
}

/**
 * Details-page breakdown of the remaining seats per volunteer category —
 * «متبقّي ٤ طلاب • متبقّي ٢ كادر أكاديمي» as one honest line per category the
 * organizer opened. His own category is marked «فئتك» and highlighted, and
 * when it runs low (≤ 3 seats) it switches to an amber scarcity treatment so
 * he knows to hurry. Categories with no quota are not listed at all.
 */
export function CategorySeatsBreakdown({ opportunity, myCategory }: CategorySeatsProps) {
  const seats = listCategorySeats(opportunity);
  if (seats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-black text-slate-700">
        <Users className="w-4 h-4 text-mnu-500" />
        {DETAILS.seatsByCategoryTitle}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {seats.map(({ category, remaining }) => {
          const isOwn = category === myCategory;
          const isScarce = isOwn && remaining <= SCARCE_SEATS_THRESHOLD;
          return (
            <li
              key={category}
              data-testid={`seats-category-${category}`}
              data-own={isOwn || undefined}
              data-scarce={isScarce || undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${
                isScarce
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-black'
                  : isOwn
                    ? 'bg-mnu-500/10 border-mnu-300 text-mnu-700 font-black'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <span>
                {DETAILS.remainingPrefix} {formatNumber(remaining)} {SHORT_LABELS[category]}
              </span>
              {isOwn && (
                <span className="px-1.5 py-0.5 rounded-full bg-mnu-500 text-white text-[10px] font-black">
                  {DETAILS.ownCategoryTag}
                </span>
              )}
              {isScarce && remaining > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700 text-[11px] font-black">
                  <TriangleAlert className="w-3.5 h-3.5" />
                  {DETAILS.scarceTag}
                </span>
              )}
              {isOwn && remaining === 0 && (
                <span className="text-rose-700 text-[11px] font-black">
                  {AR.studentPortal.board.fullBadge}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Hero variant: the same per-category truth compressed into ONE line over
 * the cover photo («المقاعد المتبقية: ٤ طلاب • ٢ كادر أكاديمي»), with his own
 * category lit in gold. Renders nothing when the organizer opened no quotas.
 */
export function CategorySeatsHeroLine({ opportunity, myCategory }: CategorySeatsProps) {
  const seats = listCategorySeats(opportunity);
  if (seats.length === 0) {
    return null;
  }

  return (
    <p
      data-testid="hero-seats-line"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] sm:text-sm font-bold text-white/90"
    >
      <Users className="w-4 h-4 shrink-0 text-amber-300" />
      <span>{AR.studentPortal.board.remainingSlotsLabel}:</span>
      {seats.map(({ category, remaining }, index) => (
        <span key={category} className="inline-flex items-center gap-2">
          {index > 0 && <span className="text-white/40">•</span>}
          <span className={category === myCategory ? 'text-amber-300 font-black' : undefined}>
            {formatNumber(remaining)} {SHORT_LABELS[category]}
          </span>
        </span>
      ))}
    </p>
  );
}
