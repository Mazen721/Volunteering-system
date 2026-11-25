import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import type { VolunteeringReport } from '../types';

async function fetchReport(): Promise<VolunteeringReport> {
  const response = await apiClient.get<VolunteeringReport>('/stats/report');
  return response.data;
}

/**
 * Loads the complete server-scoped volunteering report used by the printable
 * PDF view. The server decides the scope from the authenticated role: admins
 * receive the whole university and deans receive only their own faculty.
 */
export function useVolunteeringReport() {
  const [report, setReport] = useState<VolunteeringReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;

    fetchReport()
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
  }, []);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchReport();
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
  }, []);

  return { report, loading, error, reload };
}
