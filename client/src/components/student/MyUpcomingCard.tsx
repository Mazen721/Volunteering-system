import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { ApplicationStatus } from '../../constants/enums';
import type { MyUpcomingItem } from '../../utils/myUpcoming';
import { formatDateTimeAr, formatNumber } from '../../utils/format';

const STATUS_CHIP_CLASSES: Partial<Record<ApplicationStatus, string>> = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  waitlisted: 'bg-violet-50 text-violet-700 border-violet-200',
};

/**
 * Compact card for one piece of the student's own upcoming work, with the
 * application status chip (accepted, under review, or waitlisted).
 */
export function MyUpcomingCard({ item }: { item: MyUpcomingItem }) {
  const { opportunity, status } = item;
  return (
    <article className="glass-card rounded-3xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="text-sm font-black text-slate-800 hover:text-mnu-600 transition"
        >
          {opportunity.title}
        </Link>
        <span
          className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_CHIP_CLASSES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
        >
          {AR.opportunities.applicationStatuses[status]}
        </span>
      </div>
      <div className="space-y-1.5 text-[11px] font-semibold text-slate-500">
        <p className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-mnu-500" />
          {opportunity.location.name}
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-mnu-500" />
          {formatDateTimeAr(opportunity.startAt)}
          <span className="text-slate-300">•</span>
          <Clock3 className="w-3.5 h-3.5 text-mnu-500" />
          {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
        </p>
      </div>
      <Link
        to={`/opportunities/${opportunity._id}`}
        className="self-start px-4 py-2 rounded-xl bg-mnu-50 text-mnu-600 hover:bg-mnu-100 text-xs font-bold transition"
      >
        {AR.studentPortal.board.detailsButton}
      </Link>
    </article>
  );
}
