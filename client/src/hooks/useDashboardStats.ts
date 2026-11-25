import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type { Faculty, VolunteerCategory } from '../constants/enums';
import type {
  CategoryStatsResponse,
  CategoryStatsRow,
  DashboardStatsBundle,
  EventStatsResponse,
  FacultyStatsResponse,
  FacultyStatsRow,
  LeaderboardResponse,
  LeaderboardVolunteer,
  MonthlyHoursPoint,
  MonthlyHoursResponse,
  OverviewStats,
  ParticipationStatsResponse,
} from '../types';

function buildLeaderboardParams(
  category: VolunteerCategory | '',
  faculty: Faculty | ''
): { category?: VolunteerCategory; faculty?: Faculty; limit: number } {
  return {
    limit: 5,
    ...(category ? { category } : {}),
    ...(faculty ? { faculty } : {}),
  };
}

function buildFacultyParams(faculty: Faculty | ''): { faculty?: Faculty } {
  return faculty ? { faculty } : {};
}

async function fetchStatsBundle(
  category: VolunteerCategory | '',
  faculty: Faculty | ''
): Promise<DashboardStatsBundle> {
  const facultyParams = buildFacultyParams(faculty);
  const [overviewRes, facultiesRes, leaderboardRes] = await Promise.all([
    apiClient.get<OverviewStats>('/stats/overview', { params: facultyParams }),
    apiClient.get<FacultyStatsResponse>('/stats/faculties', { params: facultyParams }),
    apiClient.get<LeaderboardResponse>('/stats/leaderboard', {
      params: buildLeaderboardParams(category, faculty),
    }),
  ]);

  const [participationResult, eventsResult, monthlyResult, categoriesResult] =
    await Promise.allSettled([
      apiClient.get<ParticipationStatsResponse>('/stats/participation', {
        params: facultyParams,
      }),
      apiClient.get<EventStatsResponse>('/stats/events', { params: facultyParams }),
      apiClient.get<MonthlyHoursResponse>('/stats/monthly-hours', { params: facultyParams }),
      apiClient.get<CategoryStatsResponse>('/stats/categories', { params: facultyParams }),
    ]);

  const rejectedResult = [participationResult, eventsResult, monthlyResult, categoriesResult].find(
    (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
  );

  return {
    overview: overviewRes.data,
    faculties: facultiesRes.data.faculties,
    categories:
      categoriesResult.status === 'fulfilled' ? categoriesResult.value.data.categories : [],
    leaderboard: leaderboardRes.data.leaderboard,
    certificateHours: leaderboardRes.data.certificateHours ?? overviewRes.data.certificateHours,
    participation:
      participationResult.status === 'fulfilled' ? participationResult.value.data : null,
    events: eventsResult.status === 'fulfilled' ? eventsResult.value.data : null,
    monthlyHours: monthlyResult.status === 'fulfilled' ? monthlyResult.value.data.months : [],
    analyticsError: rejectedResult ? extractApiErrorMessage(rejectedResult.reason) : '',
  };
}

/**
 * Manages fetching, refreshing, faculty filtering, and category-tab filtering for dashboard statistics.
 */
export function useDashboardStats() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [faculties, setFaculties] = useState<FacultyStatsRow[]>([]);
  const [categories, setCategories] = useState<CategoryStatsRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardVolunteer[]>([]);
  const [certificateHours, setCertificateHours] = useState(30);
  const [participation, setParticipation] = useState<ParticipationStatsResponse | null>(null);
  const [events, setEvents] = useState<EventStatsResponse | null>(null);
  const [monthlyHours, setMonthlyHours] = useState<MonthlyHoursPoint[]>([]);
  const [analyticsError, setAnalyticsError] = useState('');

  const [activeCategory, setActiveCategory] = useState<VolunteerCategory | ''>('');
  const [activeFaculty, setActiveFaculty] = useState<Faculty | ''>('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  const dashboardReqRef = useRef(0);
  const leaderboardReqRef = useRef(0);
  const activeCategoryRef = useRef<VolunteerCategory | ''>('');
  const activeFacultyRef = useRef<Faculty | ''>('');

  const applyStatsBundle = useCallback((bundle: DashboardStatsBundle) => {
    setOverview(bundle.overview);
    setFaculties(bundle.faculties);
    setCategories(bundle.categories);
    setLeaderboard(bundle.leaderboard);
    setCertificateHours(bundle.certificateHours);
    setParticipation(bundle.participation);
    setEvents(bundle.events);
    setMonthlyHours(bundle.monthlyHours);
    setAnalyticsError(bundle.analyticsError);
  }, []);

  const loadDashboard = useCallback(
    async (category: VolunteerCategory | '', faculty: Faculty | '', keepExisting: boolean) => {
      const requestId = ++dashboardReqRef.current;
      setRefreshing(keepExisting);
      setInitialLoading(!keepExisting);
      setPageError('');
      setLeaderboardError('');

      try {
        const bundle = await fetchStatsBundle(category, faculty);
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
    },
    [applyStatsBundle]
  );

  useEffect(() => {
    const requestId = ++dashboardReqRef.current;

    fetchStatsBundle('', '')
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
    await loadDashboard(activeCategoryRef.current, activeFacultyRef.current, Boolean(overview));
  }, [loadDashboard, overview]);

  const selectFaculty = useCallback(
    async (faculty: Faculty | '') => {
      setActiveFaculty(faculty);
      activeFacultyRef.current = faculty;
      await loadDashboard(activeCategoryRef.current, faculty, Boolean(overview));
    },
    [loadDashboard, overview]
  );

  const selectCategory = useCallback(async (category: VolunteerCategory | '') => {
    setActiveCategory(category);
    activeCategoryRef.current = category;
    const requestId = ++leaderboardReqRef.current;
    setLeaderboardLoading(true);
    setLeaderboardError('');

    try {
      const response = await apiClient.get<LeaderboardResponse>('/stats/leaderboard', {
        params: buildLeaderboardParams(category, activeFacultyRef.current),
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
    categories,
    leaderboard,
    certificateHours,
    participation,
    events,
    monthlyHours,
    analyticsError,
    activeCategory,
    activeFaculty,
    initialLoading,
    refreshing,
    pageError,
    leaderboardLoading,
    leaderboardError,
    selectCategory,
    selectFaculty,
    refresh,
  };
}
