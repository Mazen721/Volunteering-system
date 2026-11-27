import { useEffect, useState } from 'react';
import { Info, LayoutGrid, RefreshCw, XCircle } from 'lucide-react';
import { extractApiErrorMessage } from '../api/client';
import { fetchAllOpportunities } from '../api/opportunities';
import { Navbar } from '../components/Navbar';
import { OpportunityCard } from '../components/student/OpportunityCard';
import { AR } from '../constants/ar';
import type { Opportunity } from '../types';
import { isStudentDiscoverable, sortByPhasePriority } from '../utils/opportunityPhase';

interface BoardItem {
  opportunity: Opportunity;
  suggested: boolean;
}

/**
 * The student opportunity board: every actionable opportunity visible to the
 * student — general ones plus his faculty's, including the ones he already
 * applied to (shown with their real application status) — with the
 * server-recommended ones badged and listed first. Nothing he applied to
 * silently disappears, and ended work never appears here: it is history and
 * lives in «طلباتي».
 */
export function OpportunitiesBoardPage() {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllOpportunities(), fetchAllOpportunities({ sort: 'recommended' })])
      .then(([allResponse, recommendedResponse]) => {
        if (cancelled) {
          return;
        }
        // Discovery shows actionable work only: ended (and completed or
        // cancelled) opportunities are filtered out of both lists, even the
        // ones he applied to — their history lives in «طلباتي».
        const all = allResponse.opportunities.filter(isStudentDiscoverable);
        const recommended = recommendedResponse.opportunities.filter(isStudentDiscoverable);
        const allById = new Map(all.map((opportunity) => [opportunity._id, opportunity]));
        const recommendedIds = new Set(recommended.map((opportunity) => opportunity._id));
        const suggestedItems: BoardItem[] = recommended.map((opportunity) => ({
          opportunity: {
            ...opportunity,
            myApplication: allById.get(opportunity._id)?.myApplication ?? opportunity.myApplication,
          },
          suggested: true,
        }));
        const restItems: BoardItem[] = sortByPhasePriority(
          all.filter((opportunity) => !recommendedIds.has(opportunity._id))
        ).map((opportunity) => ({ opportunity, suggested: false }));
        setItems([...suggestedItems, ...restItems]);
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
  }, [reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError('');
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-black text-slate-800">
            <LayoutGrid className="w-6 h-6 text-mnu-gold" />
            {AR.studentPortal.board.pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">{AR.studentPortal.board.pageSubtitle}</p>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 pt-0.5">
            <Info className="w-3.5 h-3.5 text-mnu-500 shrink-0" />
            {AR.studentPortal.board.visibilityHint}
          </p>
        </header>

        {loading && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {AR.studentPortal.board.loading}
          </div>
        )}

        {error && !loading && (
          <div className="glass-card rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-bold">
              <XCircle className="w-5 h-5" />
              {AR.studentPortal.board.errorTitle}
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

        {!loading && !error && items.length === 0 && (
          <div className="glass-card rounded-3xl p-8 text-center text-sm text-slate-500">
            {AR.studentPortal.board.empty}
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((item) => (
              <OpportunityCard
                key={item.opportunity._id}
                opportunity={item.opportunity}
                suggested={item.suggested}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
