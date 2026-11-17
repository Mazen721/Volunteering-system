import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Link2, UserPlus, XCircle } from 'lucide-react';
import { AR, INTEREST_LABELS } from '../../constants/ar';
import type { Faculty, UserRole } from '../../constants/enums';
import { FACULTIES } from '../../constants/enums';
import type { RegistrationQueueItem } from '../../types';
import { formatDateAr, formatNumber } from '../../utils/format';

interface RegistrationCardProps {
  registration: RegistrationQueueItem;
  reviewerRole: UserRole;
  approvingId: string | null;
  onApprove: (userId: string, facultyOverride?: Faculty) => Promise<void>;
  onOpenReject: (registration: RegistrationQueueItem) => void;
}

const STATUS_BADGE_CLASS: Record<RegistrationQueueItem['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  disabled: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * Card representing one student registration request with existing volunteer preview and mismatch guards.
 */
export function RegistrationCard({
  registration,
  reviewerRole,
  approvingId,
  onApprove,
  onOpenReject,
}: RegistrationCardProps) {
  const [facultyOverride, setFacultyOverride] = useState<Faculty | ''>('');
  const isPending = registration.status === 'pending';
  const isApproving = approvingId === registration.id;
  const deanBlockedByMismatch = reviewerRole === 'dean' && registration.facultyMismatch;

  return (
    <article className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-800">{registration.fullName}</h2>
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_BADGE_CLASS[registration.status]}`}
            >
              {AR.userStatuses[registration.status]}
            </span>
            {registration.facultyMismatch && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-extrabold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{AR.approvals.mismatchBadge}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 break-all">{registration.email}</p>
        </div>

        <span className="text-[11px] font-semibold text-slate-500">
          {AR.approvals.submittedAtLabel}: {formatDateAr(registration.createdAt)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/60 rounded-2xl p-3.5 border border-slate-200/70">
        <div>
          <span className="text-slate-500 font-semibold">{AR.approvals.volunteerIdLabel}: </span>
          <span className="font-extrabold text-slate-800">{registration.registration.volunteerId}</span>
        </div>
        <div>
          <span className="text-slate-500 font-semibold">{AR.approvals.categoryLabel}: </span>
          <span className="font-bold text-slate-800">
            {AR.categories[registration.registration.category]}
          </span>
        </div>
        <div>
          <span className="text-slate-500 font-semibold">{AR.approvals.facultyLabel}: </span>
          <span className="font-bold text-slate-800">{registration.registration.faculty}</span>
        </div>
      </div>

      {registration.interests.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 ml-1">
            {AR.approvals.interestsLabel}:
          </span>
          {registration.interests.map((key) => (
            <span
              key={key}
              className="px-2.5 py-1 rounded-full bg-mnu-500/10 text-mnu-600 text-[11px] font-bold"
            >
              {INTEREST_LABELS[key]}
            </span>
          ))}
        </div>
      )}

      {registration.existingVolunteer ? (
        <div
          className={`rounded-2xl p-4 border space-y-2 text-xs ${
            registration.facultyMismatch
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-sky-50/80 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2 font-extrabold">
            <Link2 className="w-4 h-4 shrink-0" />
            <span>{AR.approvals.existingRecordTitle}</span>
          </div>
          <p className="text-[11px] opacity-90">{AR.approvals.existingRecordSubtitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 font-semibold">
            <div>
              {AR.approvals.existingNameLabel}: {registration.existingVolunteer.fullName}
            </div>
            <div>
              {AR.approvals.existingFacultyLabel}: {registration.existingVolunteer.faculty}
            </div>
            <div>
              {AR.approvals.existingHoursLabel}:{' '}
              {formatNumber(registration.existingVolunteer.approvedHours)} {AR.common.hourUnit}
            </div>
            <div>
              {AR.approvals.existingActivitiesLabel}:{' '}
              {formatNumber(registration.existingVolunteer.approvedActivities)} {AR.common.activityPlural}
            </div>
          </div>

          {registration.facultyMismatch && (
            <p className="text-[11px] font-bold pt-1">
              {reviewerRole === 'dean'
                ? AR.approvals.mismatchDeanBlockedNote
                : AR.approvals.mismatchAdminWarning}
            </p>
          )}
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
          <UserPlus className="w-3.5 h-3.5 text-mnu-500" />
          <span>{AR.approvals.newRecordBadge}</span>
        </div>
      )}

      {registration.status === 'rejected' && registration.rejectionReason && (
        <div className="rounded-2xl p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <span className="font-extrabold">{AR.approvals.rejectionReasonDisplayLabel}: </span>
          <span className="font-semibold">{registration.rejectionReason}</span>
        </div>
      )}

      {registration.status === 'active' && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700 font-bold pt-1">
          {registration.approvedAt && (
            <span>
              {AR.approvals.approvedAtLabel}: {formatDateAr(registration.approvedAt)}
            </span>
          )}
          <Link
            to={`/volunteers/${registration.registration.volunteerId}`}
            className="text-mnu-500 hover:underline font-extrabold"
          >
            {AR.approvals.viewProfileLink}
          </Link>
        </div>
      )}

      {isPending && (
        <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-slate-200/70">
          {reviewerRole === 'admin' && registration.facultyMismatch ? (
            <div className="space-y-1 min-w-56 flex-1 sm:max-w-xs">
              <label
                htmlFor={`faculty-override-${registration.id}`}
                className="block text-[11px] font-bold text-slate-700"
              >
                {AR.approvals.facultyOverrideLabel}
              </label>
              <select
                id={`faculty-override-${registration.id}`}
                value={facultyOverride}
                onChange={(event) => setFacultyOverride(event.target.value as Faculty | '')}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              >
                <option value="">{AR.approvals.keepOfficialFacultyOption}</option>
                {FACULTIES.map((faculty) => (
                  <option key={faculty} value={faculty}>
                    {faculty}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenReject(registration)}
              disabled={isApproving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer disabled:opacity-60"
            >
              <XCircle className="w-4 h-4" />
              <span>{AR.approvals.rejectButton}</span>
            </button>

            <button
              type="button"
              onClick={() => onApprove(registration.id, facultyOverride || undefined)}
              disabled={isApproving || deanBlockedByMismatch}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isApproving ? AR.approvals.approving : AR.approvals.approveButton}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
