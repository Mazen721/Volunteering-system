import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Search, UserCheck } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { RegistrationCard } from '../components/approvals/RegistrationCard';
import { RejectRegistrationModal } from '../components/approvals/RejectRegistrationModal';
import { AR } from '../constants/ar';
import type { Faculty, UserRole } from '../constants/enums';
import { FACULTIES } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { RegistrationQueueItem, RegistrationsListResponse } from '../types';

async function fetchRegistrationQueue(
  statusFilter: string,
  facultyFilter: Faculty | '',
  reviewerRole: UserRole
): Promise<RegistrationQueueItem[]> {
  const params: Record<string, string> = {};
  if (statusFilter) {
    params.status = statusFilter;
  }
  if (reviewerRole === 'admin' && facultyFilter) {
    params.faculty = facultyFilter;
  }
  const response = await apiClient.get<RegistrationsListResponse>('/registrations', { params });
  return response.data.registrations;
}

/**
 * Dean and Admin registration approval queue with existing volunteer linking and mismatch guards.
 */
export function ApprovalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const reviewerRole = user?.role ?? 'dean';

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [facultyFilter, setFacultyFilter] = useState<Faculty | ''>('');
  const [search, setSearch] = useState('');
  const [registrations, setRegistrations] = useState<RegistrationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RegistrationQueueItem | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchRegistrationQueue(statusFilter, facultyFilter, reviewerRole)
      .then((items) => {
        if (requestId !== requestRef.current) return;
        setRegistrations(items);
        setError('');
      })
      .catch((err: unknown) => {
        if (requestId === requestRef.current) {
          setError(extractApiErrorMessage(err));
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      });
  }, [statusFilter, facultyFilter, reviewerRole]);

  const reloadRegistrations = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const items = await fetchRegistrationQueue(statusFilter, facultyFilter, reviewerRole);
      if (requestId === requestRef.current) {
        setRegistrations(items);
      }
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(extractApiErrorMessage(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [statusFilter, facultyFilter, reviewerRole]);

  function changeStatusFilter(nextStatus: string) {
    setLoading(true);
    setError('');
    setStatusFilter(nextStatus);
  }

  function changeFacultyFilter(nextFaculty: Faculty | '') {
    setLoading(true);
    setError('');
    setFacultyFilter(nextFaculty);
  }

  const filteredRegistrations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return registrations;
    }
    return registrations.filter(
      (registration) =>
        registration.fullName.toLowerCase().includes(term) ||
        registration.email.toLowerCase().includes(term) ||
        registration.registration.volunteerId.toLowerCase().includes(term)
    );
  }, [registrations, search]);

  async function handleApprove(userId: string, facultyOverride?: Faculty) {
    setApprovingId(userId);
    try {
      await apiClient.post(
        `/registrations/${userId}/approve`,
        facultyOverride ? { facultyOverride } : {}
      );
      showToast({ type: 'success', message: AR.approvals.approveSuccess });
      await reloadRegistrations();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(userId: string, rejectionReason: string) {
    setRejecting(true);
    try {
      await apiClient.post(`/registrations/${userId}/reject`, { rejectionReason });
      showToast({ type: 'success', message: AR.approvals.rejectSuccess });
      setRejectTarget(null);
      await reloadRegistrations();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-800">
                  {AR.approvals.pageTitle}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">{AR.approvals.pageSubtitle}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={reloadRegistrations}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{AR.dashboard.refreshButton}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {AR.approvals.statusTabs.map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key || 'all'}
                    type="button"
                    onClick={() => changeStatusFilter(tab.key)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      active
                        ? 'bg-mnu-500 text-white shadow-sm'
                        : 'bg-white/80 text-slate-600 hover:bg-white border border-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={AR.approvals.searchPlaceholder}
                  aria-label={AR.approvals.searchPlaceholder}
                  className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
                />
              </div>

              {reviewerRole === 'admin' && (
                <select
                  aria-label={AR.approvals.facultyFilterLabel}
                  value={facultyFilter}
                  onChange={(event) => changeFacultyFilter(event.target.value as Faculty | '')}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="">{AR.approvals.allFaculties}</option>
                  {FACULTIES.map((faculty) => (
                    <option key={faculty} value={faculty}>
                      {faculty}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <div className="glass-card rounded-3xl p-8 text-center text-xs font-bold text-mnu-500">
            {AR.approvals.loading}
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="glass-card rounded-3xl p-6 border border-rose-200 bg-rose-50/70 flex flex-wrap items-center justify-between gap-3 text-rose-800"
          >
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-extrabold">{AR.approvals.errorTitle}</p>
                <p className="font-normal mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={reloadRegistrations}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
            >
              {AR.common.retry}
            </button>
          </div>
        )}

        {!loading && !error && filteredRegistrations.length === 0 && (
          <div className="glass-card rounded-3xl p-10 text-center text-xs sm:text-sm font-bold text-slate-500">
            {AR.approvals.empty}
          </div>
        )}

        {!loading && !error && filteredRegistrations.length > 0 && (
          <div className="space-y-4">
            {filteredRegistrations.map((registration) => (
              <RegistrationCard
                key={registration.id}
                registration={registration}
                reviewerRole={reviewerRole}
                approvingId={approvingId}
                onApprove={handleApprove}
                onOpenReject={setRejectTarget}
              />
            ))}
          </div>
        )}
      </main>

      <RejectRegistrationModal
        target={rejectTarget}
        submitting={rejecting}
        onConfirm={handleReject}
        onClose={() => setRejectTarget(null)}
      />
    </div>
  );
}
