import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type { VolunteeringReport } from '../types';

export interface VolunteeringReportParams {
  faculty?: string;
  from?: string;
  to?: string;
}

function buildReportUrl(params: VolunteeringReportParams): string {
  const query = new URLSearchParams();
  if (params.faculty) {
    query.set('faculty', params.faculty);
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  const serialized = query.toString();
  return serialized ? `/stats/report?${serialized}` : '/stats/report';
}

async function fetchReport(url: string): Promise<VolunteeringReport> {
  const response = await apiClient.get<VolunteeringReport>(url);
  return response.data;
}

/**
 * Loads the complete server-scoped volunteering report used by the printable
 * PDF view. The server decides the scope from the authenticated role: admins
 * receive the whole university (or the single faculty they picked) and deans
 * receive only their own faculty. Optional from/to params limit the report
 * to opportunities starting inside that period.
 */
export function useVolunteeringReport(params: VolunteeringReportParams = {}) {
  const url = buildReportUrl(params);
  const [report, setReport] = useState<VolunteeringReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchReport(url)
      .then((data) => {
        if (requestId === requestRef.current) {
          setReport(data);
        }
      })
      .catch((loadError: unknown) => {
        if (requestId === requestRef.current) {
          setError(extractApiErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      });
  }, [url]);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchReport(url);
      if (requestId === requestRef.current) {
        setReport(data);
      }
    } catch (loadError) {
      if (requestId === requestRef.current) {
        setError(extractApiErrorMessage(loadError));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [url]);

  return { report, loading, error, reload };
}
