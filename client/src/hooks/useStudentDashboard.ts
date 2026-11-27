import { useCallback, useEffect, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { fetchAllOpportunities } from '../api/opportunities';
import type { Opportunity, StudentDashboardSummary } from '../types';

/**
 * Loads the student dashboard summary and top recommended opportunities with retry support.
 */
export function useStudentDashboard() {
  const [summary, setSummary] = useState<StudentDashboardSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<StudentDashboardSummary>('/stats/me'),
      fetchAllOpportunities({ sort: 'recommended' }),
    ])
      .then(([summaryResponse, opportunitiesResponse]) => {
        if (cancelled) {
          return;
        }
        setSummary(summaryResponse.data);
        setRecommendations(opportunitiesResponse.opportunities.slice(0, 3));
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
    loading,
    error,
    retry,
  };
}
