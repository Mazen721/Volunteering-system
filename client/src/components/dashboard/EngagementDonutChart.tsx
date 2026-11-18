import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AR } from '../../constants/ar';
import type { EngagementBreakdown } from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

interface EngagementDonutChartProps {
  engagement: EngagementBreakdown | null;
}

interface EngagementSlice {
  key: string;
  sliceLabel: string;
  count: number;
  fill: string;
}

/**
 * Renders an active-vs-zero-hour volunteer engagement donut chart in Arabic RTL.
 */
export function EngagementDonutChart({ engagement }: EngagementDonutChartProps) {
  const totalVolunteers = engagement ? engagement.joined + engagement.zeroHours : 0;
  const slices: EngagementSlice[] = engagement
    ? [
        {
          key: 'joined',
          sliceLabel: AR.analytics.engagementJoined,
          count: engagement.joined,
          fill: '#10b981',
        },
        {
          key: 'zeroHours',
          sliceLabel: AR.analytics.engagementZero,
          count: engagement.zeroHours,
          fill: '#cbd5e1',
        },
      ]
    : [];

  return (
    <section
      data-testid="engagement-donut-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <PieChartIcon className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{AR.analytics.engagementTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.engagementSubtitle}</p>
      </div>

      {totalVolunteers === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">{AR.analytics.engagementEmpty}</p>
      ) : (
        <>
          <div className="w-full h-52 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 208 }}
            >
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="sliceLabel"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(tooltipValue, seriesName) => [
                    formatNumber(Number(tooltipValue ?? 0)),
                    String(seriesName ?? ''),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {slices.map((slice) => {
              const share =
                totalVolunteers > 0 ? Math.round((slice.count / totalVolunteers) * 1000) / 10 : 0;
              return (
                <div
                  key={slice.key}
                  className="flex items-center justify-between gap-2 text-xs font-bold bg-white/75 border border-slate-100 rounded-xl px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.fill }}
                    />
                    <span>{slice.sliceLabel}</span>
                  </span>
                  <span className="text-slate-800 font-black">
                    {formatNumber(slice.count)} ({formatPercent(share)})
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
