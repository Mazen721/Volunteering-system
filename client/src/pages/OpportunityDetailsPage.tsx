import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { AR, INTEREST_LABELS } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { Application, Opportunity, OpportunityResponse } from '../types';
import { hasActiveApplication } from '../utils/applications';
import { resolveOpportunityCover } from '../utils/covers';
import { formatDateTimeAr, formatNumber } from '../utils/format';

interface ApplicationResponse {
  application: Application;
}

/**
 * Student opportunity details page with apply and withdraw actions.
 */
export function OpportunityDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(id ? '' : AR.studentPortal.details.errorTitle);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;
    apiClient
      .get<OpportunityResponse>(`/opportunities/${id}`)
      .then((response) => {
        if (!cancelled) {
          setOpportunity(response.data.opportunity);
          setError('');
        }
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
  }, [id, reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError('');
    setReloadKey((value) => value + 1);
  }

  async function handleApply() {
    if (!opportunity) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post<ApplicationResponse>(
        `/opportunities/${opportunity._id}/apply`,
        { note: '' }
      );
      setOpportunity((current) =>
        current ? { ...current, myApplication: response.data.application } : current
      );
      showToast({ type: 'success', message: AR.studentPortal.details.applySuccess });
    } catch (requestError: unknown) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!opportunity) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.delete<ApplicationResponse>(
        `/opportunities/${opportunity._id}/apply`
      );
      setOpportunity((current) =>
        current ? { ...current, myApplication: response.data.application } : current
      );
      showToast({ type: 'success', message: AR.studentPortal.details.withdrawSuccess });
    } catch (requestError: unknown) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setSubmitting(false);
    }
  }

  const myApplication = opportunity?.myApplication;
  const activeApplication = hasActiveApplication(myApplication);
  const isPendingAccount = user?.status === 'pending';
  const canApply =
    opportunity !== null &&
    opportunity.status === 'published' &&
    opportunity.phase === 'upcoming' &&
    !activeApplication &&
    !isPendingAccount;
  const canWithdraw = opportunity !== null && opportunity.phase === 'upcoming' && activeApplication;
  const isFull = opportunity?.isFull ?? (opportunity?.remainingSlots.student ?? 0) <= 0;

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-5">
        <Link
          to="/opportunities"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-mnu-600 hover:text-mnu-700"
        >
          <ArrowRight className="w-4 h-4" />
          {AR.studentPortal.details.backToBoard}
        </Link>

        {loading && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {AR.studentPortal.details.loading}
          </div>
        )}

        {error && !loading && (
          <div className="glass-card rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-bold">
              <XCircle className="w-5 h-5" />
              {AR.studentPortal.details.errorTitle}
            </div>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition"
            >
              {AR.studentPortal.common.retry}
            </button>
          </div>
        )}

        {opportunity && !loading && !error && (
          <>
            <div className="glass-card rounded-3xl overflow-hidden">
              <img
                src={resolveOpportunityCover(opportunity)}
                alt=""
                className="w-full h-52 sm:h-64 object-cover"
              />
            </div>

            <header className="glass-card rounded-3xl p-6 sm:p-8 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                    {opportunity.title}
                  </h1>
                  <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-mnu-500" />
                      {opportunity.location.name}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{opportunity.faculty ?? AR.studentPortal.board.allFaculties}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isFull && (
                    <>
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                        {AR.studentPortal.board.fullBadge}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-bold">
                        {AR.studentPortal.board.waitlistBadge}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {opportunity.fields.map((field) => (
                  <span
                    key={field}
                    className="px-2.5 py-1 rounded-full bg-mnu-500/10 text-mnu-600 text-[11px] font-bold"
                  >
                    {INTEREST_LABELS[field]}
                  </span>
                ))}
              </div>

              {(opportunity.matchedFields?.length ?? 0) > 0 && (
                <p className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold text-mnu-600">
                  <Sparkles className="w-3.5 h-3.5" />
                  {AR.studentPortal.board.matchBadgePrefix}{' '}
                  {opportunity.matchedFields
                    ?.map((field) => INTEREST_LABELS[field])
                    .join('، ')}
                </p>
              )}

              {myApplication && myApplication.status !== 'cancelled' && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold">
                  <span>
                    {AR.studentPortal.details.applicationStatusLabel}:{' '}
                    {AR.opportunities.applicationStatuses[myApplication.status]}
                  </span>
                  {myApplication.attended && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                      {AR.studentPortal.details.attendedBadge}
                    </span>
                  )}
                </div>
              )}

              {isFull && (
                <p className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                  {AR.studentPortal.details.waitlistNotice}
                </p>
              )}

              {isPendingAccount && opportunity.phase === 'upcoming' && !activeApplication && (
                <p className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                  {AR.studentPortal.details.applyLocked}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {canApply && (
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition active:scale-95"
                  >
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitting
                      ? AR.studentPortal.details.applying
                      : isFull
                        ? AR.studentPortal.board.waitlistBadge
                        : AR.studentPortal.details.applyButton}
                  </button>
                )}
                {canWithdraw && (
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-60 text-rose-700 text-xs font-bold transition active:scale-95"
                  >
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    {submitting
                      ? AR.studentPortal.details.withdrawing
                      : AR.studentPortal.details.withdrawButton}
                  </button>
                )}
                {myApplication?.status === 'accepted' &&
                  opportunity.checkInOpen &&
                  !myApplication.attended && (
                    <Link
                      to={`/checkin/${encodeURIComponent(opportunity._id)}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>{AR.studentPortal.details.checkInCta}</span>
                    </Link>
                  )}
                {!canApply && !canWithdraw && opportunity.phase !== 'upcoming' && (
                  <p className="text-xs font-bold text-slate-500">
                    {AR.studentPortal.details.applyUnavailable}
                  </p>
                )}
              </div>
            </header>

            {opportunity.attendanceDeputy &&
              user?.id &&
              opportunity.attendanceDeputy === user.id && (
                <section
                  data-testid="deputy-live-card"
                  className="rounded-3xl p-6 bg-mnu-700 text-white space-y-3 shadow-lg"
                >
                  <h2 className="text-base font-black flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-mnu-gold" />
                    <span>{AR.studentPortal.details.deputyTitle}</span>
                  </h2>
                  <p className="text-xs text-white/80 leading-relaxed">
                    {AR.studentPortal.details.deputyText}
                  </p>
                  <Link
                    to={`/opportunities/${encodeURIComponent(opportunity._id)}/live`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-gold text-mnu-700 text-xs font-black transition active:scale-95"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{AR.studentPortal.details.deputyLiveBtn}</span>
                  </Link>
                </section>
              )}

            <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-sm font-black text-slate-800">
                  {AR.studentPortal.details.descriptionLabel}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {opportunity.description}
                </p>
              </div>

              {opportunity.requirements && (
                <div className="space-y-1.5">
                  <h2 className="text-sm font-black text-slate-800">
                    {AR.studentPortal.details.requirementsLabel}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {opportunity.requirements}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-mnu-500" />
                  {formatDateTimeAr(opportunity.startAt)}
                </p>
                <p className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-mnu-500" />
                  {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
                </p>
                <p className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-mnu-500" />
                  {AR.studentPortal.details.slotsLabel}:{' '}
                  {formatNumber(opportunity.remainingSlots.student)}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-mnu-500" />
                  {opportunity.location.address}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/70 text-xs text-slate-600">
                <p className="flex items-center gap-2">
                  <UserRound className="w-4 h-4 text-mnu-500" />
                  {opportunity.contactName}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-mnu-500" />
                  {opportunity.contactPhone}
                </p>
                <p className="flex items-center gap-2 break-all">
                  <Mail className="w-4 h-4 text-mnu-500" />
                  {opportunity.contactEmail}
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
