import { CheckCircle2, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { Application, LiveCounters, VolunteerBase } from '../../types';
import { formatDateTimeAr, formatNumber } from '../../utils/format';

interface LiveAttendeesTableProps {
  counters: LiveCounters;
  attendees: Application[];
  isClosed: boolean;
  busyApplicationId: string | null;
  onToggleManual: (application: Application) => void;
}

function getVolunteerInfo(application: Application): VolunteerBase | null {
  return application.volunteer && typeof application.volunteer !== 'string'
    ? application.volunteer
    : null;
}

/**
 * Renders live attendance counters and the accepted attendees check-in table.
 */
export function LiveAttendeesTable({
  counters,
  attendees,
  isClosed,
  busyApplicationId,
  onToggleManual,
}: LiveAttendeesTableProps) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-3xl p-5 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.opportunities.live.acceptedCountLabel}
          </p>
          <p data-testid="counter-accepted" className="text-2xl font-black text-slate-800">
            {formatNumber(counters.accepted)}
          </p>
        </div>
        <div className="glass-card rounded-3xl p-5 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.opportunities.live.checkedInCountLabel}
          </p>
          <p data-testid="counter-checked-in" className="text-2xl font-black text-emerald-600">
            {formatNumber(counters.checkedIn)}
          </p>
        </div>
        <div className="glass-card rounded-3xl p-5 space-y-1">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.opportunities.live.notArrivedCountLabel}
          </p>
          <p data-testid="counter-not-arrived" className="text-2xl font-black text-amber-600">
            {formatNumber(counters.notArrived)}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-4">
        <h2 className="text-sm font-black text-slate-800">
          {AR.opportunities.live.attendeesTitle}
        </h2>

        {attendees.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-slate-500">
            {AR.opportunities.live.attendeesEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/70">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-mnu-500 text-white text-xs font-bold">
                  <th className="p-3.5 whitespace-nowrap">
                    {AR.opportunities.live.columns.volunteer}
                  </th>
                  <th className="p-3.5 whitespace-nowrap">
                    {AR.opportunities.live.columns.volunteerId}
                  </th>
                  <th className="p-3.5 whitespace-nowrap">
                    {AR.opportunities.live.columns.category}
                  </th>
                  <th className="p-3.5 whitespace-nowrap">
                    {AR.opportunities.live.columns.faculty}
                  </th>
                  <th className="p-3.5 text-center whitespace-nowrap">
                    {AR.opportunities.live.columns.status}
                  </th>
                  <th className="p-3.5 whitespace-nowrap">
                    {AR.opportunities.live.columns.checkedInAt}
                  </th>
                  <th className="p-3.5 text-center whitespace-nowrap">
                    {AR.opportunities.live.columns.action}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {attendees.map((application) => {
                  const volunteer = getVolunteerInfo(application);
                  const busy = busyApplicationId === application._id;

                  return (
                    <tr key={application._id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-black text-slate-800 whitespace-nowrap">
                        {volunteer?.fullName ?? AR.opportunities.live.unknownVolunteer}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">
                        {volunteer?.volunteerId ?? '—'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {AR.categories[application.category]}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">{application.faculty}</td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {application.attended ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{AR.opportunities.live.attendedBadge}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {AR.opportunities.live.notArrivedBadge}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600 whitespace-nowrap">
                        {application.checkedInAt
                          ? formatDateTimeAr(application.checkedInAt)
                          : '—'}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isClosed || busy}
                          onClick={() => onToggleManual(application)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                            application.attended
                              ? 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-200'
                              : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-200'
                          }`}
                        >
                          {busy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : application.attended ? (
                            <UserX className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {application.attended
                              ? AR.opportunities.live.markAbsentBtn
                              : AR.opportunities.live.markAttendedBtn}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
