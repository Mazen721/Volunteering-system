import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/**
 * Returns toast notification dispatchers (`showToast`).
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
