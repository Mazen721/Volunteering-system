import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { AR } from '../constants/ar';

interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  maxWidthClass?: string;
  children: ReactNode;
}

/**
 * Shared accessible modal wrapper with glassmorphism card styling and Escape dismissal.
 */
export function ModalFrame({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-lg',
  children,
}: ModalFrameProps) {
  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        className={`glass-card w-full ${maxWidthClass} rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl relative my-auto`}
      >
        <button
          type="button"
          aria-label={AR.common.close}
          onClick={onClose}
          className="absolute left-5 top-5 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pl-8">
          {icon}
          <div>
            <h3 id="modal-heading" className="text-base sm:text-lg font-extrabold text-slate-800">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
