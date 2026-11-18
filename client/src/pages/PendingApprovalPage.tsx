import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Clock, LogOut, RefreshCw, XCircle } from 'lucide-react';
import { UniversityLogo } from '../components/UniversityLogo';
import { AR, INTEREST_LABELS } from '../constants/ar';
import { getHomePathForUser, useAuth } from '../context/authContext';

/**
 * Dedicated screen shown to rejected self-registered accounts; pending and active
 * users are redirected to their home because pending accounts may browse the portal.
 */
export function PendingApprovalPage() {
  const { user, logout, retrySession } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.status === 'active' || user.status === 'pending') {
    return <Navigate to={getHomePathForUser(user)} replace />;
  }

  const isRejected = user.status === 'rejected';

  async function handleRefreshStatus() {
    setRefreshing(true);
    try {
      await retrySession();
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg rounded-3xl p-6 sm:p-8 space-y-6 text-center">
        <UniversityLogo className="w-16 h-16 mx-auto bg-white shadow-md ring-2 ring-mnu-500/15" />

        <div
          className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
            isRejected ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          {isRejected ? <XCircle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-lg sm:text-xl font-black text-slate-800">
            {isRejected ? AR.pending.rejectedTitle : AR.pending.waitingTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {isRejected ? AR.pending.rejectedSubtitle : AR.pending.waitingSubtitle}
          </p>
        </div>

        {isRejected && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-right space-y-1"
          >
            <p className="text-xs font-extrabold">{AR.pending.rejectionReasonLabel}</p>
            <p className="text-xs font-semibold leading-relaxed">
              {user.rejectionReason || AR.pending.noRejectionReason}
            </p>
          </div>
        )}

        {user.registration && (
          <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/80 text-right space-y-2.5 text-xs">
            <p className="font-extrabold text-slate-800">{AR.pending.submittedDetailsTitle}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
              <div>
                <span className="font-bold text-slate-700">{AR.pending.volunteerIdLabel}: </span>
                <span>{user.registration.volunteerId}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{AR.pending.categoryLabel}: </span>
                <span>{AR.categories[user.registration.category]}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="font-bold text-slate-700">{AR.pending.facultyLabel}: </span>
                <span>{user.registration.faculty}</span>
              </div>
            </div>
            {user.interests.length > 0 && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {user.interests.map((interest) => (
                  <span
                    key={interest}
                    className="px-2.5 py-1 rounded-full bg-mnu-500/10 text-mnu-600 text-[11px] font-bold"
                  >
                    {INTEREST_LABELS[interest]}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleRefreshStatus}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? AR.pending.refreshing : AR.pending.refreshStatusButton}</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{AR.nav.logout}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
