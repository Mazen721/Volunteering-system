import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { AR } from '../constants/ar.js';
import { ToastContext } from './toastContext.js';

const TOAST_STYLES = {
  success: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    Icon: AlertTriangle,
    role: 'status',
  },
  error: {
    container: 'bg-rose-50 border-rose-200 text-rose-800',
    Icon: AlertCircle,
    role: 'alert',
  },
};

/**
 * Provides global Arabic toast notifications across the application.
 * @param {{ children: import('react').ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = 'success', message }) => {
      const id = ++nextIdRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => dismissToast(id), 4500);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type] || TOAST_STYLES.success;
          const IconComponent = style.Icon;
          return (
            <div
              key={toast.id}
              role={style.role}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-2xl border shadow-lg text-xs font-bold ${style.container}`}
            >
              <div className="flex items-start gap-2.5">
                <IconComponent className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                aria-label={AR.common.close}
                onClick={() => dismissToast(toast.id)}
                className="opacity-70 hover:opacity-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
