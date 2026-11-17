import { BarChart3 } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { FacultyStatsRow } from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

function computeBarWidth(hours: number, maxHours: number): number {
  if (hours <= 0 || maxHours <= 0) {
    return 0;
  }
  return Math.max(8, Math.round((hours / maxHours) * 100));
}

interface FacultyChartProps {
  faculties: FacultyStatsRow[];
}

/**
 * Displays sorted animated horizontal progress bars comparing approved hours across faculties.
 */
export function FacultyChart({ faculties }: FacultyChartProps) {
  const sortedFaculties = [...faculties].sort(
    (left, right) => right.approvedHours - left.approvedHours
  );
  const maxHours = sortedFaculties[0]?.approvedHours || 0;

  return (
    <section className="lg:col-span-2 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-mnu-500" />
            <span>{AR.facultyChart.title}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{AR.facultyChart.subtitle}</p>
        </div>
        <span className="text-xs font-bold bg-mnu-500/10 text-mnu-500 px-3 py-1 rounded-full">
          {AR.facultyChart.liveTag}
        </span>
      </div>

      {sortedFaculties.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">{AR.facultyChart.empty}</p>
      ) : (
        <div className="space-y-4 pt-1">
          {sortedFaculties.map((row) => {
            const barWidth = computeBarWidth(row.approvedHours, maxHours);
            return (
              <div key={row.faculty} data-testid="faculty-bar-row" className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <span className="text-slate-700">{row.faculty}</span>
                  <span className="text-mnu-500 font-black">
                    {formatNumber(row.approvedHours)} {AR.facultyChart.hourUnit} (
                    {formatPercent(row.percentage)})
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    role="progressbar"
                    aria-label={row.faculty}
                    aria-valuenow={row.approvedHours}
                    aria-valuemin={0}
                    aria-valuemax={maxHours || 100}
                    className="bg-gradient-to-r from-mnu-500 to-amber-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
