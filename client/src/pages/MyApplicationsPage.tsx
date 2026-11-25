import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, RefreshCw, XCircle } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { AR } from '../constants/ar';
import type { ApplicationStatus } from '../constants/enums';
import type { StudentApplicationsResponse, StudentApplication } from '../types';
import { isLapsedApplication } from '../utils/applications';
import { formatDateAr, formatDateTimeAr, formatNumber } from '../utils/format';

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  waitlisted: 'bg-violet-50 text-violet-700 border-violet-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * Student application history with populated opportunity summaries.
 */
export function MyApplicationsPage() {
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<StudentApplicationsResponse>('/applications/me')
      .then((response) => {
        if (cancelled) {
          return;
        }
        setApplications(response.data.applications);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(extractApiErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError('');
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-black text-slate-800">
            <ClipboardList className="w-6 h-6 text-mnu-gold" />
            {AR.studentPortal.applications.pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {AR.studentPortal.applications.pageSubtitle}
          </p>
        </header>

        {loading && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {AR.studentPortal.applications.loading}
          </div>
        )}

        {error && !loading && (
          <div className="glass-card rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-bold">
              <XCircle className="w-5 h-5" />
              {AR.studentPortal.applications.errorTitle}
            </div>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition"
            >
              {AR.studentPortal.common.retry}
            </button>
          </div>
        )}

        {!loading && !error && applications.length === 0 && (
          <div className="glass-card rounded-3xl p-8 text-center space-y-3">
            <p className="text-sm text-slate-500">{AR.studentPortal.applications.empty}</p>
            <Link
              to="/opportunities"
              className="inline-block px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition"
            >
              {AR.studentPortal.dashboard.viewAllOpportunities}
            </Link>
          </div>
        )}

        {!loading && !error && applications.length > 0 && (
          <section className="space-y-3">
            {applications.map((application) => {
              // A pending or waitlisted application whose opportunity has
              // already ended lapsed without a decision: it must not keep
              // claiming «في انتظار الموافقة» forever. The stored status is
              // untouched — the lapse is derived from the phase at render.
              const lapsed = isLapsedApplication(application, application.opportunity);
              return (
                <article
                  key={application._id}
                  className="glass-card rounded-3xl p-5 sm:p-6 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <Link
                        to={`/opportunities/${application.opportunity._id}`}
                        className="text-sm font-black text-slate-800 hover:text-mnu-600 transition"
                      >
                        {application.opportunity.title}
                      </Link>
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5 text-mnu-500" />
                          {formatDateTimeAr(application.opportunity.startAt)}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>{application.opportunity.location.name}</span>
                      </p>
                    </div>
                    {lapsed ? (
                      <span className="px-2.5 py-1 rounded-full border text-[11px] font-bold bg-slate-100 text-slate-600 border-slate-300">
                        {AR.studentPortal.applications.lapsedLabel}
                      </span>
                    ) : (
                      <span
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_STYLES[application.status]}`}
                      >
                        {AR.opportunities.applicationStatuses[application.status]}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-600">
                    <span>
                      {AR.studentPortal.applications.appliedAtLabel}:{' '}
                      {formatDateAr(application.appliedAt)}
                    </span>
                    <span>
                      {AR.studentPortal.applications.hoursGrantedLabel}:{' '}
                      {formatNumber(application.hoursGranted)}
                    </span>
                    {application.note && (
                      <span>
                        {AR.studentPortal.applications.noteLabel}: {application.note}
                      </span>
                    )}
                  </div>

                  <div className="pt-1">
                    <Link
                      to={`/opportunities/${application.opportunity._id}`}
                      className="inline-block px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                    >
                      {AR.studentPortal.applications.viewOpportunity}
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
