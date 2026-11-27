import type { ReactNode } from 'react';
import { AR } from '../../constants/ar';
import type { Application, VolunteerBase } from '../../types';
import { formatNumber } from '../../utils/format';

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

/**
 * Total-absence badge next to an absent volunteer's name. Neutral for a
 * first absence, amber for 2–3, and a red alert from 4 upwards — the
 * threshold the programme treats as a problem case.
 */
export function AbsenceBadge({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }
  const label =
    count === 1
      ? AR.opportunities.absenceOnce
      : count === 2
        ? AR.opportunities.absenceTwice
        : AR.opportunities.absenceMany.replace('{count}', formatNumber(count));
  const classes =
    count >= 4
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : count >= 2
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span
      data-testid="absence-badge"
      data-count={count}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black shrink-0 ${classes}`}
    >
      {label}
    </span>
  );
}

/** Name lists in the completion dialog stay compact: first few, then a toggle. */
export const COMPACT_LIST_LIMIT = 4;

interface CompactVolunteerListProps {
  items: Application[];
  expanded: boolean;
  onToggleExpanded: () => void;
  testId: string;
  tone: 'plain' | 'amber';
  renderMeta: (application: Application) => ReactNode;
}

/**
 * The compact volunteer name list shared by the attended and absent blocks
 * of the completion dialog (they used to be two near-identical ~35-line
 * copies): name + category on one side, a per-row meta element on the
 * other, with a show-more toggle past COMPACT_LIST_LIMIT.
 */
export function CompactVolunteerList({
  items,
  expanded,
  onToggleExpanded,
  testId,
  tone,
  renderMeta,
}: CompactVolunteerListProps) {
  const visibleItems = expanded ? items : items.slice(0, COMPACT_LIST_LIMIT);
  const listClasses =
    tone === 'amber'
      ? 'border-amber-100 bg-amber-50/50 divide-amber-100'
      : 'border-slate-100 bg-white/70 divide-slate-100';
  return (
    <>
      <ul
        data-testid={testId}
        className={`max-h-56 overflow-y-auto rounded-2xl border divide-y ${listClasses}`}
      >
        {visibleItems.map((application) => {
          const volunteer = getVolunteerInfo(application);
          return (
            <li
              key={application._id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800">
                  {volunteer?.fullName ?? AR.opportunities.live.unknownVolunteer}
                </p>
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                  {AR.categories[application.category]}
                </p>
              </div>
              {renderMeta(application)}
            </li>
          );
        })}
      </ul>
      {items.length > COMPACT_LIST_LIMIT && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
        >
          {expanded ? AR.opportunities.showLess : AR.opportunities.showMore}
        </button>
      )}
    </>
  );
}
