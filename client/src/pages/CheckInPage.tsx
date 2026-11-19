import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  MapPin,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { QrCameraScanner } from '../components/student/QrCameraScanner';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { CheckInSubmitResponse, Opportunity, OpportunityResponse } from '../types';
import { formatDateTimeAr } from '../utils/format';

function extractCheckInToken(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';
  try {
    const parsedUrl = new URL(trimmed);
    const paramToken = parsedUrl.searchParams.get('token');
    if (paramToken) return paramToken.trim();
  } catch {
    // Plain JWT tokens are not URLs; submit the trimmed token directly.
  }
  return trimmed;
}

/**
 * Student live check-in page for submitting a rotating QR attendance token.
 */
export function CheckInPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [tokenInput, setTokenInput] = useState(() => searchParams.get('token') ?? '');
  const [loading, setLoading] = useState(Boolean(opportunityId));
  const [loadError, setLoadError] = useState(
    opportunityId ? '' : AR.studentPortal.checkin.errorTitle
  );
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!opportunityId) return;
    let cancelled = false;
    apiClient
      .get<OpportunityResponse>(`/opportunities/${encodeURIComponent(opportunityId)}`)
      .then((response) => {
        if (!cancelled) {
          setOpportunity(response.data.opportunity);
          setLoadError('');
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setLoadError(extractApiErrorMessage(requestError));
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
  }, [opportunityId]);

  async function submitToken(rawToken: string) {
    if (!opportunityId) return;

    const token = extractCheckInToken(rawToken);
    if (!token) {
      setSubmitError(AR.studentPortal.checkin.tokenRequired);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await apiClient.post<CheckInSubmitResponse>(
        `/opportunities/${encodeURIComponent(opportunityId)}/checkin`,
        { token }
      );
      setOpportunity((current) =>
        current ? { ...current, myApplication: response.data.application } : current
      );
      showToast({ type: 'success', message: AR.studentPortal.checkin.successTitle });
    } catch (requestError) {
      const message = extractApiErrorMessage(requestError);
      setSubmitError(message);
      showToast({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  }

  const myApplication = opportunity?.myApplication;
  const isAccepted = myApplication?.status === 'accepted';
  const isAttended = Boolean(myApplication?.attended);
  const isPendingAccount = user?.status === 'pending';

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/me"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-mnu-600 hover:text-mnu-700"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{AR.studentPortal.checkin.backToDashboard}</span>
          </Link>
          {opportunityId && (
            <Link
              to={`/opportunities/${encodeURIComponent(opportunityId)}`}
              className="text-xs font-bold text-slate-600 hover:text-mnu-600"
            >
              {AR.studentPortal.checkin.backToDetails}
            </Link>
          )}
        </div>

        {loading && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>{AR.studentPortal.checkin.loading}</span>
          </div>
        )}

        {loadError && !loading && (
          <div
            role="alert"
            className="glass-card rounded-3xl p-6 space-y-2 border border-rose-200 text-rose-700"
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <AlertCircle className="w-5 h-5" />
              <span>{AR.studentPortal.checkin.errorTitle}</span>
            </div>
            <p className="text-xs">{loadError}</p>
          </div>
        )}

        {opportunity && !loading && !loadError && (
          <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800">
                  {AR.studentPortal.checkin.pageTitle}
                </h1>
                <p className="text-xs text-slate-500">{AR.studentPortal.checkin.pageSubtitle}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/80 border border-slate-200 space-y-1">
              <h2 className="text-sm font-black text-slate-800">{opportunity.title}</h2>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="w-3.5 h-3.5 text-mnu-500" />
                <span>{opportunity.location.name}</span>
              </p>
            </div>

            {isAttended ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-2">
                <div className="flex items-center gap-2 text-sm font-black">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{AR.studentPortal.checkin.successTitle}</span>
                </div>
                <p className="text-xs">{AR.studentPortal.checkin.successMessage}</p>
                {myApplication?.checkedInAt && (
                  <p className="text-xs font-bold">
                    {AR.studentPortal.checkin.checkedInAtLabel}{' '}
                    {formatDateTimeAr(myApplication.checkedInAt)}
                  </p>
                )}
              </div>
            ) : isPendingAccount ? (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold"
              >
                {AR.studentPortal.checkin.pendingLockedNotice}
              </div>
            ) : !isAccepted ? (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold"
              >
                {AR.studentPortal.checkin.notAcceptedNotice}
              </div>
            ) : opportunity.status === 'completed' ? (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold"
              >
                {AR.studentPortal.checkin.completedNotice}
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitToken(tokenInput);
                }}
                className="space-y-4"
              >
                {!opportunity.checkInOpen && (
                  <div
                    role="alert"
                    className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold"
                  >
                    {AR.studentPortal.checkin.windowClosedNotice}
                  </div>
                )}

                <QrCameraScanner
                  onDetected={(rawValue) => {
                    setTokenInput(rawValue);
                    void submitToken(rawValue);
                  }}
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="checkin-token-input"
                    className="block text-xs font-bold text-slate-700"
                  >
                    {AR.studentPortal.checkin.tokenLabel}
                  </label>
                  <input
                    id="checkin-token-input"
                    type="text"
                    dir="ltr"
                    value={tokenInput}
                    onChange={(event) => {
                      setTokenInput(event.target.value);
                      if (submitError) setSubmitError('');
                    }}
                    placeholder={AR.studentPortal.checkin.tokenPlaceholder}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
                  />
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {submitting
                      ? AR.studentPortal.checkin.submitting
                      : AR.studentPortal.checkin.submitBtn}
                  </span>
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
