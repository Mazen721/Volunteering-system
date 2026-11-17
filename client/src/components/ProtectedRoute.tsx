import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, Ban, RefreshCw, ShieldAlert } from 'lucide-react';
import { AR } from '../constants/ar';
import type { UserRole } from '../constants/enums';
import { getHomePathForUser, useAuth } from '../context/authContext';

export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

interface StatusNoticeCardProps {
  icon: ReactNode;
  iconBgClass: string;
  title: string;
  description?: string;
  actions: ReactNode;
}

function StatusNoticeCard({
  icon,
  iconBgClass,
  title,
  description,
  actions,
}: StatusNoticeCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card rounded-3xl p-8 max-w-md w-full text-center space-y-4">
        <div
          className={`w-12 h-12 rounded-2xl ${iconBgClass} flex items-center justify-center mx-auto`}
        >
          {icon}
        </div>
        <h2 className="text-lg font-black text-slate-800">{title}</h2>
        {description && <p className="text-xs text-slate-600 leading-relaxed">{description}</p>}
        <div className="flex items-center justify-center gap-3 pt-2">{actions}</div>
      </div>
    </div>
  );
}

/**
 * Guards private routes by restoring the session, enforcing account status, and checking roles.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, status, sessionError, retrySession, logout } = useAuth();
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
      <StatusNoticeCard
        icon={<AlertTriangle className="w-6 h-6" />}
        iconBgClass="bg-rose-50 text-rose-600"
        title={AR.auth.sessionCheckFailedTitle}
        description={sessionError}
        actions={
          <>
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
          </>
        }
      />
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.status === 'disabled') {
    return (
      <StatusNoticeCard
        icon={<Ban className="w-6 h-6" />}
        iconBgClass="bg-rose-50 text-rose-600"
        title={AR.auth.disabledAccount}
        description={AR.auth.disabledAccountSubtitle}
        actions={
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            {AR.nav.logout}
          </button>
        }
      />
    );
  }

  if (user.status === 'pending' || user.status === 'rejected') {
    return location.pathname === '/pending' ? <Outlet /> : <Navigate to="/pending" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const homePath = getHomePathForUser(user);
    if (location.pathname !== homePath) {
      return <Navigate to={homePath} replace />;
    }
    return (
      <StatusNoticeCard
        icon={<ShieldAlert className="w-6 h-6" />}
        iconBgClass="bg-amber-50 text-amber-600"
        title={AR.auth.unauthorizedRole}
        actions={
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            {AR.nav.logout}
          </button>
        }
      />
    );
  }

  return <Outlet />;
}
