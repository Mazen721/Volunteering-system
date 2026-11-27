import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import type { WarnAbsentResponse } from '../../types';
import { formatNumber } from '../../utils/format';

type WarnStage = 'idle' | 'confirm' | 'sending' | 'sent';

/**
 * The warn-the-absent state machine (idle → confirm → sending → sent),
 * extracted from the completion dialog. Failures return to idle and are
 * reported through notifyError; the sent count comes from the server.
 */
function useWarnAbsent(opportunityId: string, notifyError: (message: string) => void) {
  const [stage, setStage] = useState<WarnStage>('idle');
  const [sentCount, setSentCount] = useState(0);

  async function sendWarnings() {
    setStage('sending');
    try {
      const response = await apiClient.post<WarnAbsentResponse>(
        `/opportunities/${encodeURIComponent(opportunityId)}/warn-absent`
      );
      setSentCount(response.data.sent);
      setStage('sent');
    } catch (requestError) {
      notifyError(extractApiErrorMessage(requestError));
      setStage('idle');
    }
  }

  return {
    stage,
    sentCount,
    askConfirm: () => setStage('confirm'),
    cancelConfirm: () => setStage('idle'),
    sendWarnings,
  };
}

interface WarnAbsentControlProps {
  opportunityId: string;
  absentCount: number;
  notifyError: (message: string) => void;
}

/**
 * The «إرسال إنذار للغائبين» control with its inline confirmation. Rendered
 * with a per-opportunity key by the dialog so its state resets per event.
 */
export function WarnAbsentControl({
  opportunityId,
  absentCount,
  notifyError,
}: WarnAbsentControlProps) {
  const warn = useWarnAbsent(opportunityId, notifyError);

  if (warn.stage === 'sent') {
    return (
      <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
        {AR.opportunities.warnAbsentSuccess.replace('{count}', formatNumber(warn.sentCount))}
      </p>
    );
  }

  if (warn.stage === 'confirm' || warn.stage === 'sending') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[11px] font-bold text-amber-800">
          {AR.opportunities.warnAbsentConfirmMessage.replace(
            '{count}',
            formatNumber(absentCount)
          )}
        </p>
        <span className="flex items-center gap-2 ms-auto">
          <button
            type="button"
            onClick={() => void warn.sendWarnings()}
            disabled={warn.stage === 'sending'}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[11px] font-black transition cursor-pointer"
          >
            {warn.stage === 'sending'
              ? AR.opportunities.warnAbsentSending
              : AR.opportunities.warnAbsentConfirmButton}
          </button>
          <button
            type="button"
            onClick={warn.cancelConfirm}
            disabled={warn.stage === 'sending'}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold transition cursor-pointer"
          >
            {AR.common.cancel}
          </button>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={warn.askConfirm}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-amber-300 text-amber-700 text-[11px] font-black hover:bg-amber-50 transition cursor-pointer"
    >
      <BellRing className="w-3.5 h-3.5" />
      <span>{AR.opportunities.warnAbsentButton}</span>
    </button>
  );
}
