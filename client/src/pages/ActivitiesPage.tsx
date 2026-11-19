import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  FolderOpen,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import { ActivityStatusBadge } from '../components/badges/StatusBadge';
import { ActivityModal } from '../components/modals/ActivityModal';
import { AR } from '../constants/ar';
import type { ActivityStatus, ActivityType, Faculty, VolunteerCategory } from '../constants/enums';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, CATEGORIES, FACULTIES } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { Activity, ActivityListResponse, VolunteerBase } from '../types';
import { formatDateAr, formatNumber } from '../utils/format';

interface ActivityFilters {
  search: string;
  status: ActivityStatus | '';
  type: ActivityType | '';
  category: VolunteerCategory | '';
  faculty: Faculty | '';
}

const INITIAL_FILTERS: ActivityFilters = {
  search: '',
  status: '',
  type: '',
  category: '',
  faculty: '',
};

function getActivityVolunteer(activity: Activity): VolunteerBase | null {
  if (activity.volunteer && typeof activity.volunteer !== 'string') {
    return activity.volunteer;
  }
  return null;
}

async function fetchActivitiesPage(
  filters: ActivityFilters,
  page: number,
  isAdmin: boolean
): Promise<ActivityListResponse> {
  const params: Record<string, string | number> = { page, limit: 20 };
  if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.status) params.status = filters.status;
  if (filters.type) params.type = filters.type;
  if (filters.category) params.category = filters.category;
  if (isAdmin && filters.faculty) params.faculty = filters.faculty;

  const response = await apiClient.get<ActivityListResponse>('/activities', { params });
  return response.data;
}

interface ActivitiesFilterBarProps {
  filters: ActivityFilters;
  isAdmin: boolean;
  hasActiveFilters: boolean;
  onUpdateFilter: <K extends keyof ActivityFilters>(field: K, value: ActivityFilters[K]) => void;
  onReset: () => void;
}

function ActivitiesFilterBar({
  filters,
  isAdmin,
  hasActiveFilters,
  onUpdateFilter,
  onReset,
}: ActivitiesFilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          aria-label={AR.activitiesPage.searchPlaceholder}
          value={filters.search}
          onChange={(event) => onUpdateFilter('search', event.target.value)}
          placeholder={AR.activitiesPage.searchPlaceholder}
          className="w-full pl-4 pr-11 py-3 bg-white/80 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
        />
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-3`}
      >
        <select
          aria-label={AR.activitiesPage.statusFilterLabel}
          value={filters.status}
          onChange={(event) => onUpdateFilter('status', event.target.value as ActivityStatus | '')}
          className="bg-white/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700"
        >
          <option value="">{AR.activitiesPage.allStatuses}</option>
          {ACTIVITY_STATUSES.map((statusKey) => (
            <option key={statusKey} value={statusKey}>
              {AR.statuses[statusKey]}
            </option>
          ))}
        </select>

        <select
          aria-label={AR.activitiesPage.typeFilterLabel}
          value={filters.type}
          onChange={(event) => onUpdateFilter('type', event.target.value as ActivityType | '')}
          className="bg-white/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700"
        >
          <option value="">{AR.activitiesPage.allTypes}</option>
          {ACTIVITY_TYPES.map((typeOption) => (
            <option key={typeOption} value={typeOption}>
              {typeOption}
            </option>
          ))}
        </select>

        <select
          aria-label={AR.activitiesPage.categoryFilterLabel}
          value={filters.category}
          onChange={(event) =>
            onUpdateFilter('category', event.target.value as VolunteerCategory | '')
          }
          className="bg-white/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700"
        >
          <option value="">{AR.activitiesPage.allCategories}</option>
          {CATEGORIES.map((categoryKey) => (
            <option key={categoryKey} value={categoryKey}>
              {AR.categories[categoryKey]}
            </option>
          ))}
        </select>

        {isAdmin && (
          <select
            aria-label={AR.activitiesPage.facultyFilterLabel}
            value={filters.faculty}
            onChange={(event) => onUpdateFilter('faculty', event.target.value as Faculty | '')}
            className="bg-white/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700"
          >
            <option value="">{AR.activitiesPage.allFaculties}</option>
            {FACULTIES.map((facultyName) => (
              <option key={facultyName} value={facultyName}>
                {facultyName}
              </option>
            ))}
          </select>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{AR.common.resetFilters}</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface ActivitiesTableProps {
  activities: Activity[];
  loading: boolean;
  page: number;
  pages: number;
  total: number;
  updatingId: string;
  onPageChange: (page: number) => void;
  onStatusChange: (activityId: string, status: ActivityStatus) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

function ActivitiesTable({
  activities,
  loading,
  page,
  pages,
  total,
  updatingId,
  onPageChange,
  onStatusChange,
  onEdit,
  onDelete,
}: ActivitiesTableProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-mnu-500 text-white text-xs font-bold">
              <th className="p-3.5 whitespace-nowrap">{AR.activitiesPage.columns.volunteer}</th>
              <th className="p-3.5 whitespace-nowrap">{AR.activitiesPage.columns.faculty}</th>
              <th className="p-3.5 whitespace-nowrap">{AR.activitiesPage.columns.title}</th>
              <th className="p-3.5 whitespace-nowrap">{AR.activitiesPage.columns.type}</th>
              <th className="p-3.5 text-center whitespace-nowrap">
                {AR.activitiesPage.columns.hours}
              </th>
              <th className="p-3.5 text-center whitespace-nowrap">
                {AR.activitiesPage.columns.date}
              </th>
              <th className="p-3.5 whitespace-nowrap">{AR.activitiesPage.columns.supervisor}</th>
              <th className="p-3.5 text-center whitespace-nowrap">
                {AR.activitiesPage.columns.status}
              </th>
              <th className="p-3.5 text-center whitespace-nowrap">
                {AR.activitiesPage.columns.actions}
              </th>
            </tr>
          </thead>

          {activities.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={9} className="text-center py-10 text-slate-400 text-xs font-bold">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <span>{AR.activitiesPage.empty}</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {activities.map((activity) => {
                const volunteer = getActivityVolunteer(activity);
                const isUpdating = updatingId === activity._id;
                return (
                  <tr key={activity._id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 font-black text-slate-800 whitespace-nowrap">
                      {volunteer ? (
                        <Link
                          to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
                          className="hover:text-mnu-500 transition"
                        >
                          {volunteer.fullName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap">
                      {volunteer?.faculty ?? '—'}
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{activity.title}</td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap">{activity.type}</td>
                    <td className="p-3.5 text-center font-black text-mnu-500 whitespace-nowrap">
                      {formatNumber(activity.hours)} {AR.common.hourUnit}
                    </td>
                    <td className="p-3.5 text-center text-slate-600 whitespace-nowrap">
                      {formatDateAr(activity.date)}
                    </td>
                    <td className="p-3.5 text-slate-600">{activity.supervisor}</td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="inline-flex flex-col items-center gap-1.5">
                        <ActivityStatusBadge status={activity.status} />
                        <select
                          aria-label={`${AR.activityModal.statusLabel} ${activity.title}`}
                          value={activity.status}
                          disabled={isUpdating}
                          onChange={(event) =>
                            onStatusChange(activity._id, event.target.value as ActivityStatus)
                          }
                          className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                        >
                          {ACTIVITY_STATUSES.map((statusKey) => (
                            <option key={statusKey} value={statusKey}>
                              {AR.statuses[statusKey]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${AR.common.edit} ${activity.title}`}
                          onClick={() => onEdit(activity)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-mnu-500 hover:text-white text-slate-600 transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${AR.common.delete} ${activity.title}`}
                          onClick={() => onDelete(activity)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <div>
          {AR.activitiesPage.shownPrefix}{' '}
          <span className="font-bold text-slate-800">{formatNumber(activities.length)}</span>{' '}
          {AR.common.ofLabel}{' '}
          <span className="font-bold text-slate-800">{formatNumber(total)}</span>{' '}
          {AR.activitiesPage.totalSuffix}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 font-bold text-slate-700 transition cursor-pointer"
          >
            {AR.common.previousPage}
          </button>
          <span className="font-bold text-slate-700 px-2">
            {AR.common.pageLabel} {formatNumber(page)} {AR.common.ofLabel} {formatNumber(pages)}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => onPageChange(page + 1)}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 font-bold text-slate-700 transition cursor-pointer"
          >
            {AR.common.nextPage}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Dedicated activity management page with faculty-scoped filtering, status approval, editing, and deletion.
 */
export function ActivitiesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<ActivityFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [modalState, setModalState] = useState<{ open: boolean; activity: Activity | null }>({
    open: false,
    activity: null,
  });
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchActivitiesPage(filters, page, isAdmin)
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setActivities(data.activities);
        setMeta({ total: data.total, pages: data.pages });
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
  }, [filters, isAdmin, page]);

  const loadActivities = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchActivitiesPage(filters, page, isAdmin);
      if (requestId !== requestRef.current) return;
      setActivities(data.activities);
      setMeta({ total: data.total, pages: data.pages });
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(extractApiErrorMessage(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [filters, isAdmin, page]);

  function updateFilter<K extends keyof ActivityFilters>(field: K, value: ActivityFilters[K]) {
    setLoading(true);
    setError('');
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function changePage(nextPage: number) {
    setLoading(true);
    setError('');
    setPage(nextPage);
  }

  function resetFilters() {
    setLoading(true);
    setError('');
    setPage(1);
    setFilters(INITIAL_FILTERS);
  }

  async function handleStatusChange(activityId: string, nextStatus: ActivityStatus) {
    setUpdatingId(activityId);
    try {
      await apiClient.patch(`/activities/${activityId}/status`, { status: nextStatus });
      showToast({ type: 'success', message: AR.activitiesPage.statusChangeSuccess });
      await loadActivities();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
    } finally {
      setUpdatingId('');
    }
  }

  async function handleConfirmDelete() {
    if (!activityToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/activities/${activityToDelete._id}`);
      showToast({ type: 'success', message: AR.activitiesPage.deleteSuccess });
      setActivityToDelete(null);
      await loadActivities();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
      setActivityToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const hasActiveFilters = Object.values(filters).some((value) => Boolean(value.trim()));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                  {AR.activitiesPage.pageTitle}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {AR.activitiesPage.pageSubtitle}
                </p>
              </div>
            </div>

          </div>

          <ActivitiesFilterBar
            filters={filters}
            isAdmin={isAdmin}
            hasActiveFilters={hasActiveFilters}
            onUpdateFilter={updateFilter}
            onReset={resetFilters}
          />

          {loading ? (
            <div className="p-8 text-center text-xs font-bold text-mnu-500">
              {AR.activitiesPage.loading}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
            >
              <AlertTriangle className="w-7 h-7 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-800">{AR.activitiesPage.errorTitle}</p>
              <p className="text-xs text-rose-700">{error}</p>
              <button
                type="button"
                onClick={loadActivities}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{AR.common.retry}</span>
              </button>
            </div>
          ) : (
            <ActivitiesTable
              activities={activities}
              loading={loading}
              page={page}
              pages={meta.pages}
              total={meta.total}
              updatingId={updatingId}
              onPageChange={changePage}
              onStatusChange={handleStatusChange}
              onEdit={(activity) => setModalState({ open: true, activity })}
              onDelete={(activity) => setActivityToDelete(activity)}
            />
          )}
        </section>
      </main>

      <ActivityModal
        isOpen={modalState.open}
        activity={modalState.activity}
        onClose={() => setModalState({ open: false, activity: null })}
        onSaved={loadActivities}
      />

      <ConfirmDialog
        isOpen={Boolean(activityToDelete)}
        title={AR.activitiesPage.deleteTitle}
        message={
          activityToDelete ? `${AR.activitiesPage.deleteMessage} (${activityToDelete.title})؟` : ''
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setActivityToDelete(null)}
      />
    </div>
  );
}
