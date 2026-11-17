import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AR } from '../../constants/ar';

interface DashboardErrorStateProps {
  message: string;
  onRetry: () => void;
}

/**
 * Full-card Arabic error state displayed when initial dashboard loading fails.
 */
export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <section
      role="alert"
      className="glass-card rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12"
    >
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <h2 className="text-lg font-black text-slate-800">{AR.dashboard.errorTitle}</h2>
      <p className="text-xs text-slate-600 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition shadow-md cursor-pointer"
      >
        <RefreshCw className="w-4 h-4" />
        <span>{AR.dashboard.retryButton}</span>
      </button>
    </section>
  );
}
