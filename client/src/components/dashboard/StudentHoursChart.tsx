import { BarChart3 } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AR } from '../../constants/ar';
import { formatNumber } from '../../utils/format';

interface StudentHoursChartProps {
  approvedHours: number;
  pendingHours: number;
  remainingHours: number;
}

interface StudentHoursSlice {
  key: string;
  label: string;
  hours: number;
  fill: string;
}

/**
 * Visualizes a student's approved, pending, and remaining certificate hours in Arabic RTL.
 */
export function StudentHoursChart({
  approvedHours,
  pendingHours,
  remainingHours,
}: StudentHoursChartProps) {
  const slices: StudentHoursSlice[] = [
    {
      key: 'approved',
      label: AR.analytics.studentChartApproved,
      hours: approvedHours,
      fill: '#10b981',
    },
    {
      key: 'pending',
      label: AR.analytics.studentChartPending,
      hours: pendingHours,
      fill: '#f59e0b',
    },
    {
      key: 'remaining',
      label: AR.analytics.studentChartRemaining,
      hours: remainingHours,
      fill: '#cbd5e1',
    },
  ].filter((slice) => slice.hours > 0);

  const hasActivity = approvedHours > 0 || pendingHours > 0;

  return (
    <section
      data-testid="student-hours-chart"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-mnu-500 shrink-0" />
          <span>{AR.analytics.studentChartTitle}</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.studentChartSubtitle}</p>
      </div>

      {!hasActivity ? (
        <p className="text-xs text-slate-400 text-center py-6">{AR.analytics.studentChartEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="w-full h-44 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 280, height: 176 }}
            >
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="hours"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={66}
                  paddingAngle={3}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(tooltipValue, seriesName) => [
                    `${formatNumber(Number(tooltipValue ?? 0))} ${AR.common.hourUnit}`,
                    String(seriesName ?? ''),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {slices.map((slice) => (
              <div
                key={slice.key}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/75 border border-slate-100 px-3 py-2 text-xs font-bold"
              >
                <span className="flex items-center gap-2 text-slate-700">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.fill }}
                  />
                  <span>{slice.label}</span>
                </span>
                <span className="font-black text-slate-800">
                  {formatNumber(slice.hours)} {AR.common.hourUnit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
