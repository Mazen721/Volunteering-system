import { Link } from 'react-router-dom';
import { Award, FolderOpen, IdCard, Lock, Pencil, Trash2 } from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { formatNumber } from '../../utils/format.js';
import { CategoryBadge, EligibilityBadge } from '../badges/StatusBadge.jsx';

function TableSkeletonRows() {
  return (
    <tbody>
      {[0, 1, 2, 3].map((rowIndex) => (
        <tr key={rowIndex} className="border-t border-slate-100">
          <td colSpan={8} className="p-3">
            <div className="h-10 rounded-xl shimmer" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function VolunteerRow({ volunteer, onEdit, onDelete }) {
  const activityWord =
    volunteer.totalActivities === 1 ? AR.common.activitySingular : AR.common.activityPlural;

  return (
    <tr className="hover:bg-slate-50/80 transition">
      <td className="p-4 font-bold text-slate-600 whitespace-nowrap">{volunteer.volunteerId}</td>
      <td className="p-4 font-bold text-slate-800">
        <Link
          to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
          className="inline-flex items-center gap-2 hover:text-mnu-500 transition underline decoration-amber-400 decoration-2 font-black"
        >
          <IdCard className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{volunteer.fullName}</span>
        </Link>
      </td>
      <td className="p-4 whitespace-nowrap">
        <CategoryBadge category={volunteer.category} label={volunteer.categoryLabel} />
      </td>
      <td className="p-4 text-slate-600">{volunteer.faculty}</td>
      <td className="p-4 text-center whitespace-nowrap">
        <span className="inline-block bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-black border border-slate-200">
          {formatNumber(volunteer.totalActivities)} {activityWord}
        </span>
      </td>
      <td className="p-4 text-center font-black text-mnu-500 text-sm whitespace-nowrap">
        {formatNumber(volunteer.approvedHours)} {AR.common.hourUnit}
      </td>
      <td className="p-4 text-center whitespace-nowrap">
        <EligibilityBadge eligible={volunteer.eligible} remainingHours={volunteer.remainingHours} />
      </td>
      <td className="p-4">
        <div className="flex items-center justify-center gap-1.5">
          {volunteer.eligible ? (
            <Link
              to={`/certificate/${encodeURIComponent(volunteer.volunteerId)}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition shadow-sm"
            >
              <Award className="w-3.5 h-3.5" />
              <span>{AR.volunteers.issueCertificate}</span>
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold cursor-not-allowed"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{AR.volunteers.certificateLocked}</span>
            </button>
          )}

          <button
            type="button"
            aria-label={`${AR.common.edit} ${volunteer.fullName}`}
            onClick={() => onEdit(volunteer)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-mnu-500 hover:text-white text-slate-600 transition cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-label={`${AR.common.delete} ${volunteer.fullName}`}
            onClick={() => onDelete(volunteer)}
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Displays volunteers data table with loading skeleton, empty state, and pagination.
 */
export function VolunteersTable({
  volunteers,
  loading,
  total,
  page,
  pages,
  onPageChange,
  onEdit,
  onDelete,
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-mnu-500 text-white text-xs font-bold">
              <th className="p-4 whitespace-nowrap">{AR.volunteers.columns.id}</th>
              <th className="p-4 whitespace-nowrap">{AR.volunteers.columns.name}</th>
              <th className="p-4 whitespace-nowrap">{AR.volunteers.columns.category}</th>
              <th className="p-4 whitespace-nowrap">{AR.volunteers.columns.faculty}</th>
              <th className="p-4 text-center whitespace-nowrap">
                {AR.volunteers.columns.activities}
              </th>
              <th className="p-4 text-center whitespace-nowrap">{AR.volunteers.columns.hours}</th>
              <th className="p-4 text-center whitespace-nowrap">
                {AR.volunteers.columns.eligibility}
              </th>
              <th className="p-4 text-center whitespace-nowrap">{AR.volunteers.columns.actions}</th>
            </tr>
          </thead>

          {loading ? (
            <TableSkeletonRows />
          ) : volunteers.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400 text-xs font-bold">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <span>{AR.volunteers.empty}</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {volunteers.map((volunteer) => (
                <VolunteerRow
                  key={volunteer.volunteerId}
                  volunteer={volunteer}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          )}
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <div>
          {AR.volunteers.shownPrefix}{' '}
          <span className="font-bold text-slate-800">{formatNumber(volunteers.length)}</span>{' '}
          {AR.common.ofLabel}{' '}
          <span className="font-bold text-slate-800">{formatNumber(total)}</span>{' '}
          {AR.volunteers.totalSuffix}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
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
