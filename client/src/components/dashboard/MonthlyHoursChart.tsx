import { TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AR } from '../../constants/ar';
import type { MonthlyHoursPoint } from '../../types';
import { formatNumber } from '../../utils/format';

interface MonthlyHoursChartProps {
  months: MonthlyHoursPoint[];
}

/**
 * Displays monthly approved volunteer hours trend in Cairo time using Recharts.
 */
export function MonthlyHoursChart({ months }: MonthlyHoursChartProps) {
  return (
    <section
      data-testid="monthly-hours-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-mnu-500 shrink-0" />
          <span>{AR.analytics.monthlyTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.monthlySubtitle}</p>
      </div>

      {months.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">{AR.analytics.monthlyEmpty}</p>
      ) : (
        <div className="w-full h-60 min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 240 }}
          >
            <LineChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#475569' }}
                tickFormatter={(tickValue: number) => formatNumber(tickValue)}
              />
              <Tooltip
                formatter={(tooltipValue) => [
                  `${formatNumber(Number(tooltipValue ?? 0))} ${AR.common.hourUnit}`,
                  AR.analytics.monthlyHoursSeries,
                ]}
              />
              <Line
                type="monotone"
                dataKey="approvedHours"
                name={AR.analytics.monthlyHoursSeries}
                stroke="#1f4e79"
                strokeWidth={3}
                dot={{ r: 4, fill: '#d4af37', stroke: '#1f4e79', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
