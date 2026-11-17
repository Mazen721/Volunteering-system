import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type { Volunteer, VolunteerFilters, VolunteerListResponse } from '../types';

const INITIAL_FILTERS: VolunteerFilters = {
  search: '',
  category: '',
  faculty: '',
  eligibility: '',
  activityStatus: '',
};

function buildQueryParams(
  filters: VolunteerFilters,
  page: number
): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit: 10 };
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed) {
      params[key] = trimmed;
    }
  }
  return params;
}

interface VolunteersPageResult {
  volunteers: Volunteer[];
  total: number;
  pages: number;
}

async function fetchVolunteersPage(
  filters: VolunteerFilters,
  page: number
): Promise<VolunteersPageResult> {
  const response = await apiClient.get<VolunteerListResponse>('/volunteers', {
    params: buildQueryParams(filters, page),
  });
  return {
    volunteers: response.data.volunteers,
    total: response.data.total,
    pages: response.data.pages,
  };
}

/**
 * Manages volunteers list state, independent filters (search, category, faculty, eligibility, activityStatus),
 * and server-backed pagination.
 */
export function useVolunteersList() {
  const [filters, setFilters] = useState<VolunteerFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchVolunteersPage(filters, page)
      .then((result) => {
        if (requestId !== requestRef.current) return;
        setVolunteers(result.volunteers);
        setMeta({ total: result.total, pages: result.pages });
        setError('');
      })
      .catch((err: unknown) => {
        if (requestId === requestRef.current) {
          setError(extractApiErrorMessage(err));
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      });
  }, [filters, page]);

  const updateFilter = useCallback(
    <K extends keyof VolunteerFilters>(field: K, value: VolunteerFilters[K]) => {
      setLoading(true);
      setError('');
      setPage(1);
      setFilters((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const changePage = useCallback((nextPage: number) => {
    setLoading(true);
    setError('');
    setPage(nextPage);
  }, []);

  const resetFilters = useCallback(() => {
    setLoading(true);
    setError('');
    setPage(1);
    setFilters(INITIAL_FILTERS);
  }, []);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');

    try {
      const result = await fetchVolunteersPage(filters, page);
      if (requestId !== requestRef.current) return;
      setVolunteers(result.volunteers);
      setMeta({ total: result.total, pages: result.pages });
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(extractApiErrorMessage(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [filters, page]);

  const hasActiveFilters = Object.values(filters).some((value) => Boolean(value.trim()));

  return {
    filters,
    page,
    setPage: changePage,
    volunteers,
    total: meta.total,
    pages: meta.pages,
    loading,
    error,
    hasActiveFilters,
    updateFilter,
    resetFilters,
    reload,
  };
}
