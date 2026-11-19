import { Building2, Clock3, TrendingUp, Users } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { FacultyStatsRow } from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

interface DeanFacultyCardProps {
  faculties: FacultyStatsRow[];
}

/**
 * Dean-only replacement for the multi-faculty comparison chart: a dean is scoped to a
 * single faculty, so instead of one lonely 100% bar this card fills the same wide slot
 * with that faculty's own numbers — volunteers, active share, approved hours and
 * participation — leaving no empty comparison space on desktop.
 */
export function DeanFacultyCard({ faculties }: DeanFacultyCardProps) {
  const row = faculties[0];

  return (
    <section
      data-testid="dean-faculty-card"
      className="lg:col-span-2 glass-card rounded-3xl p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-mnu-500" />
            <span>{AR.dashboard.deanFaculty.title}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{AR.dashboard.deanFaculty.subtitle}</p>
        </div>
        <span className="text-xs font-bold bg-mnu-500/10 text-mnu-500 px-3 py-1 rounded-full">
          {AR.dashboard.deanFaculty.liveTag}
        </span>
      </div>

      {!row ? (
        <p className="text-xs text-slate-400 text-center py-6">{AR.dashboard.deanFaculty.empty}</p>
      ) : (
        <div className="space-y-5">
          <p className="text-base sm:text-lg font-black text-mnu-700">{row.faculty}</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white/75 border border-slate-100 p-4 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Users className="w-4 h-4 text-mnu-500" />
                <span>{AR.dashboard.deanFaculty.volunteersLabel}</span>
              </p>
              <p className="text-2xl font-black text-slate-800">
                {formatNumber(row.volunteerCount)}
              </p>
              {typeof row.activeVolunteers === 'number' && (
                <p className="text-[11px] font-bold text-emerald-700">
                  {formatNumber(row.activeVolunteers)} {AR.dashboard.deanFaculty.activeLabel}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-white/75 border border-slate-100 p-4 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Clock3 className="w-4 h-4 text-mnu-500" />
                <span>{AR.dashboard.deanFaculty.approvedHoursLabel}</span>
              </p>
              <p className="text-2xl font-black text-slate-800">
                {formatNumber(row.approvedHours)}
              </p>
              <p className="text-[11px] font-bold text-slate-500">
                {formatNumber(row.approvedActivities)} {AR.dashboard.deanFaculty.activitiesLabel}
              </p>
            </div>

            <div className="rounded-2xl bg-white/75 border border-slate-100 p-4 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <TrendingUp className="w-4 h-4 text-mnu-500" />
                <span>{AR.dashboard.deanFaculty.avgHoursLabel}</span>
              </p>
              <p className="text-2xl font-black text-slate-800">{formatNumber(row.avgHours)}</p>
              <p className="text-[11px] font-bold text-slate-500">
                {AR.facultyChart.hourUnit} / {AR.dashboard.deanFaculty.volunteersLabel}
              </p>
            </div>

            <div className="rounded-2xl bg-white/75 border border-slate-100 p-4 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Users className="w-4 h-4 text-mnu-500" />
                <span>{AR.dashboard.deanFaculty.participationLabel}</span>
              </p>
              <p className="text-2xl font-black text-slate-800">
                {formatPercent(row.participationRate ?? 0)}
              </p>
              <p className="text-[11px] font-bold text-slate-500">
                {AR.dashboard.deanFaculty.shareLabel}: {formatPercent(row.percentage)}
              </p>
            </div>
          </div>

          {typeof row.participationRate === 'number' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-slate-700">{AR.dashboard.deanFaculty.participationLabel}</span>
                <span className="text-mnu-500 font-black">
                  {formatPercent(row.participationRate)}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
                <div
                  role="progressbar"
                  aria-label={row.faculty}
                  aria-valuenow={Math.round(row.participationRate)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-gradient-to-r from-mnu-500 to-amber-500 h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(0, Math.min(100, row.participationRate))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
