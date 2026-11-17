import { FolderOpen, ListChecks, Pencil, Trash2 } from 'lucide-react';
import { AR } from '../../constants/ar';
import { ACTIVITY_STATUSES } from '../../constants/enums';
import type { ActivityStatus } from '../../constants/enums';
import type { Activity } from '../../types';
import { formatDateAr, formatNumber } from '../../utils/format';
import { ActivityStatusBadge } from '../badges/StatusBadge';

interface StatusTab {
  key: ActivityStatus | '';
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { key: '', label: AR.profile.statusFilterAll },
  ...ACTIVITY_STATUSES.map((statusKey) => ({ key: statusKey, label: AR.statuses[statusKey] })),
];

interface ActivityRowProps {
  activity: Activity;
  updatingId: string;
  onStatusChange: (activityId: string, status: ActivityStatus) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

function ActivityRow({
  activity,
  updatingId,
  onStatusChange,
  onEdit,
  onDelete,
}: ActivityRowProps) {
  const isUpdating = updatingId === activity._id;

  return (
    <tr className="hover:bg-slate-50/80 transition">
      <td className="p-3.5 font-bold text-slate-800">{activity.title}</td>
      <td className="p-3.5 text-slate-600 whitespace-nowrap">{activity.type}</td>
      <td className="p-3.5 text-slate-600">{activity.supervisor}</td>
      <td className="p-3.5 text-center text-slate-600 whitespace-nowrap">
        {formatDateAr(activity.date)}
      </td>
      <td className="p-3.5 text-center font-black text-mnu-500 whitespace-nowrap">
        {formatNumber(activity.hours)} {AR.common.hourUnit}
      </td>
      <td className="p-3.5 text-center whitespace-nowrap">
        <div className="inline-flex flex-col items-center gap-1.5">
          <ActivityStatusBadge status={activity.status} />
          <select
            aria-label={`${AR.activityModal.statusLabel} ${activity.title}`}
            value={activity.status}
            disabled={isUpdating}
            onChange={(event) => onStatusChange(activity._id, event.target.value as ActivityStatus)}
            className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
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
}

interface ProfileActivitiesSectionProps {
  activities: Activity[];
  statusFilter: ActivityStatus | '';
  updatingId: string;
  onFilterChange: (status: ActivityStatus | '') => void;
  onStatusChange: (activityId: string, status: ActivityStatus) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

/**
 * Activities list on a volunteer's profile with status filter tabs, status switcher, edit, and delete.
 */
export function ProfileActivitiesSection({
  activities,
  statusFilter,
  updatingId,
  onFilterChange,
  onStatusChange,
  onEdit,
  onDelete,
}: ProfileActivitiesSectionProps) {
  const filteredActivities = statusFilter
    ? activities.filter((activity) => activity.status === statusFilter)
    : activities;

  return (
    <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-mnu-500" />
          <span>{AR.profile.activitiesSectionTitle}</span>
        </h3>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-mnu-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 text-xs font-bold">
              <th className="p-3.5">{AR.profile.activityColumns.title}</th>
              <th className="p-3.5">{AR.profile.activityColumns.type}</th>
              <th className="p-3.5">{AR.profile.activityColumns.supervisor}</th>
              <th className="p-3.5 text-center">{AR.profile.activityColumns.date}</th>
              <th className="p-3.5 text-center">{AR.profile.activityColumns.hours}</th>
              <th className="p-3.5 text-center">{AR.profile.activityColumns.status}</th>
              <th className="p-3.5 text-center">{AR.profile.activityColumns.actions}</th>
            </tr>
          </thead>

          {filteredActivities.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400 text-xs font-bold">
                  <FolderOpen className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                  <span>{AR.profile.emptyActivities}</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {filteredActivities.map((activity) => (
                <ActivityRow
                  key={activity._id}
                  activity={activity}
                  updatingId={updatingId}
                  onStatusChange={onStatusChange}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
