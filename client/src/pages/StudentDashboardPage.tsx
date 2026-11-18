import { Link } from 'react-router-dom';
import {
  Award,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Radio,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { StudentHoursChart } from '../components/dashboard/StudentHoursChart';
import { OpportunityCard } from '../components/student/OpportunityCard';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import { formatDateAr, formatNumber, formatPercent } from '../utils/format';

/**
 * Student dashboard with certificate progress, live/upcoming events, Recharts breakdown, recommendations, and activities.
 */
export function StudentDashboardPage() {
  const { user } = useAuth();
  const { summary, recommendations, loading, error, retry } = useStudentDashboard();
  const isPendingAccount = user?.status === 'pending';

  const progressPercent =
    summary && summary.certificateHours > 0
      ? Math.min(100, Math.round((summary.approvedHours / summary.certificateHours) * 100))
      : 0;

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-slate-800">
            {AR.studentPortal.dashboard.pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {AR.studentPortal.dashboard.pageSubtitle}
          </p>
        </header>

        {isPendingAccount && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1"
          >
            <p className="text-xs font-black">{AR.pending.waitingTitle}</p>
            <p className="text-xs font-semibold leading-relaxed">{AR.pending.waitingSubtitle}</p>
          </div>
        )}

        {loading && !summary && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {AR.studentPortal.dashboard.loading}
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="glass-card rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-bold">
              <XCircle className="w-5 h-5" />
              {AR.studentPortal.dashboard.errorTitle}
            </div>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition cursor-pointer"
            >
              {AR.studentPortal.common.retry}
            </button>
          </div>
        )}

        {summary && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-card rounded-3xl p-5 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  {AR.studentPortal.dashboard.approvedHoursLabel}
                </p>
                <p className="text-2xl font-black text-emerald-600">
                  <span data-testid="approved-hours">{formatNumber(summary.approvedHours)}</span>
                </p>
              </div>
              <div className="glass-card rounded-3xl p-5 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  {AR.studentPortal.dashboard.pendingHoursLabel}
                </p>
                <p className="text-2xl font-black text-amber-600">
                  {formatNumber(summary.pendingHours)}
                </p>
              </div>
              <div className="glass-card rounded-3xl p-5 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  {AR.studentPortal.dashboard.remainingHoursLabel}
                </p>
                <p className="text-2xl font-black text-sky-600">
                  <span data-testid="remaining-hours">{formatNumber(summary.remainingHours)}</span>
                </p>
              </div>
              <div className="glass-card rounded-3xl p-5 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  {AR.studentPortal.dashboard.eventsAttendedLabel}
                </p>
                <p className="text-2xl font-black text-mnu-600">
                  {formatNumber(summary.eventsAttended)}
                </p>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <Award className="w-5 h-5 text-mnu-gold" />
                    {AR.studentPortal.dashboard.certificateHoursLabel}:{' '}
                    <span data-testid="certificate-hours">
                      {formatNumber(summary.certificateHours)}
                    </span>
                  </p>
                  {summary.eligible ? (
                    <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                      {AR.studentPortal.dashboard.eligibleBadge}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold">
                      {AR.studentPortal.dashboard.ineligibleBadge}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>{AR.studentPortal.dashboard.progressLabel}</span>
                    <span>{formatPercent(progressPercent)}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={AR.studentPortal.dashboard.progressLabel}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                    className="h-3 rounded-full bg-slate-100 overflow-hidden"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-mnu-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {summary.eligible && (
                  <p className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black">
                    <CheckCircle2 className="w-4 h-4" />
                    {AR.studentPortal.dashboard.eligibleNotice}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {AR.studentPortal.dashboard.certificateNote}
                </p>
              </section>

              <StudentHoursChart
                approvedHours={summary.approvedHours}
                pendingHours={summary.pendingHours}
                remainingHours={summary.remainingHours}
              />
            </div>

            {summary.happeningNow.length > 0 && (
              <section className="rounded-3xl p-5 sm:p-6 bg-emerald-600 text-white shadow-lg space-y-3">
                <p className="flex items-center gap-2 text-sm font-black">
                  <Radio className="w-5 h-5 animate-pulse" />
                  {AR.studentPortal.dashboard.happeningNowTitle}
                </p>
                <p className="text-xs text-emerald-50">
                  {AR.studentPortal.dashboard.happeningNowSubtitle}
                </p>
                <div className="space-y-2">
                  {summary.happeningNow.map((opportunity) => (
                    <Link
                      key={opportunity._id}
                      to={`/checkin/${encodeURIComponent(opportunity._id)}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 transition"
                    >
                      <div className="space-y-0.5">
                        <span className="block text-xs font-black">{opportunity.title}</span>
                        <span className="block text-[11px] font-semibold text-emerald-50">
                          {opportunity.location.name}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-white text-emerald-700 text-[11px] font-black">
                        {AR.studentPortal.dashboard.happeningNowCta}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <CalendarCheck2 className="w-5 h-5 text-mnu-500" />
                    {AR.studentPortal.dashboard.upcomingTitle}
                  </p>
                  <Link
                    to="/me/applications"
                    className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
                  >
                    {AR.studentPortal.dashboard.viewAllApplications}
                  </Link>
                </div>
                {summary.upcomingAccepted.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {AR.studentPortal.dashboard.upcomingEmpty}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {summary.upcomingAccepted.map((opportunity) => (
                      <li key={opportunity._id}>
                        <Link
                          to={`/opportunities/${opportunity._id}`}
                          className="block p-3 rounded-2xl bg-white/70 border border-slate-200/80 hover:border-mnu-200 transition"
                        >
                          <p className="text-xs font-black text-slate-800">{opportunity.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatDateAr(opportunity.startAt)} • {opportunity.location.name}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <Clock3 className="w-5 h-5 text-mnu-500" />
                    {AR.studentPortal.dashboard.recentActivitiesTitle}
                  </p>
                </div>
                {summary.recentActivities.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {AR.studentPortal.dashboard.recentActivitiesEmpty}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {summary.recentActivities.map((activity) => (
                      <li
                        key={activity._id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/70 border border-slate-200/80"
                      >
                        <div>
                          <p className="text-xs font-black text-slate-800">{activity.title}</p>
                          <p className="text-[11px] text-slate-500">{formatDateAr(activity.date)}</p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            activity.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {formatNumber(activity.hours)} {AR.studentPortal.common.hours}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                  <Sparkles className="w-5 h-5 text-mnu-gold" />
                  {AR.studentPortal.dashboard.recommendationsTitle}
                </p>
                <Link
                  to="/opportunities"
                  className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
                >
                  {AR.studentPortal.dashboard.viewAllOpportunities}
                </Link>
              </div>
              {recommendations.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {AR.studentPortal.dashboard.recommendationsEmpty}
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {recommendations.map((opportunity) => (
                    <OpportunityCard key={opportunity._id} opportunity={opportunity} />
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                  <CalendarClock className="w-5 h-5 text-mnu-500" />
                  {AR.studentPortal.dashboard.activeApplicationsTitle}
                </p>
              </div>
              {summary.activeApplications.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {AR.studentPortal.dashboard.activeApplicationsEmpty}
                </p>
              ) : (
                <ul className="space-y-2">
                  {summary.activeApplications.map((application) => (
                    <li key={application._id}>
                      <Link
                        to={`/opportunities/${application.opportunity._id}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/70 border border-slate-200/80 hover:border-mnu-200 transition"
                      >
                        <span className="text-xs font-black text-slate-800">
                          {application.opportunity.title}
                        </span>
                        <span className="text-[11px] font-bold text-mnu-600">
                          {AR.opportunities.applicationStatuses[application.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
