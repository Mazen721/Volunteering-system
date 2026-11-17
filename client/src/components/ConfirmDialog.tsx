import { AlertTriangle } from 'lucide-react';
import { AR } from '../constants/ar';
import { ModalFrame } from './ModalFrame';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Arabic confirmation modal required before any delete operation executes.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidthClass="max-w-md"
      icon={
        <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
      }
    >
      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{message}</p>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
        >
          {AR.common.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold transition shadow-md cursor-pointer"
        >
          {loading ? AR.common.deleting : AR.common.delete}
        </button>
      </div>
    </ModalFrame>
  );
}
