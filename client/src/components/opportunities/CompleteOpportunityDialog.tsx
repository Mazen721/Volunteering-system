import { useEffect, useState } from 'react';
import { BadgeCheck, BellRing } from 'lucide-react';
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
  WarnAbsentResponse,
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

/** Worst repeat offenders first: absence total descending, then name. */
function byAbsenceCountThenName(first: Application, second: Application): number {
  const byCount = (second.absenceCount ?? 0) - (first.absenceCount ?? 0);
  if (byCount !== 0) {
    return byCount;
  }
  const firstName = getVolunteerInfo(first)?.fullName ?? '';
  const secondName = getVolunteerInfo(second)?.fullName ?? '';
  return firstName.localeCompare(secondName, 'ar');
}

/**
 * Total-absence badge next to an absent volunteer's name. Neutral for a
 * first absence, amber for 2–3, and a red alert from 4 upwards — the
 * threshold the programme treats as a problem case.
 */
function AbsenceBadge({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }
  const label =
    count === 1
      ? AR.opportunities.absenceOnce
      : count === 2
        ? AR.opportunities.absenceTwice
        : AR.opportunities.absenceMany.replace('{count}', formatNumber(count));
  const classes =
    count >= 4
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : count >= 2
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span
      data-testid="absence-badge"
      data-count={count}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black shrink-0 ${classes}`}
    >
      {label}
    </span>
  );
}

/** Name lists in this dialog stay compact: the first few rows, then a toggle. */
const COMPACT_LIST_LIMIT = 4;

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
  const [attendeesExpanded, setAttendeesExpanded] = useState(false);
  const [absentExpanded, setAbsentExpanded] = useState(false);
  const [warnStage, setWarnStage] = useState<'idle' | 'confirm' | 'sending' | 'sent'>('idle');
  const [warnSentCount, setWarnSentCount] = useState(0);

  const opportunityId = opportunity?._id ?? null;

  // A different opportunity starts with compact lists and no warning sent.
  const [lastOpportunityId, setLastOpportunityId] = useState(opportunityId);
  if (opportunityId !== lastOpportunityId) {
    setLastOpportunityId(opportunityId);
    setAttendeesExpanded(false);
    setAbsentExpanded(false);
    setWarnStage('idle');
    setWarnSentCount(0);
  }

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
  const absentList = live
    ? live.attendees.filter((application) => !application.attended).sort(byAbsenceCountThenName)
    : [];
  const visibleAttendees = attendeesExpanded
    ? attendedList
    : attendedList.slice(0, COMPACT_LIST_LIMIT);
  const visibleAbsent = absentExpanded ? absentList : absentList.slice(0, COMPACT_LIST_LIMIT);

  async function handleWarnAbsent() {
    if (!opportunityId) return;
    setWarnStage('sending');
    try {
      const response = await apiClient.post<WarnAbsentResponse>(
        `/opportunities/${encodeURIComponent(opportunityId)}/warn-absent`
      );
      setWarnSentCount(response.data.sent);
      setWarnStage('sent');
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
      setWarnStage('idle');
    }
  }

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
                  <>
                    <ul
                      data-testid="complete-attendees-list"
                      className="max-h-56 overflow-y-auto rounded-2xl border border-slate-100 bg-white/70 divide-y divide-slate-100"
                    >
                      {visibleAttendees.map((application) => {
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
                    {attendedList.length > COMPACT_LIST_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setAttendeesExpanded((value) => !value)}
                        className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
                      >
                        {attendeesExpanded ? AR.opportunities.showLess : AR.opportunities.showMore}
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800">
                  {AR.opportunities.completeAbsentLabel} ({formatNumber(absentList.length)})
                </h4>
                {absentList.length > 0 && (
                  <>
                    <ul
                      data-testid="complete-absent-list"
                      className="max-h-56 overflow-y-auto rounded-2xl border border-amber-100 bg-amber-50/50 divide-y divide-amber-100"
                    >
                      {visibleAbsent.map((application) => {
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
                            <AbsenceBadge count={application.absenceCount ?? 0} />
                          </li>
                        );
                      })}
                    </ul>
                    {absentList.length > COMPACT_LIST_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setAbsentExpanded((value) => !value)}
                        className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
                      >
                        {absentExpanded ? AR.opportunities.showLess : AR.opportunities.showMore}
                      </button>
                    )}

                    {warnStage === 'sent' ? (
                      <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        {AR.opportunities.warnAbsentSuccess.replace(
                          '{count}',
                          formatNumber(warnSentCount)
                        )}
                      </p>
                    ) : warnStage === 'confirm' || warnStage === 'sending' ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-[11px] font-bold text-amber-800">
                          {AR.opportunities.warnAbsentConfirmMessage.replace(
                            '{count}',
                            formatNumber(absentList.length)
                          )}
                        </p>
                        <span className="flex items-center gap-2 ms-auto">
                          <button
                            type="button"
                            onClick={() => void handleWarnAbsent()}
                            disabled={warnStage === 'sending'}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[11px] font-black transition cursor-pointer"
                          >
                            {warnStage === 'sending'
                              ? AR.opportunities.warnAbsentSending
                              : AR.opportunities.warnAbsentConfirmButton}
                          </button>
                          <button
                            type="button"
                            onClick={() => setWarnStage('idle')}
                            disabled={warnStage === 'sending'}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold transition cursor-pointer"
                          >
                            {AR.common.cancel}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWarnStage('confirm')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-amber-300 text-amber-700 text-[11px] font-black hover:bg-amber-50 transition cursor-pointer"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>{AR.opportunities.warnAbsentButton}</span>
                      </button>
                    )}
                  </>
                )}
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
