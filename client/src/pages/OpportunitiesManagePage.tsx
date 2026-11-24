import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  CalendarPlus,
  Eye,
  Pencil,
  Radio,
  RefreshCw,
  Search,
  Send,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import { ApplicantsModal } from '../components/opportunities/ApplicantsModal';
import { AR } from '../constants/ar';
import type { OpportunityPhase, OpportunityStatus } from '../constants/enums';
import {
  CATEGORIES,
  OPPORTUNITY_PHASES,
  OPPORTUNITY_STATUSES,
} from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type {
  AuthUser,
  Opportunity,
  OpportunityListResponse,
  OpportunityResponse,
} from '../types';
import { resolveOpportunityCover } from '../utils/covers';
import { formatDateTimeAr, formatNumber } from '../utils/format';

const STATUS_STYLES: Record<OpportunityStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  completed: 'bg-mnu-50 text-mnu-700 border-mnu-200',
};

const PHASE_STYLES: Record<OpportunityPhase, string> = {
  upcoming: 'bg-sky-50 text-sky-700 border-sky-200',
  registration_closed: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ended: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface OpportunityFilters {
  search: string;
  status: OpportunityStatus | '';
  phase: OpportunityPhase | '';
}

const INITIAL_FILTERS: OpportunityFilters = {
  search: '',
  status: '',
  phase: '',
};

function canManageOpportunity(opportunity: Opportunity, user: AuthUser): boolean {
  if (user.role === 'admin') {
    return true;
  }
  return (
    user.role === 'dean' &&
    opportunity.faculty !== null &&
    opportunity.faculty === user.faculty &&
    opportunity.createdBy === user.id
  );
}

function isClosedOpportunity(opportunity: Opportunity): boolean {
  return opportunity.status === 'completed' || opportunity.status === 'cancelled';
}

async function fetchOpportunities(): Promise<Opportunity[]> {
  const response = await apiClient.get<OpportunityListResponse>('/opportunities');
  return response.data.opportunities;
}

function filterOpportunities(
  opportunities: Opportunity[],
  filters: OpportunityFilters
): Opportunity[] {
  const term = filters.search.trim().toLowerCase();
  return opportunities.filter((opportunity) => {
    if (filters.status && opportunity.status !== filters.status) {
      return false;
    }
    if (filters.phase && opportunity.phase !== filters.phase) {
      return false;
    }
    if (!term) {
      return true;
    }
    return (
      opportunity.title.toLowerCase().includes(term) ||
      opportunity.location.name.toLowerCase().includes(term) ||
      opportunity.location.address.toLowerCase().includes(term)
    );
  });
}

/**
 * Organizer management page for opportunities, publishing, cancellation, and applicant review.
 */
export function OpportunitiesManagePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<OpportunityFilters>(INITIAL_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Opportunity | null>(null);
  const [applicantsTarget, setApplicantsTarget] = useState<Opportunity | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOpportunities()
      .then((items) => {
        if (cancelled) return;
        setOpportunities(items);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(extractApiErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    setLoading(true);
    setError('');
    try {
      setOpportunities(await fetchOpportunities());
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const filteredOpportunities = useMemo(
    () => filterOpportunities(opportunities, filters),
    [opportunities, filters]
  );

  function updateFilter<K extends keyof OpportunityFilters>(
    field: K,
    value: OpportunityFilters[K]
  ) {
    setFilters((previous) => ({ ...previous, [field]: value }));
  }

  async function handlePublish(opportunity: Opportunity) {
    setBusyId(opportunity._id);
    try {
      const response = await apiClient.post<OpportunityResponse>(
        `/opportunities/${encodeURIComponent(opportunity._id)}/publish`
      );
      setOpportunities((previous) =>
        previous.map((entry) =>
          entry._id === opportunity._id ? response.data.opportunity : entry
        )
      );
      showToast({ type: 'success', message: AR.opportunities.publishSuccess });
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelConfirmed() {
    if (!cancelTarget) return;
    const targetId = cancelTarget._id;
    setBusyId(targetId);
    try {
      const response = await apiClient.post<OpportunityResponse>(
        `/opportunities/${encodeURIComponent(targetId)}/cancel`
      );
      setOpportunities((previous) =>
        previous.map((entry) => (entry._id === targetId ? response.data.opportunity : entry))
      );
      showToast({ type: 'success', message: AR.opportunities.cancelSuccess });
      setCancelTarget(null);
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                  {AR.opportunities.pageTitle}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {AR.opportunities.pageSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{AR.dashboard.refreshButton}</span>
              </button>
              <Link
                to="/opportunities/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition shadow-md"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>{AR.opportunities.addOpportunityBtn}</span>
              </Link>
            </div>
          </div>

          {user?.role === 'dean' && (
            <p className="text-[11px] font-semibold text-slate-500">
              {AR.opportunities.deanScopeNote}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label={AR.opportunities.pageTitle}
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder={AR.opportunities.form.titlePlaceholder}
                className="w-full pr-10 pl-3 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
              />
            </div>

            <select
              aria-label={AR.opportunities.statusFilterLabel}
              value={filters.status}
              onChange={(event) =>
                updateFilter('status', event.target.value as OpportunityStatus | '')
              }
              className="px-3.5 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="">{AR.opportunities.allStatuses}</option>
              {OPPORTUNITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AR.opportunities.statuses[status]}
                </option>
              ))}
            </select>

            <select
              aria-label={AR.opportunities.phaseFilterLabel}
              value={filters.phase}
              onChange={(event) =>
                updateFilter('phase', event.target.value as OpportunityPhase | '')
              }
              className="px-3.5 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="">{AR.opportunities.allPhases}</option>
              {OPPORTUNITY_PHASES.map((phase) => (
                <option key={phase} value={phase}>
                  {AR.opportunities.phases[phase]}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-bold text-mnu-500">
              {AR.opportunities.loading}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
            >
              <AlertCircle className="w-7 h-7 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-800">{AR.opportunities.errorTitle}</p>
              <p className="text-xs text-rose-700">{error}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{AR.common.retry}</span>
              </button>
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="p-10 text-center text-xs sm:text-sm font-bold text-slate-500">
              {AR.opportunities.empty}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-mnu-500 text-white text-xs font-bold">
                    <th className="p-4 whitespace-nowrap">{AR.opportunities.columns.title}</th>
                    <th className="p-4 whitespace-nowrap">{AR.opportunities.columns.faculty}</th>
                    <th className="p-4 whitespace-nowrap">{AR.opportunities.columns.schedule}</th>
                    <th className="p-4 whitespace-nowrap">{AR.opportunities.columns.slots}</th>
                    <th className="p-4 text-center whitespace-nowrap">
                      {AR.opportunities.columns.status}
                    </th>
                    <th className="p-4 text-center whitespace-nowrap">
                      {AR.opportunities.columns.phase}
                    </th>
                    <th className="p-4 text-center whitespace-nowrap">
                      {AR.opportunities.columns.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {filteredOpportunities.map((opportunity) => {
                    const manageable = user ? canManageOpportunity(opportunity, user) : false;
                    const busy = busyId === opportunity._id;
                    const isClosed = isClosedOpportunity(opportunity);

                    return (
                      <tr key={opportunity._id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 align-top">
                          <div className="flex items-start gap-3">
                            <img
                              src={resolveOpportunityCover(opportunity)}
                              alt=""
                              loading="lazy"
                              className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-100"
                            />
                            <div>
                              <div className="font-black text-slate-800 max-w-[16rem]">
                                {opportunity.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {opportunity.location.name}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {formatNumber(opportunity.hours)} {AR.common.hourUnit}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top text-slate-700 whitespace-nowrap">
                          {opportunity.faculty ?? AR.opportunities.allFaculties}
                        </td>
                        <td className="p-4 align-top text-slate-600">
                          <div className="whitespace-nowrap">
                            {formatDateTimeAr(opportunity.startAt)}
                          </div>
                          <div className="whitespace-nowrap text-[11px] text-slate-500 mt-0.5">
                            {formatDateTimeAr(opportunity.endAt)}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="space-y-0.5 whitespace-nowrap">
                            {CATEGORIES.map((category) => (
                              <div key={category} className="text-[11px]">
                                <span className="text-slate-500">
                                  {AR.categories[category]}:
                                </span>{' '}
                                <span className="font-black text-slate-800">
                                  {formatNumber(opportunity.acceptedCounts[category])} /{' '}
                                  {formatNumber(opportunity.slots[category])}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-center align-top whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_STYLES[opportunity.status]}`}
                          >
                            {AR.opportunities.statuses[opportunity.status]}
                          </span>
                        </td>
                        <td className="p-4 text-center align-top whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${PHASE_STYLES[opportunity.phase]}`}
                          >
                            {AR.opportunities.phases[opportunity.phase]}
                          </span>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setApplicantsTarget(opportunity)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-mnu-500 text-slate-700 hover:text-white border border-slate-200 text-[11px] font-bold transition cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>{AR.opportunities.applicantsBtn}</span>
                            </button>

                            {manageable &&
                              (opportunity.status === 'published' ||
                                opportunity.status === 'completed') && (
                                <Link
                                  to={`/opportunities/${encodeURIComponent(opportunity._id)}/live`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-mnu-50 hover:bg-mnu-500 text-mnu-700 hover:text-white border border-mnu-200 text-[11px] font-bold transition"
                                >
                                  <Radio className="w-3.5 h-3.5" />
                                  <span>{AR.opportunities.liveBtn}</span>
                                </Link>
                              )}

                            {manageable && (
                              <Link
                                to={`/opportunities/${encodeURIComponent(opportunity._id)}/edit`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-600 text-slate-700 hover:text-white border border-slate-200 text-[11px] font-bold transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>{AR.opportunities.editBtn}</span>
                              </Link>
                            )}

                            {manageable && opportunity.status === 'draft' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handlePublish(opportunity)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-[11px] font-bold transition cursor-pointer disabled:opacity-60"
                              >
                                {busy ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>{AR.opportunities.publishBtn}</span>
                              </button>
                            )}

                            {manageable && !isClosed && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setCancelTarget(opportunity)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 text-[11px] font-bold transition cursor-pointer disabled:opacity-60"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>{AR.opportunities.cancelBtn}</span>
                              </button>
                            )}

                            {!manageable && (
                              <span
                                title={AR.opportunities.notOwnerNote}
                                className="inline-flex items-center text-slate-400"
                              >
                                <Eye className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <ApplicantsModal
        isOpen={applicantsTarget !== null}
        opportunityId={applicantsTarget?._id ?? null}
        opportunityTitle={applicantsTarget?.title ?? ''}
        isClosed={applicantsTarget ? isClosedOpportunity(applicantsTarget) : false}
        onClose={() => setApplicantsTarget(null)}
      />

      <ConfirmDialog
        isOpen={cancelTarget !== null}
        title={AR.opportunities.cancelConfirmTitle}
        message={AR.opportunities.cancelConfirmMessage}
        loading={busyId === cancelTarget?._id}
        confirmLabel={AR.opportunities.cancelBtn}
        loadingLabel={AR.opportunities.cancelling}
        onConfirm={handleCancelConfirmed}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
