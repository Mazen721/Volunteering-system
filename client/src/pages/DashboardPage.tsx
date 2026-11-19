import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  LineChart,
  RefreshCw,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { CertificateBucketsCard } from '../components/dashboard/CertificateBucketsCard';
import { DashboardErrorState } from '../components/dashboard/DashboardErrorState';
import { EngagementDonutChart } from '../components/dashboard/EngagementDonutChart';
import { EventEfficiencyCard } from '../components/dashboard/EventEfficiencyCard';
import { DeanFacultyCard } from '../components/dashboard/DeanFacultyCard';
import { FacultyChart } from '../components/dashboard/FacultyChart';
import { FacultyComparisonChart } from '../components/dashboard/FacultyComparisonChart';
import { KpiGrid } from '../components/dashboard/KpiGrid';
import { LeaderboardCard } from '../components/dashboard/LeaderboardCard';
import { MonthlyHoursChart } from '../components/dashboard/MonthlyHoursChart';
import { ParticipationFunnelChart } from '../components/dashboard/ParticipationFunnelChart';
import { AR } from '../constants/ar';
import type { Faculty } from '../constants/enums';
import { FACULTIES } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import type { OverviewStats, ZeroHourVolunteerRow } from '../types';
import { formatNumber } from '../utils/format';

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-label={AR.dashboard.loading}>
      <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="h-7 w-64 rounded-xl shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-28 rounded-2xl shimmer" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-80 rounded-3xl shimmer" />
        <div className="h-80 rounded-3xl shimmer" />
      </div>
    </div>
  );
}

interface QuickQueuesStripProps {
  overview: OverviewStats;
  isAdmin: boolean;
}

function QuickQueuesStrip({ overview, isAdmin }: QuickQueuesStripProps) {
  return (
    <section
      aria-label={AR.dashboard.quickQueuesTitle}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.dashboard.eventsThisMonthCard}
          </p>
          <p className="text-2xl font-black text-mnu-500 mt-0.5">
            {formatNumber(overview.eventsThisMonth ?? 0)}
          </p>
        </div>
        <Link
          to="/opportunities/manage"
          className="px-3 py-1.5 rounded-xl bg-mnu-500/10 text-mnu-600 text-xs font-bold hover:bg-mnu-500/20 transition shrink-0 flex items-center gap-1.5"
        >
          <CalendarDays className="w-4 h-4" />
          <span>{AR.dashboard.openOpportunitiesLink}</span>
        </Link>
      </div>

      <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.dashboard.pendingRegistrationsCard}
          </p>
          <p className="text-2xl font-black text-amber-600 mt-0.5">
            {formatNumber(overview.pendingRegistrations ?? 0)}
          </p>
        </div>
        <Link
          to="/approvals"
          className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition shrink-0 flex items-center gap-1.5"
        >
          <UserCheck className="w-4 h-4" />
          <span>{AR.dashboard.openApprovalsLink}</span>
        </Link>
      </div>

      <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500">
            {AR.dashboard.pendingApplicationsCard}
          </p>
          <p className="text-2xl font-black text-sky-600 mt-0.5">
            {formatNumber(overview.pendingApplications ?? 0)}
          </p>
        </div>
        <Link
          to="/opportunities/manage"
          className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 transition shrink-0 flex items-center gap-1.5"
        >
          <ClipboardList className="w-4 h-4" />
          <span>{AR.dashboard.openOpportunitiesLink}</span>
        </Link>
      </div>

      {isAdmin && (
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500">{AR.nav.deans}</p>
            <p className="text-xs font-black text-slate-700 mt-1">{AR.roles.dean}</p>
          </div>
          <Link
            to="/deans"
            className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 text-xs font-bold hover:bg-purple-100 transition shrink-0 flex items-center gap-1.5"
          >
            <Shield className="w-4 h-4" />
            <span>{AR.dashboard.openDeansLink}</span>
          </Link>
        </div>
      )}
    </section>
  );
}

interface ZeroHourVolunteersCardProps {
  volunteers: ZeroHourVolunteerRow[];
}

function ZeroHourVolunteersCard({ volunteers }: ZeroHourVolunteersCardProps) {
  return (
    <section
      data-testid="zero-hour-volunteers-card"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4 min-w-0"
    >
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <UserX className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{AR.dashboard.zeroHourStudentsTitle}</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{AR.dashboard.zeroHourStudentsSubtitle}</p>
      </div>

      {volunteers.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">
          {AR.dashboard.zeroHourStudentsEmpty}
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {volunteers.map((volunteer) => (
            <li
              key={volunteer._id}
              className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white/75 border border-slate-100"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">{volunteer.fullName}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {volunteer.faculty} • {AR.categories[volunteer.category]}
                </p>
              </div>
              <Link
                to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-mnu-500 hover:text-white text-slate-700 text-[11px] font-bold transition shrink-0"
              >
                {AR.dashboard.zeroHourAction}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface DashboardAlertBannerProps {
  message: string;
  tone: 'error' | 'warning';
  onRetry: () => void;
}

function DashboardAlertBanner({ message, tone, onRetry }: DashboardAlertBannerProps) {
  const palette =
    tone === 'error'
      ? {
          container: 'bg-rose-50 border-rose-200 text-rose-700',
          button: 'bg-rose-600 hover:bg-rose-700',
        }
      : {
          container: 'bg-amber-50 border-amber-200 text-amber-800',
          button: 'bg-amber-600 hover:bg-amber-700',
        };

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border text-xs font-bold ${palette.container}`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={`px-3 py-1.5 rounded-lg text-white transition shrink-0 cursor-pointer ${palette.button}`}
      >
        {AR.dashboard.retryButton}
      </button>
    </div>
  );
}

/**
 * Role-based Admin and Dean analytics dashboard with faculty isolation, Recharts insights, and quick queues.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const isDean = user?.role === 'dean';
  const isAdmin = !isDean;

  const {
    overview,
    faculties,
    leaderboard,
    certificateHours,
    participation,
    events,
    monthlyHours,
    analyticsError,
    activeCategory,
    activeFaculty,
    initialLoading,
    refreshing,
    pageError,
    leaderboardLoading,
    leaderboardError,
    selectCategory,
    selectFaculty,
    refresh,
  } = useDashboardStats();

  const headerTitle =
    isDean && user?.faculty
      ? `${AR.dashboard.deanTitlePrefix} ${user.faculty}`
      : AR.dashboard.title;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {initialLoading && !overview ? (
          <DashboardSkeleton />
        ) : pageError && !overview ? (
          <DashboardErrorState message={pageError} onRetry={refresh} />
        ) : (
          <>
            {pageError && (
              <DashboardAlertBanner message={pageError} tone="error" onRetry={refresh} />
            )}

            <section className="glass-card rounded-3xl p-5 sm:p-8 relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mnu-500/10 text-mnu-500 text-xs font-bold mb-2.5">
                    <LineChart className="w-4 h-4" />
                    <span>{isDean ? AR.dashboard.deanBadge : AR.dashboard.badge}</span>
                  </div>
                  <h2 className="text-xl sm:text-3xl font-black text-slate-800">{headerTitle}</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {isDean ? AR.dashboard.deanSubtitle : AR.dashboard.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {isAdmin && (
                    <select
                      aria-label={AR.dashboard.facultyFilterLabel}
                      value={activeFaculty}
                      onChange={(event) => void selectFaculty(event.target.value as Faculty | '')}
                      className="w-full sm:w-auto max-w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-mnu-500/30"
                    >
                      <option value="">{AR.dashboard.allFacultiesOption}</option>
                      {FACULTIES.map((faculty) => (
                        <option key={faculty} value={faculty}>
                          {faculty}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-mnu-500/20 active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? AR.dashboard.refreshing : AR.dashboard.refreshButton}</span>
                  </button>
                </div>
              </div>

              {overview && <KpiGrid overview={overview} />}
            </section>

            {overview && <QuickQueuesStrip overview={overview} isAdmin={isAdmin} />}

            {analyticsError && (
              <DashboardAlertBanner
                message={`${AR.dashboard.analyticsErrorTitle}: ${analyticsError}`}
                tone="warning"
                onRetry={refresh}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              {isDean ? (
                <DeanFacultyCard faculties={faculties} />
              ) : (
                <FacultyChart faculties={faculties} />
              )}
              <LeaderboardCard
                volunteers={leaderboard}
                certificateHours={certificateHours}
                activeCategory={activeCategory}
                onSelectCategory={selectCategory}
                loading={leaderboardLoading}
                error={leaderboardError}
              />
            </div>

            {isAdmin && !activeFaculty && <FacultyComparisonChart faculties={faculties} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <ParticipationFunnelChart funnel={participation?.funnel ?? null} />
              <EngagementDonutChart engagement={participation?.engagement ?? null} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <MonthlyHoursChart months={monthlyHours} />
              <CertificateBucketsCard
                buckets={overview?.certificateBuckets}
                certificateHours={certificateHours}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              <div className="lg:col-span-2 min-w-0">
                <EventEfficiencyCard events={events} />
              </div>
              <ZeroHourVolunteersCard volunteers={overview?.zeroHourVolunteers ?? []} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
