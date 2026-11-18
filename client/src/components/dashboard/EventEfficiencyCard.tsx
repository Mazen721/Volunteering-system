import { CalendarCheck2 } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { EventStatsResponse } from '../../types';
import { formatDateAr, formatNumber, formatPercent } from '../../utils/format';

interface EventEfficiencyCardProps {
  events: EventStatsResponse | null;
}

/**
 * Displays top events by attendance along with slot fill rates and no-show rates for completed events.
 */
export function EventEfficiencyCard({ events }: EventEfficiencyCardProps) {
  const hasEvents = Boolean(events && events.summary.totalEvents > 0);

  return (
    <section
      data-testid="event-efficiency-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-5 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <CalendarCheck2 className="w-5 h-5 text-mnu-500 shrink-0" />
            <span>{AR.analytics.eventsTitle}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.eventsSubtitle}</p>
        </div>

        {events && hasEvents && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              {AR.analytics.eventsAvgFillLabel}: {formatPercent(events.summary.avgFillRate)}
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {AR.analytics.eventsAvgNoShowLabel}: {formatPercent(events.summary.avgNoShowRate)}
            </span>
          </div>
        )}
      </div>

      {!hasEvents || !events ? (
        <p className="text-xs text-slate-400 text-center py-8">{AR.analytics.eventsEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-slate-700">{AR.analytics.eventsTopHeading}</h4>
            <ul className="space-y-2">
              {events.topEvents.map((eventRow) => (
                <li
                  key={eventRow._id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/75 border border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{eventRow.title}</p>
                    <p className="text-[11px] text-slate-500">{formatDateAr(eventRow.startAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold shrink-0">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {formatNumber(eventRow.attendedCount)} {AR.analytics.eventsAttendedUnit}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {formatNumber(eventRow.acceptedCount)} / {formatNumber(eventRow.totalSlots)}{' '}
                      {AR.analytics.eventsSlotsUnit}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-black text-slate-700">
              {AR.analytics.eventsCompletedHeading}
            </h4>
            {events.completedEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">{AR.analytics.eventsEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {events.completedEvents.slice(0, 5).map((eventRow) => (
                  <li
                    key={eventRow._id}
                    className="p-3 rounded-2xl bg-white/75 border border-slate-100 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-800 truncate">{eventRow.title}</p>
                      <span className="text-[11px] font-bold text-slate-500">
                        {formatNumber(eventRow.hours)} {AR.common.hourUnit}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                      <span className="text-sky-700">
                        {AR.analytics.eventsFillRateLabel}: {formatPercent(eventRow.fillRate)}
                      </span>
                      <span className="text-amber-700">
                        {AR.analytics.eventsNoShowRateLabel}: {formatPercent(eventRow.noShowRate)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
