import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AR } from '../../constants/ar';
import type {
  FacultyStatsRow,
  InterestDistributionRow,
  MonthlyHoursPoint,
  OpportunityStatusRow,
  ParticipationFunnel,
} from '../../types';
import { formatNumber, formatPercent } from '../../utils/format';

const NAVY = '#122f4a';
const BLUE = '#1f4e79';
const GOLD = '#c9a227';
const EMERALD = '#10b981';
const ROSE = '#e11d48';
const SLATE = '#94a3b8';

function ChartShell({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="report-chart-card rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="mb-3">
        <h3 className="text-sm font-black text-[#122f4a]">{title}</h3>
        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <p className="py-14 text-center text-xs font-bold text-slate-400">{AR.report.charts.empty}</p>
  );
}

function shortenFacultyLabel(faculty: string): string {
  return faculty.replace(/^كلية\s+/, '');
}

export function FacultyReportChart({ faculties }: { faculties: FacultyStatsRow[] }) {
  const data = faculties.map((row) => ({ ...row, shortName: shortenFacultyLabel(row.faculty) }));
  const hasData = data.some((row) => row.approvedHours > 0 || row.volunteerCount > 0);

  return (
    <ChartShell
      title={AR.report.charts.facultyTitle}
      subtitle={AR.report.charts.facultySubtitle}
      testId="report-faculty-chart"
    >
      {hasData ? (
        <BarChart
          width={660}
          height={290}
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 28 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="shortName"
            tick={{ fontSize: 10, fill: '#475569' }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={52}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#475569' }}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <Tooltip
            formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name ?? '')]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="approvedHours"
            name={AR.report.charts.hoursSeries}
            fill={NAVY}
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="volunteerCount"
            name={AR.report.charts.volunteersSeries}
            fill={GOLD}
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      ) : (
        <EmptyChart />
      )}
    </ChartShell>
  );
}

export function InterestReportChart({ interests }: { interests: InterestDistributionRow[] }) {
  const data = interests.filter((row) => row.opportunitiesCount > 0);
  return (
    <ChartShell
      title={AR.report.charts.interestsTitle}
      subtitle={AR.report.charts.interestsSubtitle}
      testId="report-interest-chart"
    >
      {data.length > 0 ? (
        // Recharts' vertical layout mirrors its category axis inside an RTL
        // document and draws the labels over the bars; isolating the chart in
        // an LTR box keeps the Arabic labels fully visible beside the bars.
        <div dir="ltr">
          <BarChart
            width={660}
            height={300}
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 12, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#475569' }}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 10, fill: '#475569' }}
            />
            <Tooltip
              formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name ?? '')]}
            />
            <Bar
              dataKey="opportunitiesCount"
              name={AR.report.charts.opportunitiesSeries}
              fill={BLUE}
              radius={[0, 5, 5, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </div>
      ) : (
        <EmptyChart />
      )}
    </ChartShell>
  );
}

export function MonthlyReportChart({ months }: { months: MonthlyHoursPoint[] }) {
  return (
    <ChartShell
      title={AR.report.charts.monthlyTitle}
      subtitle={AR.report.charts.monthlySubtitle}
      testId="report-monthly-chart"
    >
      {months.length > 0 ? (
        <LineChart
          width={310}
          height={245}
          data={months}
          margin={{ top: 8, right: 10, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#475569' }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={48}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: '#475569' }}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <Tooltip
            formatter={(value) => [
              `${formatNumber(Number(value ?? 0))} ${AR.common.hourUnit}`,
              AR.report.charts.hoursSeries,
            ]}
          />
          <Line
            type="monotone"
            dataKey="approvedHours"
            stroke={NAVY}
            strokeWidth={3}
            dot={{ r: 3.5, fill: GOLD, stroke: NAVY, strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </LineChart>
      ) : (
        <EmptyChart />
      )}
    </ChartShell>
  );
}

const STATUS_FILLS: Record<OpportunityStatusRow['status'], string> = {
  draft: SLATE,
  published: NAVY,
  completed: EMERALD,
  cancelled: ROSE,
};

export function StatusReportChart({ statuses }: { statuses: OpportunityStatusRow[] }) {
  const data = statuses
    .filter((row) => row.count > 0)
    .map((row) => ({ ...row, label: AR.opportunities.statuses[row.status] }));

  return (
    <ChartShell
      title={AR.report.charts.statusTitle}
      subtitle={AR.report.charts.statusSubtitle}
      testId="report-status-chart"
    >
      {data.length > 0 ? (
        <div>
          <PieChart width={310} height={220}>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={3}
              isAnimationActive={false}
            >
              {data.map((row) => (
                <Cell key={row.status} fill={STATUS_FILLS[row.status]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name ?? '')]}
            />
          </PieChart>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
            {data.map((row) => (
              <p
                key={row.status}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_FILLS[row.status] }}
                  />
                  {row.label}
                </span>
                <span>
                  {formatNumber(row.count)} ({formatPercent(row.percentage)})
                </span>
              </p>
            ))}
          </div>
        </div>
      ) : (
        <EmptyChart />
      )}
    </ChartShell>
  );
}

export function FunnelReportChart({ funnel }: { funnel: ParticipationFunnel }) {
  const data = [
    { stage: AR.analytics.funnelStages.applied, count: funnel.applied, fill: NAVY },
    { stage: AR.analytics.funnelStages.accepted, count: funnel.accepted, fill: '#0ea5e9' },
    { stage: AR.analytics.funnelStages.attended, count: funnel.attended, fill: EMERALD },
    { stage: AR.analytics.funnelStages.rejected, count: funnel.rejected, fill: ROSE },
    { stage: AR.analytics.funnelStages.noShow, count: funnel.noShow, fill: '#f59e0b' },
  ];

  return (
    <ChartShell
      title={AR.report.charts.funnelTitle}
      subtitle={AR.report.charts.funnelSubtitle}
      testId="report-funnel-chart"
    >
      {funnel.applied > 0 ? (
        <div className="flex justify-center">
          <BarChart
            width={660}
            height={260}
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 9, fill: '#475569' }}
              interval={0}
              angle={-16}
              textAnchor="end"
              height={50}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#475569' }}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            <Tooltip
              formatter={(value) => [
                formatNumber(Number(value ?? 0)),
                AR.report.charts.funnelTitle,
              ]}
            />
            <Bar dataKey="count" radius={[5, 5, 0, 0]} isAnimationActive={false}>
              {data.map((row) => (
                <Cell key={row.stage} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </div>
      ) : (
        <EmptyChart />
      )}
    </ChartShell>
  );
}
