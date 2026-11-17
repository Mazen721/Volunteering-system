import { useState } from 'react';
import type { FormEvent } from 'react';
import { XCircle } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { RegistrationQueueItem } from '../../types';
import { ModalFrame } from '../ModalFrame';

interface RejectRegistrationModalProps {
  target: RegistrationQueueItem | null;
  submitting: boolean;
  onConfirm: (userId: string, reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Modal collecting a mandatory Arabic rejection reason before rejecting a student registration.
 */
export function RejectRegistrationModal({
  target,
  submitting,
  onConfirm,
  onClose,
}: RejectRegistrationModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleClose() {
    setReason('');
    setError('');
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError(AR.approvals.rejectionReasonMin);
      return;
    }
    setError('');
    await onConfirm(target.id, trimmed);
    setReason('');
  }

  return (
    <ModalFrame
      isOpen={Boolean(target)}
      onClose={handleClose}
      title={AR.approvals.rejectModalTitle}
      subtitle={target ? `${target.fullName} (${target.registration.volunteerId})` : undefined}
      maxWidthClass="max-w-md"
      icon={
        <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <XCircle className="w-6 h-6" />
        </div>
      }
    >
      <p className="text-xs text-slate-600 leading-relaxed">{AR.approvals.rejectModalSubtitle}</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="rejection-reason" className="block text-xs font-bold text-slate-700">
            {AR.approvals.rejectionReasonLabel}
          </label>
          <textarea
            id="rejection-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={AR.approvals.rejectionReasonPlaceholder}
            aria-invalid={Boolean(error)}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          />
          {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            {AR.common.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold transition shadow-md cursor-pointer"
          >
            {submitting ? AR.approvals.rejecting : AR.approvals.confirmRejectButton}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
