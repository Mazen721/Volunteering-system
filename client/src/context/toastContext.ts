import { createContext, useContext } from 'react';
import type { ToastContextValue } from '../types';

export const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Returns toast notification dispatchers (`showToast`).
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
