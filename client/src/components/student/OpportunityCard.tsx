import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin, Sparkles, Users } from 'lucide-react';
import { AR, INTEREST_LABELS } from '../../constants/ar';
import type { Opportunity } from '../../types';
import { hasActiveApplication } from '../../utils/applications';
import { formatDateTimeAr, formatNumber } from '../../utils/format';

interface OpportunityCardProps {
  opportunity: Opportunity;
  suggested?: boolean;
}

/**
 * Student-facing opportunity summary card with recommendation, waitlist, and application badges.
 * The suggested variant carries the gold «مقترحة ليك» ribbon so recommended work stands apart.
 */
export function OpportunityCard({ opportunity, suggested = false }: OpportunityCardProps) {
  const matchedFields = opportunity.matchedFields ?? [];
  const isApplied = hasActiveApplication(opportunity.myApplication);
  const isFull = opportunity.isFull ?? opportunity.remainingSlots.student <= 0;
  const isWaitlistAvailable = opportunity.waitlistAvailable ?? isFull;

  return (
    <article
      className={`glass-card rounded-3xl p-5 sm:p-6 flex flex-col gap-4 ${
        suggested ? 'border-2 border-mnu-gold/70 bg-gradient-to-b from-amber-50/80 to-white shadow-[0_10px_26px_-12px_rgba(212,175,55,0.45)]' : ''
      }`}
    >
      {suggested && (
        <span className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-mnu-gold text-[#231a00] text-[11px] font-black">
          <Sparkles className="w-3.5 h-3.5" />
          {AR.studentPortal.home.suggestedRibbon}
        </span>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <Link
            to={`/opportunities/${opportunity._id}`}
            className="text-base font-black text-slate-800 hover:text-mnu-600 transition"
          >
            {opportunity.title}
          </Link>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-mnu-500" />
            <span>{opportunity.location.name}</span>
            <span className="text-slate-300">•</span>
            <span>{opportunity.faculty ?? AR.studentPortal.board.allFaculties}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isApplied && (
            <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold">
              {AR.studentPortal.board.appliedBadge}
            </span>
          )}
          {isFull && (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
              {AR.studentPortal.board.fullBadge}
            </span>
          )}
          {isWaitlistAvailable && (
            <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-bold">
              {AR.studentPortal.board.waitlistBadge}
            </span>
          )}
        </div>
      </div>

      {matchedFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="match-badges">
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-mnu-600">
            <Sparkles className="w-3.5 h-3.5" />
            {AR.studentPortal.board.matchBadgePrefix}
          </span>
          {matchedFields.map((field) => (
            <span
              key={field}
              className="px-2.5 py-1 rounded-full bg-mnu-500/10 text-mnu-600 text-[11px] font-bold"
            >
              {INTEREST_LABELS[field]}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
        {opportunity.description}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-mnu-500" />
          {formatDateTimeAr(opportunity.startAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="w-3.5 h-3.5 text-mnu-500" />
          {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-mnu-500" />
          {AR.studentPortal.board.remainingSlotsLabel}:{' '}
          {formatNumber(opportunity.remainingSlots.student)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px] font-semibold text-amber-700">
          {AR.studentPortal.board.deadlineLabel}: {formatDateTimeAr(opportunity.registrationDeadline)}
        </span>
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition active:scale-95"
        >
          {AR.studentPortal.board.detailsButton}
        </Link>
      </div>
    </article>
  );
}
