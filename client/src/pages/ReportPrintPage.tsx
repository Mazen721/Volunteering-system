import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Printer, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { UniversityLogo } from '../components/UniversityLogo';
import {
  FacultyReportChart,
  FunnelReportChart,
  InterestReportChart,
  MonthlyReportChart,
  StatusReportChart,
} from '../components/report/ReportCharts';
import { AR } from '../constants/ar';
import { useVolunteeringReport } from '../hooks/useVolunteeringReport';
import type { VolunteeringReport } from '../types';
import { formatDateAr, formatDateTimeAr, formatNumber, formatPercent } from '../utils/format';

function ReportSection({
  title,
  subtitle,
  children,
  testId,
  table = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  testId: string;
  table?: boolean;
}) {
  return (
    <section
      data-testid={testId}
      className={`${table ? 'report-table-section' : 'report-section'} mt-6`}
    >
      <div className="mb-3 border-r-4 border-[#c9a227] pr-3">
        <h2 className="text-base font-black text-[#122f4a]">{title}</h2>
        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function KpiGrid({ report }: { report: VolunteeringReport }) {
  const { overview, summary } = report;
  const cards = [
    {
      label: AR.report.kpis.volunteers,
      value: formatNumber(overview.registeredVolunteers),
      note: `${AR.report.kpis.activeVolunteers}: ${formatNumber(overview.activeVolunteers)}`,
    },
    {
      label: AR.report.kpis.approvedHours,
      value: `${formatNumber(overview.totalApprovedHours)} ${AR.common.hourUnit}`,
      note: `${AR.report.kpis.approvedActivities}: ${formatNumber(overview.approvedActivities)}`,
    },
    {
      label: AR.report.kpis.certificates,
      value: formatNumber(overview.eligibleVolunteers),
      note: `${AR.report.kpis.certificateThresholdPrefix}: ${formatNumber(overview.certificateHours)} ${AR.common.hourUnit}`,
    },
    {
      label: AR.report.kpis.opportunities,
      value: formatNumber(summary.totalOpportunities),
      note: AR.report.kpis.allStatuses,
    },
    {
      label: AR.report.kpis.applications,
      value: formatNumber(summary.totalApplications),
      note: `${AR.report.kpis.approvalRatePrefix}: ${formatPercent(summary.approvalRate)}`,
    },
    {
      label: AR.report.kpis.attendanceRate,
      value: formatPercent(summary.attendanceRate),
      note: `${AR.report.kpis.attendedPrefix}: ${formatNumber(summary.totalAttended)}`,
    },
  ];

  return (
    <div className="report-section mt-5 grid grid-cols-3 gap-3" data-testid="report-kpis">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-2xl border border-slate-200 border-t-4 border-t-[#122f4a] bg-white px-4 py-3"
        >
          <p className="text-[11px] font-bold text-slate-500">{card.label}</p>
          <p className="mt-1 text-2xl font-black text-[#122f4a]">{card.value}</p>
          <p className="mt-0.5 text-[11px] font-bold text-[#8a6d1d]">{card.note}</p>
        </article>
      ))}
    </div>
  );
}

function FacultyTable({ report }: { report: VolunteeringReport }) {
  const rows = report.faculties.faculties;
  return (
    <ReportSection
      title={AR.report.tables.facultyTitle}
      subtitle={AR.report.tables.facultySubtitle}
      testId="report-faculty-table"
      table
    >
      <table className="report-table">
        <thead>
          <tr>
            <th>{AR.report.columns.faculty}</th>
            <th>{AR.report.columns.volunteers}</th>
            <th>{AR.report.columns.activeVolunteers}</th>
            <th>{AR.report.columns.activities}</th>
            <th>{AR.report.columns.approvedHours}</th>
            <th>{AR.report.columns.averageHours}</th>
            <th>{AR.report.columns.participationRate}</th>
            <th>{AR.report.columns.share}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.faculty}>
              <td className="font-bold">{row.faculty}</td>
              <td>{formatNumber(row.volunteerCount)}</td>
              <td>{formatNumber(row.activeVolunteers ?? 0)}</td>
              <td>{formatNumber(row.approvedActivities)}</td>
              <td>{formatNumber(row.approvedHours)}</td>
              <td>{formatNumber(row.avgHours)}</td>
              <td>{formatPercent(row.participationRate ?? 0)}</td>
              <td>{formatPercent(row.percentage)}</td>
            </tr>
          ))}
          <tr className="report-total-row">
            <td>{AR.report.tables.totals}</td>
            <td>{formatNumber(report.faculties.totals.volunteerCount)}</td>
            <td>—</td>
            <td>{formatNumber(report.faculties.totals.approvedActivities)}</td>
            <td>{formatNumber(report.faculties.totals.approvedHours)}</td>
            <td>{formatNumber(report.faculties.totals.avgHours)}</td>
            <td>—</td>
            <td>{formatPercent(100)}</td>
          </tr>
        </tbody>
      </table>
    </ReportSection>
  );
}

function TopVolunteersTable({ report }: { report: VolunteeringReport }) {
  const rows = report.leaderboard.leaderboard;
  return (
    <ReportSection
      title={AR.report.tables.topVolunteersTitle}
      subtitle={AR.report.tables.topVolunteersSubtitle}
      testId="report-top-volunteers-table"
      table
    >
      {rows.length === 0 ? (
        <p className="report-empty">{AR.report.tables.empty}</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th>{AR.report.columns.rank}</th>
              <th>{AR.report.columns.volunteer}</th>
              <th>{AR.report.columns.category}</th>
              <th>{AR.report.columns.faculty}</th>
              <th>{AR.report.columns.activities}</th>
              <th>{AR.report.columns.approvedHours}</th>
              <th>{AR.report.columns.eligible}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row._id}>
                <td>{formatNumber(index + 1)}</td>
                <td>
                  <span className="font-bold">{row.fullName}</span>
                  <span className="block text-[10px] text-slate-500">
                    {AR.report.columns.volunteerId}: {row.volunteerId}
                  </span>
                </td>
                <td>{row.categoryLabel}</td>
                <td>{row.faculty}</td>
                <td>{formatNumber(row.approvedActivities)}</td>
                <td>{formatNumber(row.approvedHours)}</td>
                <td>{row.eligible ? AR.report.eligible : AR.report.notEligible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportSection>
  );
}

function CategoriesTable({ report }: { report: VolunteeringReport }) {
  const rows = report.categories.categories;
  return (
    <ReportSection
      title={AR.report.tables.categoriesTitle}
      subtitle={AR.report.tables.facultySubtitle}
      testId="report-categories-table"
      table
    >
      <table className="report-table">
        <thead>
          <tr>
            <th>{AR.report.columns.category}</th>
            <th>{AR.report.columns.volunteers}</th>
            <th>{AR.report.columns.activities}</th>
            <th>{AR.report.columns.approvedHours}</th>
            <th>{AR.report.columns.averageHours}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category}>
              <td className="font-bold">{row.label}</td>
              <td>{formatNumber(row.volunteerCount)}</td>
              <td>{formatNumber(row.approvedActivities)}</td>
              <td>{formatNumber(row.approvedHours)}</td>
              <td>{formatNumber(row.avgHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportSection>
  );
}

function OpportunitiesTable({ report }: { report: VolunteeringReport }) {
  const rows = report.opportunities;
  return (
    <ReportSection
      title={AR.report.tables.opportunitiesTitle}
      subtitle={AR.report.tables.opportunitiesSubtitle}
      testId="report-opportunities-table"
      table
    >
      {rows.length === 0 ? (
        <p className="report-empty">{AR.report.tables.empty}</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th>{AR.report.columns.opportunity}</th>
              <th>{AR.report.columns.date}</th>
              <th>{AR.report.columns.status}</th>
              <th>{AR.report.columns.hours}</th>
              <th>{AR.report.columns.slots}</th>
              <th>{AR.report.columns.applications}</th>
              <th>{AR.report.columns.accepted}</th>
              <th>{AR.report.columns.attended}</th>
              <th>{AR.report.columns.fillRate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id}>
                <td>
                  <span className="font-bold">{row.title}</span>
                  <span className="block text-[10px] text-slate-500">
                    {row.faculty ?? AR.report.allFacultiesTarget} •{' '}
                    {row.fields.map((field) => AR.interests[field]).join('، ')}
                  </span>
                </td>
                <td>{formatDateAr(row.startAt)}</td>
                <td>{AR.opportunities.statuses[row.status]}</td>
                <td>{formatNumber(row.hours)}</td>
                <td>{formatNumber(row.totalSlots)}</td>
                <td>{formatNumber(row.applicationsCount)}</td>
                <td>{formatNumber(row.acceptedCount)}</td>
                <td>
                  {formatNumber(row.attendedCount)}
                  <span className="block text-[10px] text-slate-500">
                    {formatPercent(row.attendanceRate)}
                  </span>
                </td>
                <td>{formatPercent(row.fillRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportSection>
  );
}

function ReportBody({ report }: { report: VolunteeringReport }) {
  const isUniversity = report.meta.scope === 'university';
  const scopeLabel = isUniversity
    ? AR.report.universityScope
    : `${AR.report.facultyScopePrefix} ${report.meta.faculty ?? ''}`;

  return (
    <div className="report-sheet bg-white px-6 py-6 text-slate-800 shadow-xl print:shadow-none">
      <header className="overflow-hidden rounded-3xl bg-[#122f4a] text-white">
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white p-1">
              <UniversityLogo className="h-14 w-14" />
            </span>
            <div>
              <p className="text-lg font-black">{AR.brand.university}</p>
              <p className="text-xs font-bold text-[#d9c37a]">{AR.brand.subtitle}</p>
            </div>
          </div>
          <span className="rounded-full bg-[#c9a227] px-3 py-1.5 text-[11px] font-black text-[#122f4a]">
            {scopeLabel}
          </span>
        </div>
        <div className="border-t border-white/15 px-6 py-4">
          <h1 className="text-2xl font-black">{AR.report.title}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-200">{AR.report.subtitle}</p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-4 gap-3 text-[11px] font-bold" data-testid="report-meta">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-slate-500">{AR.report.facultyScopePrefix}</dt>
          <dd className="mt-0.5 text-[#122f4a]">
            {isUniversity ? AR.report.allFacultiesTarget : report.meta.faculty}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-slate-500">{AR.report.generatedAtLabel}</dt>
          <dd className="mt-0.5 text-[#122f4a]">{formatDateTimeAr(report.meta.generatedAt)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-slate-500">{AR.report.generatedByLabel}</dt>
          <dd className="mt-0.5 text-[#122f4a]">{report.meta.generatedBy.fullName}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-slate-500">{AR.report.roleLabel}</dt>
          <dd className="mt-0.5 text-[#122f4a]">{AR.roles[report.meta.generatedBy.role]}</dd>
        </div>
      </dl>

      <KpiGrid report={report} />

      <div className="mt-6 space-y-5">
        {isUniversity && <FacultyReportChart faculties={report.faculties.faculties} />}
        <InterestReportChart interests={report.interests} />
        <div className="report-chart-grid grid grid-cols-2 gap-5">
          <MonthlyReportChart months={report.monthlyHours.months} />
          <StatusReportChart statuses={report.opportunityStatuses} />
        </div>
        <FunnelReportChart funnel={report.participation.funnel} />
      </div>

      {isUniversity && <FacultyTable report={report} />}
      <TopVolunteersTable report={report} />
      <CategoriesTable report={report} />
      <OpportunitiesTable report={report} />

      <footer className="mt-8 border-t-2 border-[#c9a227] pt-3 text-center">
        <p className="text-xs font-black text-[#122f4a]">{AR.report.footerCenter}</p>
        <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{AR.report.footerNote}</p>
      </footer>
    </div>
  );
}

/**
 * Print-optimised official volunteering report for admins (whole university)
 * and deans (their faculty only, enforced by the server). Opening the page
 * with ?autoprint=1 triggers the browser print dialog once data has loaded,
 * which is how the PDF is saved — the same pattern as the certificate folio.
 */
export function ReportPrintPage() {
  const { report, loading, error, reload } = useVolunteeringReport();
  const [searchParams] = useSearchParams();
  const printedRef = useRef(false);

  useEffect(() => {
    document.title = AR.report.title;
  }, []);

  useEffect(() => {
    if (!report || printedRef.current || searchParams.get('autoprint') !== '1') {
      return;
    }
    printedRef.current = true;
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Print remains available through the on-screen button.
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [report, searchParams]);

  return (
    <div className="report-print-page min-h-screen bg-slate-200/70 px-3 py-5 print:bg-white print:p-0">
      <div className="report-no-print mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
        >
          <ArrowRight className="h-4 w-4" />
          <span>{AR.report.backToDashboard}</span>
        </Link>
        <p className="hidden text-[11px] font-bold text-slate-500 lg:block">
          {AR.report.autoPrintHint}
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!report}
          className="inline-flex items-center gap-2 rounded-xl bg-[#122f4a] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1f4e79] disabled:opacity-50 cursor-pointer"
        >
          <Printer className="h-4 w-4 text-[#d4af37]" />
          <span>{AR.report.printButton}</span>
        </button>
      </div>

      <main className="mx-auto max-w-[820px]">
        {loading && !report ? (
          <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-xl" role="status">
            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#1f4e79]" />
            <p className="mt-3 text-sm font-black text-slate-700">{AR.report.loading}</p>
          </div>
        ) : error && !report ? (
          <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-xl" role="alert">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
            <h1 className="mt-3 text-lg font-black text-slate-800">{AR.report.errorTitle}</h1>
            <p className="mt-1 text-xs font-bold text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#122f4a] px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{AR.report.retryButton}</span>
            </button>
          </div>
        ) : report ? (
          <ReportBody report={report} />
        ) : null}
      </main>
    </div>
  );
}
