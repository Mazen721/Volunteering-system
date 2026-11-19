import { useState } from 'react';
import { RefreshCw, UserCheck } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import { useToast } from '../../context/toastContext';
import type { Application, Opportunity, OpportunityResponse, VolunteerBase } from '../../types';

interface AttendanceDeputyCardProps {
  opportunity: Opportunity;
  attendees: Application[];
  onUpdated: (opportunity: Opportunity) => void;
}

function getVolunteerInfo(application: Application): VolunteerBase | null {
  return application.volunteer && typeof application.volunteer !== 'string'
    ? application.volunteer
    : null;
}

/**
 * Staff-only card on the live page: appoints one accepted student as attendance deputy
 * («مسؤول الحضور») who can open this live screen, show the rotating QR and toggle manual
 * attendance in the organizer's place. Completing the event stays staff-only.
 */
export function AttendanceDeputyCard({
  opportunity,
  attendees,
  onUpdated,
}: AttendanceDeputyCardProps) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<string>(opportunity.attendanceDeputy ?? '');
  const [saving, setSaving] = useState(false);

  const currentDeputy = attendees.find(
    (application) => application.user === opportunity.attendanceDeputy
  );
  const currentName = currentDeputy
    ? (getVolunteerInfo(currentDeputy)?.fullName ?? AR.opportunities.live.unknownVolunteer)
    : null;

  async function handleSave() {
    setSaving(true);
    try {
      const response = await apiClient.put<OpportunityResponse>(
        `/opportunities/${encodeURIComponent(opportunity._id)}/deputy`,
        { deputyUserId: selected || null }
      );
      onUpdated(response.data.opportunity);
      showToast({ type: 'success', message: AR.opportunities.live.deputy.saved });
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="attendance-deputy-card"
      className="glass-card rounded-3xl p-6 space-y-4"
    >
      <div>
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-mnu-500" />
          <span>{AR.opportunities.live.deputy.title}</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">{AR.opportunities.live.deputy.subtitle}</p>
      </div>

      <p className="text-xs font-bold text-slate-700">
        {AR.opportunities.live.deputy.currentLabel}:{' '}
        <span className="text-mnu-600">
          {currentName ?? AR.opportunities.live.deputy.notAssigned}
        </span>
      </p>

      {attendees.length === 0 ? (
        <p className="text-xs text-slate-400">{AR.opportunities.live.deputy.emptyCandidates}</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <select
            aria-label={AR.opportunities.live.deputy.selectLabel}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-mnu-500/30"
          >
            <option value="">{AR.opportunities.live.deputy.noneOption}</option>
            {attendees.map((application) => {
              const volunteer = getVolunteerInfo(application);
              return (
                <option key={application._id} value={application.user}>
                  {volunteer?.fullName ?? AR.opportunities.live.unknownVolunteer}
                  {volunteer ? ` — ${volunteer.volunteerId}` : ''}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
          >
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>
              {saving ? AR.opportunities.live.deputy.saving : AR.opportunities.live.deputy.saveBtn}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
