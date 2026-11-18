import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { OpportunityCard } from '../components/student/OpportunityCard';
import { AR } from '../constants/ar';
import type { Opportunity, OpportunityListResponse } from '../types';

/**
 * Student opportunity board ranked by the server recommendation score.
 */
export function OpportunitiesBoardPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<OpportunityListResponse>('/opportunities', { params: { sort: 'recommended' } })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOpportunities(response.data.opportunities);
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
            <Sparkles className="w-6 h-6 text-mnu-gold" />
            {AR.studentPortal.board.pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {AR.studentPortal.board.pageSubtitle}
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

        {!loading && !error && opportunities.length === 0 && (
          <div className="glass-card rounded-3xl p-8 text-center text-sm text-slate-500">
            {AR.studentPortal.board.empty}
          </div>
        )}

        {!loading && !error && opportunities.length > 0 && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity._id} opportunity={opportunity} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
