import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { CreateDeanModal } from '../components/modals/CreateDeanModal';
import type { ResetPasswordTarget } from '../components/modals/ResetPasswordModal';
import { ResetPasswordModal } from '../components/modals/ResetPasswordModal';
import { AR } from '../constants/ar';
import type { Faculty } from '../constants/enums';
import { FACULTIES } from '../constants/enums';
import { useToast } from '../context/toastContext';
import type { AuthUser, UsersListResponse } from '../types';
import { formatDateAr } from '../utils/format';

async function fetchDeanUsers(facultyFilter: Faculty | ''): Promise<AuthUser[]> {
  const params: Record<string, string> = { role: 'dean' };
  if (facultyFilter) {
    params.faculty = facultyFilter;
  }
  const response = await apiClient.get<UsersListResponse>('/users', { params });
  return response.data.users;
}

/**
 * Admin-only page for creating, enabling/disabling, and resetting temporary passwords for faculty deans.
 */
export function DeansPage() {
  const { showToast } = useToast();
  const [deans, setDeans] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [facultyFilter, setFacultyFilter] = useState<Faculty | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);

  const requestRef = useRef(0);

  const loadDeans = useCallback(async (faculty: Faculty | '') => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const items = await fetchDeanUsers(faculty);
      if (requestId === requestRef.current) {
        setDeans(items);
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
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchDeanUsers(facultyFilter)
      .then((items) => {
        if (requestId !== requestRef.current) return;
        setDeans(items);
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
  }, [facultyFilter]);

  function changeFacultyFilter(nextFaculty: Faculty | '') {
    setLoading(true);
    setError('');
    setFacultyFilter(nextFaculty);
  }

  const filteredDeans = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return deans;
    }
    return deans.filter(
      (dean) =>
        dean.fullName.toLowerCase().includes(term) ||
        dean.email.toLowerCase().includes(term) ||
        (dean.faculty ?? '').toLowerCase().includes(term)
    );
  }, [deans, search]);

  async function handleToggleStatus(dean: AuthUser) {
    const nextStatus = dean.status === 'active' ? 'disabled' : 'active';
    setTogglingId(dean.id);
    try {
      await apiClient.patch(`/users/${encodeURIComponent(dean.id)}`, { status: nextStatus });
      showToast({
        type: 'success',
        message: nextStatus === 'disabled' ? AR.deans.disableSuccess : AR.deans.enableSuccess,
      });
      await loadDeans(facultyFilter);
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                  {AR.deans.pageTitle}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{AR.deans.pageSubtitle}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => loadDeans(facultyFilter)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{AR.dashboard.refreshButton}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>{AR.deans.addDeanBtn}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label={AR.deans.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={AR.deans.searchPlaceholder}
                className="w-full pr-10 pl-3 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
              />
            </div>

            <select
              aria-label={AR.deans.facultyFilterLabel}
              value={facultyFilter}
              onChange={(event) => changeFacultyFilter(event.target.value as Faculty | '')}
              className="px-3.5 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="">{AR.deans.allFaculties}</option>
              {FACULTIES.map((faculty) => (
                <option key={faculty} value={faculty}>
                  {faculty}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-bold text-mnu-500">{AR.deans.loading}</div>
          ) : error ? (
            <div
              role="alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
            >
              <AlertCircle className="w-7 h-7 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-800">{AR.deans.errorTitle}</p>
              <p className="text-xs text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => loadDeans(facultyFilter)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{AR.common.retry}</span>
              </button>
            </div>
          ) : filteredDeans.length === 0 ? (
            <div className="p-10 text-center text-xs sm:text-sm font-bold text-slate-500">
              {AR.deans.empty}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-mnu-500 text-white text-xs font-bold">
                    <th className="p-4 whitespace-nowrap">{AR.deans.columns.name}</th>
                    <th className="p-4 whitespace-nowrap">{AR.deans.columns.email}</th>
                    <th className="p-4 whitespace-nowrap">{AR.deans.columns.faculty}</th>
                    <th className="p-4 text-center whitespace-nowrap">{AR.deans.columns.status}</th>
                    <th className="p-4 text-center whitespace-nowrap">
                      {AR.deans.columns.lastLogin}
                    </th>
                    <th className="p-4 text-center whitespace-nowrap">
                      {AR.deans.columns.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {filteredDeans.map((dean) => {
                    const isActive = dean.status === 'active';
                    const isBusy = togglingId === dean.id;
                    return (
                      <tr key={dean.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 font-black text-slate-800 whitespace-nowrap">
                          {dean.fullName}
                        </td>
                        <td className="p-4 text-slate-600 whitespace-nowrap">{dean.email}</td>
                        <td className="p-4 text-slate-700 whitespace-nowrap">{dean.faculty}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isActive ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                            <span>{AR.userStatuses[dean.status]}</span>
                          </span>
                        </td>
                        <td className="p-4 text-center text-slate-500 whitespace-nowrap">
                          {dean.lastLoginAt
                            ? formatDateAr(dean.lastLoginAt)
                            : AR.deans.neverLoggedIn}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleStatus(dean)}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer disabled:opacity-60 ${
                                isActive
                                  ? 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200'
                                  : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200'
                              }`}
                            >
                              {isActive ? AR.deans.disableBtn : AR.deans.enableBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setResetTarget({ userId: dean.id, fullName: dean.fullName })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white border border-amber-200 text-[11px] font-bold transition cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>{AR.deans.resetPasswordBtn}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <CreateDeanModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => loadDeans(facultyFilter)}
      />

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
