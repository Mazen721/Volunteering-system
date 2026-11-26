import { useState } from 'react';
import { AlarmClockCheck, ArrowLeft, ClipboardList, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AR } from '../../constants/ar';
import type { ActionItemsResponse, PendingUrgentItem } from '../../types';
import { formatDurationAr } from '../../utils/duration';
import { formatDateTimeAr, formatNumber } from '../../utils/format';

const MAX_VISIBLE_ROWS = 5;
const ACTION = AR.dashboard.actionItems;

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-[#c9a227] text-[#122f4a] text-xs font-black shadow-sm">
      {formatNumber(count)}
    </span>
  );
}

function ViewAllLink() {
  return (
    <Link
      to="/opportunities/manage"
      className="inline-flex items-center gap-1.5 text-xs font-black text-mnu-600 hover:text-mnu-700 transition"
    >
      <span>{ACTION.viewAll}</span>
      <ArrowLeft className="w-3.5 h-3.5" />
    </Link>
  );
}

function PendingTimingChip({ item, nowMs }: { item: PendingUrgentItem; nowMs: number }) {
  if (item.phase === 'in_progress') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold">
        {ACTION.liveNowLabel}
      </span>
    );
  }
  const startsIn = formatDurationAr(new Date(item.startAt).getTime() - nowMs);
  if (item.phase === 'registration_closed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
        {ACTION.registrationClosedLabel} • {ACTION.startsInLabel} {startsIn}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
      {ACTION.startsInLabel} {startsIn}
    </span>
  );
}

interface ActionItemsBlocksProps {
  actionItems: ActionItemsResponse | null;
}

/**
 * Priority action blocks on the staff dashboard: ended opportunities still
 * awaiting «إتمام الفرصة» and opportunities whose pending applications are
 * about to miss their start. Each block renders only when it has items.
 */
export function ActionItemsBlocks({ actionItems }: ActionItemsBlocksProps) {
  const [nowMs] = useState(() => Date.now());
  if (!actionItems) {
    return null;
  }
  const { awaitingCompletion, pendingUrgent } = actionItems;
  if (awaitingCompletion.length === 0 && pendingUrgent.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {awaitingCompletion.length > 0 && (
        <section
          data-testid="action-items-awaiting"
          className="rounded-3xl border-2 border-[#c9a227]/60 bg-[#c9a227]/10 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[#c9a227] text-[#122f4a] flex items-center justify-center shrink-0 shadow-md shadow-[#c9a227]/30">
                <Flag className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>{ACTION.awaitingTitle}</span>
                  <CountBadge count={awaitingCompletion.length} />
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{ACTION.awaitingSubtitle}</p>
              </div>
            </div>
            {awaitingCompletion.length > MAX_VISIBLE_ROWS && <ViewAllLink />}
          </div>

          <ul className="space-y-2">
            {awaitingCompletion.slice(0, MAX_VISIBLE_ROWS).map((item) => (
              <li key={item.opportunityId}>
                <Link
                  to={`/opportunities/manage?complete=${encodeURIComponent(item.opportunityId)}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-white/85 border border-[#c9a227]/30 hover:border-[#c9a227] hover:bg-white transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {item.faculty ?? AR.opportunities.allFaculties} • {ACTION.endedLabel}{' '}
                      {formatDateTimeAr(item.endAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] font-bold text-slate-600">
                    <span>
                      {ACTION.acceptedLabel}:{' '}
                      <span className="font-black text-slate-800">
                        {formatNumber(item.acceptedCount)}
                      </span>
                    </span>
                    <span>
                      {ACTION.attendedLabel}:{' '}
                      <span className="font-black text-slate-800">
                        {formatNumber(item.attendedCount)}
                      </span>
                    </span>
                    <ArrowLeft className="w-4 h-4 text-[#c9a227]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingUrgent.length > 0 && (
        <section
          data-testid="action-items-pending"
          className="rounded-3xl border-2 border-amber-300/70 bg-amber-50/70 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0 shadow-md shadow-amber-400/30">
                <AlarmClockCheck className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>{ACTION.pendingTitle}</span>
                  <CountBadge count={pendingUrgent.length} />
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{ACTION.pendingSubtitle}</p>
              </div>
            </div>
            {pendingUrgent.length > MAX_VISIBLE_ROWS && <ViewAllLink />}
          </div>

          <ul className="space-y-2">
            {pendingUrgent.slice(0, MAX_VISIBLE_ROWS).map((item) => (
              <li key={item.opportunityId}>
                <Link
                  to={`/opportunities/manage?applicants=${encodeURIComponent(item.opportunityId)}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-white/85 border border-amber-200 hover:border-amber-400 hover:bg-white transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {item.faculty ?? AR.opportunities.allFaculties} •{' '}
                        {formatNumber(item.pendingCount)} {ACTION.pendingRequestsLabel}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PendingTimingChip item={item} nowMs={nowMs} />
                    <ArrowLeft className="w-4 h-4 text-amber-500" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
