import { BarChart3, UsersRound } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AR } from '../../constants/ar';
import type { CategoryStatsRow, FacultyStatsRow } from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

const CATEGORY_BAR_COLORS = ['#1f4e79', '#c9a227', '#0f766e', '#7c3aed'];

function computeBarWidth(hours: number, maxHours: number): number {
  if (hours <= 0 || maxHours <= 0) {
    return 0;
  }
  return Math.max(8, Math.round((hours / maxHours) * 100));
}

function shortenCategoryLabel(label: string): string {
  return label.replace(/^أعضاء\s+/, '');
}

interface SingleFacultyBreakdownProps {
  categories: CategoryStatsRow[];
}

function SingleFacultyBreakdown({ categories }: SingleFacultyBreakdownProps) {
  const sortedCategories = [...categories]
    .sort((left, right) => right.approvedHours - left.approvedHours)
    .map((row, index) => ({
      ...row,
      shortLabel: shortenCategoryLabel(row.label),
      fill: CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length],
    }));
  const hasCategoryData = sortedCategories.some(
    (row) => row.approvedHours > 0 || row.approvedActivities > 0 || row.volunteerCount > 0
  );

  return (
    <div
      data-testid="single-faculty-category-chart"
      className="border-t border-slate-100 pt-5 space-y-3"
    >
      <div>
        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <UsersRound className="w-4 h-4 text-mnu-500 shrink-0" />
          <span>{AR.facultyChart.singleBreakdownTitle}</span>
        </h4>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {AR.facultyChart.singleBreakdownSubtitle}
        </p>
      </div>

      {!hasCategoryData ? (
        <p className="text-xs text-slate-400 text-center py-6">
          {AR.facultyChart.singleBreakdownEmpty}
        </p>
      ) : (
        <>
          <div className="h-44 w-full min-w-0" dir="ltr">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 176 }}
            >
              <BarChart
                data={sortedCategories}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(tickValue: number) => formatNumber(tickValue)}
                />
                <YAxis
                  type="category"
                  dataKey="shortLabel"
                  width={108}
                  tick={{ fontSize: 11, fill: '#475569' }}
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
                  radius={[0, 8, 8, 0]}
                  barSize={15}
                >
                  {sortedCategories.map((entry) => (
                    <Cell key={entry.category} fill={entry.fill} />
                  ))}
                </Bar>
                <Bar
                  dataKey="approvedActivities"
                  name={AR.facultyChart.activitiesSeries}
                  fill="#94a3b8"
                  radius={[0, 8, 8, 0]}
                  barSize={15}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {sortedCategories.map((row) => (
              <div
                key={row.category}
                className="rounded-xl bg-white/75 border border-slate-100 px-3 py-2 text-center"
              >
                <p className="text-[11px] font-bold text-slate-500 truncate">{row.label}</p>
                <p className="text-[11px] font-black text-slate-700 mt-0.5">
                  {formatNumber(row.volunteerCount)} {AR.facultyChart.volunteerUnit} •{' '}
                  {formatNumber(row.approvedActivities)} {AR.facultyChart.activityUnit}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface FacultyChartProps {
  faculties: FacultyStatsRow[];
  categories?: CategoryStatsRow[];
}

/**
 * Displays sorted animated horizontal progress bars comparing approved hours across faculties.
 * When the admin narrows the dashboard to one faculty, that faculty is trivially 100% of
 * the scoped hours, so the card also renders the faculty's own category breakdown chart
 * underneath the single bar instead of leaving the rest of the wide card blank.
 */
export function FacultyChart({ faculties, categories = [] }: FacultyChartProps) {
  const sortedFaculties = [...faculties].sort(
    (left, right) => right.approvedHours - left.approvedHours
  );
  const maxHours = sortedFaculties[0]?.approvedHours || 0;
  const isSingleFaculty = sortedFaculties.length === 1;

  return (
    <section
      data-testid="faculty-chart-card"
      className="lg:col-span-2 glass-card rounded-3xl p-6 sm:p-8 space-y-6"
    >
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
        <div className="space-y-6">
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

          {isSingleFaculty && <SingleFacultyBreakdown categories={categories} />}
        </div>
      )}
    </section>
  );
}
