import { useCallback, useEffect, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type {
  Opportunity,
  OpportunityListResponse,
  StudentDashboardSummary,
} from '../types';

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
      apiClient.get<OpportunityListResponse>('/opportunities', {
        params: { sort: 'recommended' },
      }),
      apiClient.get<OpportunityListResponse>('/opportunities'),
    ])
      .then(([summaryResponse, recommendedResponse, allResponse]) => {
        if (cancelled) {
          return;
        }
        setSummary(summaryResponse.data);
        setRecommendations(
          recommendedResponse.data.opportunities.slice(0, HOME_OPPORTUNITIES_PREVIEW),
        );
        setAllOpportunities(allResponse.data.opportunities.slice(0, HOME_OPPORTUNITIES_PREVIEW));
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
