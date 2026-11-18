import { Building2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AR } from '../../constants/ar';
import type { FacultyStatsRow } from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

interface FacultyComparisonChartProps {
  faculties: FacultyStatsRow[];
}

function shortenFacultyLabel(faculty: string): string {
  return faculty.replace(/^كلية\s+/, '');
}

/**
 * Compares approved hours, volunteer counts, and participation rates across faculties using Recharts.
 */
export function FacultyComparisonChart({ faculties }: FacultyComparisonChartProps) {
  const sortedRows = [...faculties]
    .sort((left, right) => right.approvedHours - left.approvedHours)
    .map((row) => ({
      ...row,
      shortName: shortenFacultyLabel(row.faculty),
    }));

  return (
    <section
      data-testid="faculty-comparison-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-mnu-500 shrink-0" />
          <span>{AR.analytics.facultyComparisonTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.facultyComparisonSubtitle}</p>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">
          {AR.analytics.facultyComparisonEmpty}
        </p>
      ) : (
        <>
          <div className="w-full h-64 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 256 }}
            >
              <BarChart data={sortedRows} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(tickValue: number) => formatNumber(tickValue)}
                />
                <Tooltip
                  formatter={(tooltipValue, seriesName) => [
                    formatNumber(Number(tooltipValue ?? 0)),
                    String(seriesName ?? ''),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="approvedHours"
                  name={AR.analytics.facultyHoursSeries}
                  fill="#1f4e79"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="volunteerCount"
                  name={AR.analytics.facultyVolunteersSeries}
                  fill="#d4af37"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sortedRows.map((row) => (
              <div
                key={row.faculty}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/75 border border-slate-100 px-3 py-2 text-xs"
              >
                <span className="font-bold text-slate-700 truncate">{row.faculty}</span>
                <span className="font-black text-emerald-700 shrink-0">
                  {AR.analytics.facultyParticipationLabel}: {formatPercent(row.participationRate ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
