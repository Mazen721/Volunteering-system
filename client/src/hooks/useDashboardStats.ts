import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type { VolunteerCategory } from '../constants/enums';
import type {
  DashboardStatsBundle,
  FacultyStatsRow,
  FacultyStatsResponse,
  LeaderboardResponse,
  LeaderboardVolunteer,
  OverviewStats,
} from '../types';

function buildLeaderboardParams(
  category: VolunteerCategory | ''
): { category?: VolunteerCategory; limit: number } {
  return category ? { category, limit: 5 } : { limit: 5 };
}

async function fetchStatsBundle(category: VolunteerCategory | ''): Promise<DashboardStatsBundle> {
  const [overviewRes, facultiesRes, leaderboardRes] = await Promise.all([
    apiClient.get<OverviewStats>('/stats/overview'),
    apiClient.get<FacultyStatsResponse>('/stats/faculties'),
    apiClient.get<LeaderboardResponse>('/stats/leaderboard', {
      params: buildLeaderboardParams(category),
    }),
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
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [faculties, setFaculties] = useState<FacultyStatsRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardVolunteer[]>([]);
  const [certificateHours, setCertificateHours] = useState(30);
  const [activeCategory, setActiveCategory] = useState<VolunteerCategory | ''>('');

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  const dashboardReqRef = useRef(0);
  const leaderboardReqRef = useRef(0);
  const activeCategoryRef = useRef<VolunteerCategory | ''>('');

  const applyStatsBundle = useCallback((bundle: DashboardStatsBundle) => {
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
      .catch((error: unknown) => {
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

  const selectCategory = useCallback(async (category: VolunteerCategory | '') => {
    setActiveCategory(category);
    activeCategoryRef.current = category;
    const requestId = ++leaderboardReqRef.current;
    setLeaderboardLoading(true);
    setLeaderboardError('');

    try {
      const response = await apiClient.get<LeaderboardResponse>('/stats/leaderboard', {
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
