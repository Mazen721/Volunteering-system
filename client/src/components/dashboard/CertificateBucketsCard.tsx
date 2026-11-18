import { Award } from 'lucide-react';
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
import type { CertificateBuckets } from '../../types';
import { formatNumber } from '../../utils/format';

interface CertificateBucketsCardProps {
  buckets: CertificateBuckets | undefined;
  certificateHours: number;
}

interface BucketChartDatum {
  key: keyof CertificateBuckets;
  bucketLabel: string;
  rangeLabel: string;
  count: number;
  fill: string;
}

/**
 * Displays volunteer progress buckets relative to the dynamic Settings.certificateHours threshold.
 */
export function CertificateBucketsCard({
  buckets,
  certificateHours,
}: CertificateBucketsCardProps) {
  const twoThirdsThreshold = Math.ceil((certificateHours * 2) / 3);
  const bucketRows: BucketChartDatum[] = buckets
    ? [
        {
          key: 'eligible',
          bucketLabel: AR.analytics.buckets.eligible,
          rangeLabel: `${formatNumber(certificateHours)}+ ${AR.common.hourUnit}`,
          count: buckets.eligible,
          fill: '#10b981',
        },
        {
          key: 'nearEligible',
          bucketLabel: AR.analytics.buckets.nearEligible,
          rangeLabel: `${formatNumber(twoThirdsThreshold)}–${formatNumber(Math.max(twoThirdsThreshold, certificateHours - 1))} ${AR.common.hourUnit}`,
          count: buckets.nearEligible,
          fill: '#0ea5e9',
        },
        {
          key: 'inProgress',
          bucketLabel: AR.analytics.buckets.inProgress,
          rangeLabel: `${formatNumber(1)}–${formatNumber(Math.max(1, twoThirdsThreshold - 1))} ${AR.common.hourUnit}`,
          count: buckets.inProgress,
          fill: '#f59e0b',
        },
        {
          key: 'zeroHours',
          bucketLabel: AR.analytics.buckets.zeroHours,
          rangeLabel: `${formatNumber(0)} ${AR.common.hourUnit}`,
          count: buckets.zeroHours,
          fill: '#94a3b8',
        },
      ]
    : [];

  const totalCount = bucketRows.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section
      data-testid="certificate-buckets-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <Award className="w-5 h-5 text-mnu-gold shrink-0" />
          <span>{AR.analytics.bucketsTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {AR.analytics.bucketsSubtitlePrefix} {formatNumber(certificateHours)} {AR.common.hourUnit}
        </p>
      </div>

      {totalCount === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">{AR.analytics.bucketsEmpty}</p>
      ) : (
        <>
          <div className="w-full h-52 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 208 }}
            >
              <BarChart data={bucketRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucketLabel" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(tickValue: number) => formatNumber(tickValue)}
                />
                <Tooltip
                  formatter={(tooltipValue) => [
                    `${formatNumber(Number(tooltipValue ?? 0))} ${AR.facultyChart.volunteerUnit}`,
                    AR.analytics.bucketsTitle,
                  ]}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {bucketRows.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {bucketRows.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/75 border border-slate-100 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-700 truncate">{entry.bucketLabel}</p>
                  <p className="text-[10px] text-slate-500">{entry.rangeLabel}</p>
                </div>
                <span className="font-black text-slate-800 shrink-0">
                  {formatNumber(entry.count)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
