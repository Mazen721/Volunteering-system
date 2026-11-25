import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import { useToast } from '../../context/toastContext';
import type {
  CompleteOpportunityResponse,
  LiveCounters,
  LiveOpportunityResponse,
  Opportunity,
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
  const [countersState, setCountersState] = useState<{
    opportunityId: string;
    counters: LiveCounters;
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
          setCountersState({ opportunityId, counters: response.data.counters });
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

  const counters =
    countersState && opportunity && countersState.opportunityId === opportunity._id
      ? countersState.counters
      : null;
  const loadingDetails = opportunity !== null && counters === null;

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
