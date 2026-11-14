import { useState } from 'react';
import { AlertTriangle, ClipboardPlus, RefreshCw, UserPlus } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client.js';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Navbar } from '../components/Navbar.jsx';
import { ActivityModal } from '../components/modals/ActivityModal.jsx';
import { VolunteerModal } from '../components/modals/VolunteerModal.jsx';
import { VolunteersTable } from '../components/volunteers/VolunteersTable.jsx';
import { VolunteersToolbar } from '../components/volunteers/VolunteersToolbar.jsx';
import { AR } from '../constants/ar.js';
import { useToast } from '../context/toastContext.js';
import { useVolunteersList } from '../hooks/useVolunteersList.js';

/**
 * Volunteers management page with search, independent filters, CRUD modals, and activity registration.
 */
export function VolunteersPage() {
  const { showToast } = useToast();
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

  const [volunteerModalState, setVolunteerModalState] = useState({ open: false, volunteer: null });
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [volunteerToDelete, setVolunteerToDelete] = useState(null);
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
              <p className="text-xs sm:text-sm text-slate-500 mt-1">{AR.volunteers.pageSubtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setVolunteerModalState({ open: true, volunteer: null })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>{AR.volunteers.addVolunteerBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                <ClipboardPlus className="w-4 h-4" />
                <span>{AR.volunteers.addActivityBtn}</span>
              </button>
            </div>
          </div>

          <VolunteersToolbar
            filters={filters}
            hasActiveFilters={hasActiveFilters}
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

      <ActivityModal
        isOpen={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
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
    </div>
  );
}
