import { Link } from 'react-router-dom';
import { AR } from '../../constants/ar';
import type { ApplicationStatus } from '../../constants/enums';
import type { Opportunity } from '../../types';
import { hasActiveApplication } from '../../utils/applications';
import { resolveOpportunityCover } from '../../utils/covers';
import { formatDateTimeAr, formatNumber } from '../../utils/format';

interface OpportunityRowProps {
  opportunity: Opportunity;
  suggested?: boolean;
  myStatus?: ApplicationStatus;
}

/**
 * A wide, calm opportunity row for the student home page (Concept I): the
 * cover photo on one side and the essential text beside it — publisher line,
 * title, place and time, and one quiet apply/details action.
 */
export function OpportunityRow({ opportunity, suggested = false, myStatus }: OpportunityRowProps) {
  const isApplied = myStatus === 'accepted' || hasActiveApplication(opportunity.myApplication);
  const effectiveStatus = myStatus ?? opportunity.myApplication?.status;
  const publisher = opportunity.faculty ?? AR.studentPortal.board.allFaculties;

  return (
    <article
      className={`bg-white rounded-3xl shadow-[0_6px_24px_-12px_rgba(18,47,74,0.18)] overflow-hidden flex flex-col sm:flex-row ${
        isApplied ? 'ring-2 ring-mnu-gold/70' : ''
      }`}
    >
      <img
        src={resolveOpportunityCover(opportunity)}
        alt=""
        className="w-full sm:w-56 lg:w-64 h-40 sm:h-auto object-cover shrink-0"
        loading="lazy"
      />
      <div className="flex-1 p-5 flex flex-col gap-1.5 min-w-0">
        <p className="text-[11px] font-bold text-amber-700">
          {publisher}
          {suggested && (
            <>
              <span className="text-slate-300"> • </span>
              {AR.studentPortal.home.suggestedRibbon}
            </>
          )}
        </p>
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="text-base sm:text-lg font-black text-slate-800 hover:text-mnu-600 transition leading-snug"
        >
          {opportunity.title}
        </Link>
        <p className="text-xs font-semibold text-slate-500">
          {opportunity.location.name} • {formatDateTimeAr(opportunity.startAt)} •{' '}
          {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
        </p>
        <div className="mt-auto pt-2">
          {effectiveStatus === 'pending' ? (
            <span className="inline-flex px-4 py-2 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-black">
              {AR.opportunities.applicationStatuses.pending}
            </span>
          ) : effectiveStatus === 'waitlisted' ? (
            <span className="inline-flex px-4 py-2 rounded-full bg-violet-50 text-violet-800 border border-violet-200 text-xs font-black">
              {AR.studentPortal.board.waitlistBadge}
            </span>
          ) : isApplied ? (
            <span className="inline-flex px-4 py-2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-black">
              {AR.studentPortal.board.appliedBadge} ✓
            </span>
          ) : (
            <Link
              to={`/opportunities/${opportunity._id}`}
              className="inline-flex px-5 py-2.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black transition active:scale-95"
            >
              {AR.studentPortal.board.detailsButton}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
