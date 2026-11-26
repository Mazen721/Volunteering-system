import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import { useToast } from '../../context/toastContext';
import type {
  Application,
  CompleteOpportunityResponse,
  LiveCounters,
  LiveOpportunityResponse,
  Opportunity,
  VolunteerBase,
} from '../../types';
import { formatDateTimeAr, formatNumber } from '../../utils/format';
import { ModalFrame } from '../ModalFrame';

interface CompleteOpportunityDialogProps {
  opportunity: Opportunity | null;
  onClose: () => void;
  onCompleted: (opportunity: Opportunity) => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <dt className="text-[11px] font-bold text-slate-500 shrink-0">{label}</dt>
      <dd className="text-xs font-black text-slate-800 text-left">{value}</dd>
    </div>
  );
}

function getVolunteerInfo(application: Application): VolunteerBase | null {
  return application.volunteer && typeof application.volunteer !== 'string'
    ? application.volunteer
    : null;
}

function byCheckInTime(first: Application, second: Application): number {
  const firstTime = first.checkedInAt ? new Date(first.checkedInAt).getTime() : Number.MAX_VALUE;
  const secondTime = second.checkedInAt ? new Date(second.checkedInAt).getTime() : Number.MAX_VALUE;
  return firstTime - secondTime;
}

/**
 * Confirmation dialog for completing an ended opportunity directly from the
 * management table. Shows the attendance details and the exact hours that the
 * existing completion endpoint will credit before the manager confirms.
 */
export function CompleteOpportunityDialog({
  opportunity,
  onClose,
  onCompleted,
}: CompleteOpportunityDialogProps) {
  const { showToast } = useToast();
  const [liveState, setLiveState] = useState<{
    opportunityId: string;
    counters: LiveCounters;
    attendees: Application[];
  } | null>(null);
  const [completing, setCompleting] = useState(false);

  const opportunityId = opportunity?._id ?? null;

  useEffect(() => {
    if (!opportunityId) {
      return undefined;
    }
    let cancelled = false;
    apiClient
      .get<LiveOpportunityResponse>(`/opportunities/${encodeURIComponent(opportunityId)}/live`)
      .then((response) => {
        if (!cancelled) {
          setLiveState({
            opportunityId,
            counters: response.data.counters,
            attendees: response.data.attendees,
          });
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
          onClose();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opportunityId, onClose, showToast]);

  const live =
    liveState && opportunity && liveState.opportunityId === opportunity._id ? liveState : null;
  const counters = live ? live.counters : null;
  const loadingDetails = opportunity !== null && counters === null;
  // The live endpoint builds its counters from this same attendees array, so
  // the attended list below always matches the «الحاضرون» counter exactly.
  const attendedList = live
    ? live.attendees.filter((application) => application.attended).sort(byCheckInTime)
    : [];
  const absentCount = counters ? counters.notArrived : 0;

  async function handleConfirm() {
    if (!opportunityId) return;
    setCompleting(true);
    try {
      const response = await apiClient.post<CompleteOpportunityResponse>(
        `/opportunities/${encodeURIComponent(opportunityId)}/complete`
      );
      onCompleted(response.data.opportunity);
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setCompleting(false);
    }
  }

  const creditedHours = counters && opportunity ? counters.checkedIn * opportunity.hours : null;

  return (
    <ModalFrame
      isOpen={opportunity !== null}
      onClose={onClose}
      title={AR.opportunities.completeConfirmTitle}
      maxWidthClass="max-w-lg"
      icon={
        <div className="w-11 h-11 rounded-2xl bg-[#c9a227]/15 text-[#b28e1f] flex items-center justify-center shrink-0">
          <BadgeCheck className="w-6 h-6" />
        </div>
      }
    >
      {opportunity && (
        <>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {AR.opportunities.completeConfirmMessage}
          </p>

          <p className="text-sm font-black text-slate-800">{opportunity.title}</p>

          {loadingDetails || !counters ? (
            <p className="text-xs font-bold text-mnu-500 py-4 text-center">
              {AR.opportunities.completeLoadingDetails}
            </p>
          ) : (
            <>
              <dl className="rounded-2xl bg-slate-50/80 border border-slate-100 px-4 py-2">
                <DetailRow
                  label={AR.opportunities.columns.faculty}
                  value={opportunity.faculty ?? AR.opportunities.allFaculties}
                />
                <DetailRow
                  label={AR.opportunities.columns.schedule}
                  value={`${formatDateTimeAr(opportunity.startAt)} ← ${formatDateTimeAr(opportunity.endAt)}`}
                />
                <DetailRow
                  label={AR.opportunities.completePlaceLabel}
                  value={opportunity.location.name}
                />
                <DetailRow
                  label={AR.opportunities.completeAcceptedLabel}
                  value={formatNumber(counters.accepted)}
                />
                <DetailRow
                  label={AR.opportunities.completeAttendedLabel}
                  value={formatNumber(counters.checkedIn)}
                />
                <DetailRow
                  label={AR.opportunities.completeHoursLabel}
                  value={`${formatNumber(opportunity.hours)} ${AR.common.hourUnit}`}
                />
                <DetailRow
                  label={AR.opportunities.completeCreditLabel}
                  value={`${formatNumber(creditedHours ?? 0)} ${AR.common.hourUnit}`}
                />
              </dl>

              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800">
                  {AR.opportunities.completeAttendeesTitle} ({formatNumber(attendedList.length)})
                </h4>
                {attendedList.length === 0 ? (
                  <p className="text-[11px] font-bold text-slate-500 rounded-2xl bg-slate-50/80 border border-slate-100 px-4 py-3 text-center">
                    {AR.opportunities.completeAttendeesEmpty}
                  </p>
                ) : (
                  <ul
                    data-testid="complete-attendees-list"
                    className="max-h-56 overflow-y-auto rounded-2xl border border-slate-100 bg-white/70 divide-y divide-slate-100"
                  >
                    {attendedList.map((application) => {
                      const volunteer = getVolunteerInfo(application);
                      return (
                        <li
                          key={application._id}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800">
                              {volunteer?.fullName ?? AR.opportunities.live.unknownVolunteer}
                            </p>
                            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                              {AR.categories[application.category]}
                            </p>
                          </div>
                          <p className="text-[11px] font-bold text-slate-600 shrink-0">
                            {AR.opportunities.completeCheckedInAtLabel}:{' '}
                            {application.checkedInAt
                              ? formatDateTimeAr(application.checkedInAt)
                              : '—'}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {AR.opportunities.completeAbsentLabel}: {formatNumber(absentCount)}
                </p>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={completing}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              {AR.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={completing || loadingDetails || !counters}
              className="px-5 py-2.5 rounded-xl bg-[#c9a227] hover:bg-[#b28e1f] disabled:opacity-60 text-[#122f4a] text-xs font-black transition shadow-md shadow-[#c9a227]/25 cursor-pointer"
            >
              {completing ? AR.opportunities.completing : AR.opportunities.confirmCompleteBtn}
            </button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
