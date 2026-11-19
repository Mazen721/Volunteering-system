import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Radio, RefreshCw } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import { AttendanceDeputyCard } from '../components/opportunities/AttendanceDeputyCard';
import { LiveAttendeesTable } from '../components/opportunities/LiveAttendeesTable';
import { LiveQrPanel } from '../components/opportunities/LiveQrPanel';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type {
  Application,
  CheckInSubmitResponse,
  CheckInTokenResponse,
  CompleteOpportunityResponse,
  LiveCounters,
  LiveOpportunityResponse,
} from '../types';
import { formatDateTimeAr, formatNumber } from '../utils/format';

const LIVE_POLL_INTERVAL_MS = 10_000;
const TOKEN_REFRESH_INTERVAL_MS = 30_000;

function computeCounters(attendees: Application[]): LiveCounters {
  const checkedIn = attendees.filter((attendee) => attendee.attended).length;
  return {
    accepted: attendees.length,
    checkedIn,
    notArrived: attendees.length - checkedIn,
  };
}

async function fetchLiveOpportunity(opportunityId: string): Promise<LiveOpportunityResponse> {
  const response = await apiClient.get<LiveOpportunityResponse>(
    `/opportunities/${encodeURIComponent(opportunityId)}/live`
  );
  return response.data;
}

async function fetchCheckInToken(opportunityId: string): Promise<CheckInTokenResponse> {
  const response = await apiClient.get<CheckInTokenResponse>(
    `/opportunities/${encodeURIComponent(opportunityId)}/checkin-token`
  );
  return response.data;
}

/**
 * Organizer live event page displaying rotating QR check-in codes, live attendance counters,
 * manual attendance toggling, and event completion.
 */
export function OpportunityLivePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'dean';
  const { showToast } = useToast();
  const [liveState, setLiveState] = useState<LiveOpportunityResponse | null>(null);
  const [tokenState, setTokenState] = useState<CheckInTokenResponse>({ token: '', expiresAt: '' });
  const [loading, setLoading] = useState(Boolean(id));
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState(id ? '' : AR.opportunities.live.errorTitle);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshLiveState = useCallback(async () => {
    if (!id) return;
    const data = await fetchLiveOpportunity(id);
    setLiveState(data);
    setNowMs(Date.now());
    setError('');
  }, [id]);

  const refreshTokenManually = useCallback(async () => {
    if (!id) return;
    setLoadingToken(true);
    try {
      setTokenState(await fetchCheckInToken(id));
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setLoadingToken(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchLiveOpportunity(id)
      .then((data) => {
        if (cancelled) return;
        setLiveState(data);
        setNowMs(Date.now());
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(extractApiErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const opportunityStatus = liveState?.opportunity.status;

  useEffect(() => {
    if (!id || opportunityStatus !== 'published') {
      return;
    }

    let cancelled = false;
    const syncToken = () => {
      fetchCheckInToken(id)
        .then((data) => {
          if (!cancelled) {
            setTokenState(data);
          }
        })
        .catch((requestError: unknown) => {
          if (!cancelled) {
            showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
          }
        });
    };

    syncToken();
    const liveTimer = window.setInterval(() => {
      fetchLiveOpportunity(id)
        .then((data) => {
          if (!cancelled) {
            setLiveState(data);
            setNowMs(Date.now());
          }
        })
        .catch(() => undefined);
    }, LIVE_POLL_INTERVAL_MS);
    const tokenTimer = window.setInterval(syncToken, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(liveTimer);
      window.clearInterval(tokenTimer);
    };
  }, [id, opportunityStatus, showToast]);

  async function handleCopyToken() {
    if (!tokenState.token) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tokenState.token);
    }
    showToast({ type: 'success', message: AR.opportunities.live.qrCopied });
  }

  async function handleToggleManual(application: Application) {
    if (!id) return;
    setBusyAppId(application._id);
    try {
      const response = await apiClient.post<CheckInSubmitResponse>(
        `/opportunities/${encodeURIComponent(id)}/checkin/manual`,
        { applicationId: application._id, attended: !application.attended }
      );
      setLiveState((previous) => {
        if (!previous) return previous;
        const attendees = previous.attendees.map((entry) =>
          entry._id === application._id ? response.data.application : entry
        );
        return {
          ...previous,
          attendees,
          counters: computeCounters(attendees),
        };
      });
      showToast({ type: 'success', message: AR.opportunities.live.manualToggleSuccess });
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setBusyAppId(null);
    }
  }

  async function handleCompleteConfirmed() {
    if (!id) return;
    setCompleting(true);
    try {
      const response = await apiClient.post<CompleteOpportunityResponse>(
        `/opportunities/${encodeURIComponent(id)}/complete`
      );
      setLiveState((previous) =>
        previous ? { ...previous, opportunity: response.data.opportunity } : previous
      );
      setTokenState({ token: '', expiresAt: '' });
      setConfirmCompleteOpen(false);
      showToast({ type: 'success', message: AR.opportunities.live.completeSuccess });
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setCompleting(false);
    }
  }

  const opportunity = liveState?.opportunity ?? null;
  const isClosed =
    opportunity?.status === 'completed' || opportunity?.status === 'cancelled';
  const hasEnded = opportunity
    ? opportunity.phase === 'ended' || nowMs > new Date(opportunity.endAt).getTime()
    : false;
  const canComplete = opportunity?.status === 'published' && hasEnded;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <Link
          to={isStaff ? '/opportunities/manage' : `/opportunities/${encodeURIComponent(id ?? '')}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-mnu-600 hover:text-mnu-700"
        >
          <ArrowRight className="w-4 h-4" />
          <span>
            {isStaff
              ? AR.opportunities.live.backToManage
              : AR.studentPortal.checkin.backToDetails}
          </span>
        </Link>

        {loading && (
          <div className="glass-card rounded-3xl p-8 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>{AR.opportunities.live.loading}</span>
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="glass-card rounded-3xl p-6 text-center space-y-3 border border-rose-200"
          >
            <AlertCircle className="w-7 h-7 text-rose-600 mx-auto" />
            <p className="text-sm font-bold text-rose-800">{AR.opportunities.live.errorTitle}</p>
            <p className="text-xs text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void refreshLiveState()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{AR.common.retry}</span>
            </button>
          </div>
        )}

        {liveState && opportunity && !loading && !error && (
          <>
            <header className="glass-card rounded-3xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-mnu-600">
                    <Radio className="w-4 h-4 animate-pulse" />
                    <span>{AR.opportunities.live.pageTitle}</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                    {opportunity.title}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {opportunity.location.name} • {formatDateTimeAr(opportunity.startAt)} —{' '}
                    {formatDateTimeAr(opportunity.endAt)} • {formatNumber(opportunity.hours)}{' '}
                    {AR.common.hourUnit}
                  </p>
                </div>

                {opportunity.status === 'published' && isStaff && (
                  <div className="flex flex-col items-start md:items-end gap-1.5">
                    <button
                      type="button"
                      disabled={!canComplete || completing}
                      onClick={() => setConfirmCompleteOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-md cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{AR.opportunities.live.completeBtn}</span>
                    </button>
                    {!hasEnded && (
                      <p className="text-[11px] font-semibold text-slate-500">
                        {AR.opportunities.live.completeBeforeEndHint}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {opportunity.status === 'completed' && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{AR.opportunities.live.completedNotice}</span>
                </div>
              )}

              {!isStaff && (
                <div className="p-3.5 rounded-2xl bg-mnu-500/10 border border-mnu-500/20 text-mnu-700 text-xs font-bold flex items-center gap-2">
                  <Radio className="w-4 h-4 shrink-0" />
                  <span>{AR.opportunities.live.deputyBanner}</span>
                </div>
              )}
            </header>

            {isStaff && !isClosed && (
              <AttendanceDeputyCard
                opportunity={opportunity}
                attendees={liveState.attendees}
                onUpdated={(updated) =>
                  setLiveState((previous) =>
                    previous ? { ...previous, opportunity: updated } : previous
                  )
                }
              />
            )}

            <LiveQrPanel
              opportunity={opportunity}
              token={tokenState.token}
              expiresAt={tokenState.expiresAt}
              loadingToken={loadingToken}
              onRefreshToken={() => void refreshTokenManually()}
              onCopyToken={() => void handleCopyToken()}
            />

            <LiveAttendeesTable
              counters={liveState.counters}
              attendees={liveState.attendees}
              isClosed={Boolean(isClosed)}
              busyApplicationId={busyAppId}
              onToggleManual={(application) => void handleToggleManual(application)}
            />
          </>
        )}
      </main>

      <ConfirmDialog
        isOpen={confirmCompleteOpen}
        title={AR.opportunities.live.completeConfirmTitle}
        message={AR.opportunities.live.completeConfirmMessage}
        loading={completing}
        confirmLabel={AR.opportunities.live.completeBtn}
        loadingLabel={AR.opportunities.live.completing}
        onConfirm={() => void handleCompleteConfirmed()}
        onCancel={() => setConfirmCompleteOpen(false)}
      />
    </div>
  );
}
