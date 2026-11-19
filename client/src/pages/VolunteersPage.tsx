import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import type { ResetPasswordTarget } from '../components/modals/ResetPasswordModal';
import { ResetPasswordModal } from '../components/modals/ResetPasswordModal';
import { VolunteerModal } from '../components/modals/VolunteerModal';
import { VolunteersTable } from '../components/volunteers/VolunteersTable';
import { VolunteersToolbar } from '../components/volunteers/VolunteersToolbar';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import { useVolunteersList } from '../hooks/useVolunteersList';
import type { Volunteer } from '../types';

interface VolunteerModalState {
  open: boolean;
  volunteer: Volunteer | null;
}

/**
 * Volunteers management page with search, independent filters, CRUD modals, and activity registration.
 */
export function VolunteersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isDean = user?.role === 'dean';
  const {
    filters,
    page,
    setPage,
    volunteers,
    total,
    pages,
    loading,
    error,
    hasActiveFilters,
    updateFilter,
    resetFilters,
    reload,
  } = useVolunteersList();

  const [volunteerModalState, setVolunteerModalState] = useState<VolunteerModalState>({
    open: false,
    volunteer: null,
  });
  const [volunteerToDelete, setVolunteerToDelete] = useState<Volunteer | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!volunteerToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/volunteers/${encodeURIComponent(volunteerToDelete.volunteerId)}`);
      showToast({ type: 'success', message: AR.volunteers.deleteSuccess });
      setVolunteerToDelete(null);
      reload();
    } catch (err) {
      showToast({ type: 'error', message: extractApiErrorMessage(err) });
      setVolunteerToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                {AR.volunteers.pageTitle}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {isDean && user?.faculty
                  ? `${AR.volunteers.facultyScopedSubtitle} (${user.faculty})`
                  : AR.volunteers.pageSubtitle}
              </p>
            </div>

          </div>

          <VolunteersToolbar
            filters={filters}
            hasActiveFilters={hasActiveFilters}
            hideFacultyFilter={isDean}
            onFilterChange={updateFilter}
            onReset={resetFilters}
          />

          {error ? (
            <div
              role="alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
            >
              <AlertTriangle className="w-7 h-7 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-800">{AR.volunteers.errorTitle}</p>
              <p className="text-xs text-rose-700">{error}</p>
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{AR.common.retry}</span>
              </button>
            </div>
          ) : (
            <VolunteersTable
              volunteers={volunteers}
              loading={loading}
              total={total}
              page={page}
              pages={pages}
              onPageChange={setPage}
              onEdit={(volunteer) => setVolunteerModalState({ open: true, volunteer })}
              onDelete={(volunteer) => setVolunteerToDelete(volunteer)}
              onResetPassword={(volunteer) => {
                if (volunteer.linkedUserId) {
                  setResetTarget({
                    userId: volunteer.linkedUserId,
                    fullName: volunteer.fullName,
                  });
                }
              }}
            />
          )}
        </section>
      </main>

      <VolunteerModal
        isOpen={volunteerModalState.open}
        volunteer={volunteerModalState.volunteer}
        onClose={() => setVolunteerModalState({ open: false, volunteer: null })}
        onSaved={reload}
      />

      <ConfirmDialog
        isOpen={Boolean(volunteerToDelete)}
        title={AR.volunteers.deleteConfirmTitle}
        message={
          volunteerToDelete
            ? `${AR.volunteers.deleteConfirmMessage} (${volunteerToDelete.fullName})؟`
            : ''
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setVolunteerToDelete(null)}
      />

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
