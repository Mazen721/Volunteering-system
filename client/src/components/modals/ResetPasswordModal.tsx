import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import { useToast } from '../../context/toastContext';
import { ModalFrame } from '../ModalFrame';

export interface ResetPasswordTarget {
  userId: string;
  fullName: string;
}

interface ResetPasswordContentProps {
  target: ResetPasswordTarget;
  onClose: () => void;
  onSaved?: () => void;
}

function ResetPasswordContent({ target, onClose, onSaved }: ResetPasswordContentProps) {
  const { showToast } = useToast();
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    if (temporaryPassword.length < 8) {
      setFieldError(AR.resetPasswordModal.passwordMin);
      return;
    }
    setFieldError('');

    setSubmitting(true);
    try {
      await apiClient.patch(`/users/${encodeURIComponent(target.userId)}`, {
        temporaryPassword,
      });
      showToast({ type: 'success', message: AR.resetPasswordModal.success });
      onSaved?.();
      onClose();
    } catch (err) {
      setSubmitError(extractApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {submitError && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
        <div>
          <label htmlFor="temp-password-input" className="block font-bold text-slate-700 mb-1">
            {AR.resetPasswordModal.passwordLabel}
          </label>
          <input
            id="temp-password-input"
            type="password"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            placeholder={AR.resetPasswordModal.passwordPlaceholder}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
          />
          {fieldError && <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldError}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
          >
            {AR.common.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white font-bold transition shadow-md cursor-pointer"
          >
            {submitting ? AR.resetPasswordModal.submitting : AR.resetPasswordModal.submitButton}
          </button>
        </div>
      </form>
    </>
  );
}

interface ResetPasswordModalProps {
  target: ResetPasswordTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Shared modal for setting a temporary password on a dean or student user account.
 */
export function ResetPasswordModal({ target, onClose, onSaved }: ResetPasswordModalProps) {
  return (
    <ModalFrame
      isOpen={Boolean(target)}
      onClose={onClose}
      title={AR.resetPasswordModal.title}
      subtitle={
        target ? `${AR.resetPasswordModal.subtitlePrefix} ${target.fullName}` : undefined
      }
      icon={
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
          <KeyRound className="w-6 h-6" />
        </div>
      }
    >
      {target && (
        <ResetPasswordContent
          key={target.userId}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </ModalFrame>
  );
}
