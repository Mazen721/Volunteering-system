import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client.js';

function buildLeaderboardParams(category) {
  return category ? { category, limit: 5 } : { limit: 5 };
}

async function fetchStatsBundle(category) {
  const [overviewRes, facultiesRes, leaderboardRes] = await Promise.all([
    apiClient.get('/stats/overview'),
    apiClient.get('/stats/faculties'),
    apiClient.get('/stats/leaderboard', { params: buildLeaderboardParams(category) }),
  ]);

  return {
    overview: overviewRes.data,
    faculties: facultiesRes.data.faculties,
    leaderboard: leaderboardRes.data.leaderboard,
    certificateHours: leaderboardRes.data.certificateHours ?? overviewRes.data.certificateHours,
  };
}

/**
 * Manages fetching, refreshing, and category-tab filtering for dashboard statistics.
 */
export function useDashboardStats() {
  const [overview, setOverview] = useState(null);
  const [faculties, setFaculties] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [certificateHours, setCertificateHours] = useState(30);
  const [activeCategory, setActiveCategory] = useState('');

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  const dashboardReqRef = useRef(0);
  const leaderboardReqRef = useRef(0);
  const activeCategoryRef = useRef('');

  const applyStatsBundle = useCallback((bundle) => {
    setOverview(bundle.overview);
    setFaculties(bundle.faculties);
    setLeaderboard(bundle.leaderboard);
    setCertificateHours(bundle.certificateHours);
  }, []);

  useEffect(() => {
    const requestId = ++dashboardReqRef.current;

    fetchStatsBundle('')
      .then((bundle) => {
        if (requestId === dashboardReqRef.current) {
          applyStatsBundle(bundle);
        }
      })
      .catch((error) => {
        if (requestId === dashboardReqRef.current) {
          setPageError(extractApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (requestId === dashboardReqRef.current) {
          setInitialLoading(false);
        }
      });
  }, [applyStatsBundle]);

  const refresh = useCallback(async () => {
    const requestId = ++dashboardReqRef.current;
    const hasExistingData = Boolean(overview);
    setRefreshing(hasExistingData);
    setInitialLoading(!hasExistingData);
    setPageError('');
    setLeaderboardError('');

    try {
      const bundle = await fetchStatsBundle(activeCategoryRef.current);
      if (requestId === dashboardReqRef.current) {
        applyStatsBundle(bundle);
      }
    } catch (error) {
      if (requestId === dashboardReqRef.current) {
        setPageError(extractApiErrorMessage(error));
      }
    } finally {
      if (requestId === dashboardReqRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyStatsBundle, overview]);

  const selectCategory = useCallback(async (category) => {
    setActiveCategory(category);
    activeCategoryRef.current = category;
    const requestId = ++leaderboardReqRef.current;
    setLeaderboardLoading(true);
    setLeaderboardError('');

    try {
      const response = await apiClient.get('/stats/leaderboard', {
        params: buildLeaderboardParams(category),
      });
      if (requestId === leaderboardReqRef.current) {
        setLeaderboard(response.data.leaderboard);
        setCertificateHours(response.data.certificateHours);
      }
    } catch (error) {
      if (requestId === leaderboardReqRef.current) {
        setLeaderboardError(extractApiErrorMessage(error));
      }
    } finally {
      if (requestId === leaderboardReqRef.current) {
        setLeaderboardLoading(false);
      }
    }
  }, []);

  return {
    overview,
    faculties,
    leaderboard,
    certificateHours,
    activeCategory,
    initialLoading,
    refreshing,
    pageError,
    leaderboardLoading,
    leaderboardError,
    selectCategory,
    refresh,
  };
}
