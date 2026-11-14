import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AR } from '../constants/ar.js';
import { useAuth } from '../context/authContext.js';

/**
 * Guards private routes by restoring or checking the admin session before rendering children.
 */
export function ProtectedRoute() {
  const { status, sessionError, retrySession, logout } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-3xl px-8 py-6 flex items-center gap-3 text-mnu-500 font-bold text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>{AR.auth.checkingSession}</span>
        </div>
      </div>
    );
  }

  if (status === 'network_error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-800">{AR.auth.sessionCheckFailedTitle}</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{sessionError}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={retrySession}
              className="px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition"
            >
              {AR.auth.retrySessionCheck}
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              {AR.nav.logout}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
