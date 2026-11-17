import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  ClipboardPlus,
  KeyRound,
  Lock,
  RefreshCw,
  Trophy,
  UserPen,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import { CategoryBadge, EligibilityBadge } from '../components/badges/StatusBadge';
import { ActivityModal } from '../components/modals/ActivityModal';
import type { ResetPasswordTarget } from '../components/modals/ResetPasswordModal';
import { ResetPasswordModal } from '../components/modals/ResetPasswordModal';
import { VolunteerModal } from '../components/modals/VolunteerModal';
import { ProfileActivitiesSection } from '../components/profile/ProfileActivitiesSection';
import { AR } from '../constants/ar';
import type { ActivityStatus } from '../constants/enums';
import { useToast } from '../context/toastContext';
import { useVolunteerProfile } from '../hooks/useVolunteerProfile';
import type { Activity } from '../types';
import { triggerCelebration } from '../utils/confetti';
import { formatNumber, formatPercent } from '../utils/format';

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-label={AR.common.loading}>
      <div className="h-56 rounded-3xl shimmer" />
      <div className="h-64 rounded-3xl shimmer" />
    </div>
  );
}

interface ActivityModalState {
  open: boolean;
  activity: Activity | null;
}

/**
 * Volunteer profile page displaying details, 30-hour progress bar, and activity management.
 */
export function VolunteerProfilePage() {
  const { volunteerId } = useParams<{ volunteerId: string }>();
  const { showToast } = useToast();
  const { profile, loading, error, reload: reloadProfile } = useVolunteerProfile(volunteerId);

  const [statusFilter, setStatusFilter] = useState<ActivityStatus | ''>('');
  const [updatingId, setUpdatingId] = useState('');

  const [editVolunteerOpen, setEditVolunteerOpen] = useState(false);
  const [activityModalState, setActivityModalState] = useState<ActivityModalState>({
    open: false,
    activity: null,
  });
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleStatusChange(activityId: string, nextStatus: ActivityStatus) {
    setUpdatingId(activityId);
    try {
      await apiClient.patch(`/activities/${activityId}/status`, { status: nextStatus });
      showToast({ type: 'success', message: AR.profile.statusChangeSuccess });
      if (nextStatus === 'approved') {
        triggerCelebration();
      }
      await reloadProfile();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
    } finally {
      setUpdatingId('');
    }
  }

  async function handleConfirmDeleteActivity() {
    if (!activityToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/activities/${activityToDelete._id}`);
      showToast({ type: 'success', message: AR.profile.deleteActivitySuccess });
      setActivityToDelete(null);
      await reloadProfile();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
      setActivityToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const volunteer = profile?.volunteer;
  const activities = profile?.activities || [];
  const certificateHours = profile?.certificateHours || 30;
  const progressPercent = volunteer
    ? Math.min(100, Math.round((volunteer.approvedHours / certificateHours) * 100))
    : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div>
          <Link
            to="/volunteers"
            className="inline-flex items-center gap-2 text-xs font-bold text-mnu-500 hover:text-mnu-700 transition"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{AR.profile.backToVolunteers}</span>
          </Link>
        </div>

        {loading && !profile ? (
          <ProfileSkeleton />
        ) : error && !profile ? (
          <section
            role="alert"
            className="glass-card rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4"
          >
            <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
            <h2 className="text-lg font-black text-slate-800">{AR.profile.notFoundTitle}</h2>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={reloadProfile}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-mnu-500 text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{AR.common.retry}</span>
            </button>
          </section>
        ) : volunteer ? (
          <>
            <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                      {volunteer.fullName}
                    </h2>
                    <CategoryBadge category={volunteer.category} label={volunteer.categoryLabel} />
                    <EligibilityBadge
                      eligible={volunteer.eligible}
                      remainingHours={volunteer.remainingHours}
                    />
                  </div>
                  <p className="text-xs text-slate-500 font-semibold">
                    {AR.profile.idPrefix}{' '}
                    <span className="font-bold text-slate-700">{volunteer.volunteerId}</span> |{' '}
                    {AR.profile.facultyPrefix}{' '}
                    <span className="font-bold text-mnu-500">{volunteer.faculty}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditVolunteerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                  >
                    <UserPen className="w-4 h-4" />
                    <span>{AR.profile.editPersonalInfo}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivityModalState({ open: true, activity: null })}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    <ClipboardPlus className="w-4 h-4" />
                    <span>{AR.profile.addActivityForVolunteer}</span>
                  </button>

                  {volunteer.linkedUserId && (
                    <button
                      type="button"
                      onClick={() =>
                        setResetTarget({
                          userId: volunteer.linkedUserId!,
                          fullName: volunteer.fullName,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold transition cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{AR.volunteers.resetPassword}</span>
                    </button>
                  )}

                  {volunteer.eligible ? (
                    <Link
                      to={`/certificate/${encodeURIComponent(volunteer.volunteerId)}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md"
                    >
                      <Award className="w-4 h-4" />
                      <span>{AR.volunteers.issueCertificate}</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed"
                    >
                      <Lock className="w-4 h-4" />
                      <span>{AR.volunteers.certificateLocked}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block font-bold">
                    {AR.profile.approvedHoursLabel}
                  </span>
                  <span className="text-2xl font-black text-mnu-500">
                    {formatNumber(volunteer.approvedHours)}
                  </span>{' '}
                  <span className="text-xs text-slate-500">
                    / {formatNumber(certificateHours)} {AR.common.hourUnit}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block font-bold">
                    {AR.profile.activitiesCountLabel}
                  </span>
                  <span className="text-2xl font-black text-amber-600">
                    {formatNumber(volunteer.approvedActivities)}
                  </span>{' '}
                  <span className="text-xs text-slate-500">
                    / {formatNumber(volunteer.totalActivities)} {AR.common.activityPlural}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block font-bold">
                    {AR.profile.remainingHoursLabel}
                  </span>
                  <span className="text-2xl font-black text-purple-600">
                    {formatNumber(volunteer.remainingHours)}
                  </span>{' '}
                  <span className="text-xs text-slate-500">{AR.common.hourUnit}</span>
                </div>
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span>
                      {AR.profile.progressTitle} ({formatNumber(certificateHours)}{' '}
                      {AR.common.hourUnit})
                    </span>
                  </span>
                  <span className="text-mnu-500 font-black">{formatPercent(progressPercent)}</span>
                </div>
                <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                  <div
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="bg-gradient-to-r from-amber-500 via-emerald-500 to-mnu-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </section>

            <ProfileActivitiesSection
              activities={activities}
              statusFilter={statusFilter}
              updatingId={updatingId}
              onFilterChange={setStatusFilter}
              onStatusChange={handleStatusChange}
              onEdit={(activity) => setActivityModalState({ open: true, activity })}
              onDelete={(activity) => setActivityToDelete(activity)}
            />
          </>
        ) : null}
      </main>

      <VolunteerModal
        isOpen={editVolunteerOpen}
        volunteer={volunteer}
        onClose={() => setEditVolunteerOpen(false)}
        onSaved={reloadProfile}
      />

      <ActivityModal
        isOpen={activityModalState.open}
        activity={activityModalState.activity}
        presetVolunteer={volunteer}
        onClose={() => setActivityModalState({ open: false, activity: null })}
        onSaved={reloadProfile}
      />

      <ConfirmDialog
        isOpen={Boolean(activityToDelete)}
        title={AR.profile.deleteActivityTitle}
        message={
          activityToDelete ? `${AR.profile.deleteActivityMessage} (${activityToDelete.title})؟` : ''
        }
        loading={deleting}
        onConfirm={handleConfirmDeleteActivity}
        onCancel={() => setActivityToDelete(null)}
      />

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
