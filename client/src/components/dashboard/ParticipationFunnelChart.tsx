import { Filter } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AR } from '../../constants/ar';
import type { ParticipationFunnel } from '../../types';
import { formatNumber } from '../../utils/format';

interface ParticipationFunnelChartProps {
  funnel: ParticipationFunnel | null;
}

interface FunnelChartDatum {
  key: keyof ParticipationFunnel;
  stageLabel: string;
  count: number;
  fill: string;
}

/**
 * Renders the opportunity application funnel (applied -> accepted -> attended) plus rejected/no-show counts.
 */
export function ParticipationFunnelChart({ funnel }: ParticipationFunnelChartProps) {
  const stageRows: FunnelChartDatum[] = funnel
    ? [
        {
          key: 'applied',
          stageLabel: AR.analytics.funnelStages.applied,
          count: funnel.applied,
          fill: '#1f4e79',
        },
        {
          key: 'accepted',
          stageLabel: AR.analytics.funnelStages.accepted,
          count: funnel.accepted,
          fill: '#0ea5e9',
        },
        {
          key: 'attended',
          stageLabel: AR.analytics.funnelStages.attended,
          count: funnel.attended,
          fill: '#10b981',
        },
        {
          key: 'rejected',
          stageLabel: AR.analytics.funnelStages.rejected,
          count: funnel.rejected,
          fill: '#f43f5e',
        },
        {
          key: 'noShow',
          stageLabel: AR.analytics.funnelStages.noShow,
          count: funnel.noShow,
          fill: '#f59e0b',
        },
      ]
    : [];

  const hasApplications = Boolean(funnel && funnel.applied > 0);

  return (
    <section
      data-testid="participation-funnel-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <Filter className="w-5 h-5 text-mnu-500 shrink-0" />
          <span>{AR.analytics.funnelTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{AR.analytics.funnelSubtitle}</p>
      </div>

      {!hasApplications ? (
        <p className="text-xs text-slate-400 text-center py-8">{AR.analytics.funnelEmpty}</p>
      ) : (
        <>
          <div className="w-full h-56 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 224 }}
            >
              <BarChart data={stageRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="stageLabel" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(tickValue: number) => formatNumber(tickValue)}
                />
                <Tooltip
                  formatter={(tooltipValue) => [
                    formatNumber(Number(tooltipValue ?? 0)),
                    AR.analytics.funnelTitle,
                  ]}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {stageRows.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {stageRows.map((entry) => (
              <div
                key={entry.key}
                className="rounded-xl bg-white/75 border border-slate-100 p-2.5 text-center"
              >
                <p className="text-[11px] font-bold text-slate-500 truncate">{entry.stageLabel}</p>
                <p className="text-base font-black text-slate-800 mt-0.5">
                  {formatNumber(entry.count)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
