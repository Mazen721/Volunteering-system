import { useCallback, useEffect, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { fetchAllOpportunities } from '../api/opportunities';
import type { Opportunity, StudentDashboardSummary } from '../types';
import { isStudentDiscoverable, sortByPhasePriority } from '../utils/opportunityPhase';

const HOME_OPPORTUNITIES_PREVIEW = 3;

/**
 * Loads everything the student home page needs: the dashboard summary (live and
 * upcoming work), the top recommended opportunities, and a short preview of all
 * available work. Statistics stay on the dashboard; this hook only feeds the
 * work-first home page.
 */
export function useStudentHome() {
  const [summary, setSummary] = useState<StudentDashboardSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Opportunity[]>([]);
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<StudentDashboardSummary>('/stats/me'),
      fetchAllOpportunities({ sort: 'recommended' }),
      fetchAllOpportunities(),
    ])
      .then(([summaryResponse, recommendedResponse, allResponse]) => {
        if (cancelled) {
          return;
        }
        setSummary(summaryResponse.data);
        // Home surfaces follow the board rule: ended (and completed or
        // cancelled) opportunities never appear — they are history, so the
        // hero's recommendation pool and both row sections stay actionable.
        setRecommendations(
          recommendedResponse.opportunities
            .filter(isStudentDiscoverable)
            .slice(0, HOME_OPPORTUNITIES_PREVIEW),
        );
        // The plain list arrives oldest-first; after dropping ended work,
        // surface registration-open opportunities first in the preview.
        setAllOpportunities(
          sortByPhasePriority(allResponse.opportunities.filter(isStudentDiscoverable)).slice(
            0,
            HOME_OPPORTUNITIES_PREVIEW,
          ),
        );
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

  const retry = useCallback(() => {
    setLoading(true);
    setError('');
    setReloadKey((value) => value + 1);
  }, []);

  return {
    summary,
    recommendations,
    allOpportunities,
    loading,
    error,
    retry,
  };
}
