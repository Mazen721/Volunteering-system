import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '../api/client.js';

const INITIAL_STATE = {
  loadedId: null,
  profile: null,
  loading: true,
  error: '',
};

/**
 * Fetches a volunteer's profile and activities by ID while guarding against stale responses.
 * @param {string | undefined} volunteerId
 */
export function useVolunteerProfile(volunteerId) {
  const [state, setState] = useState(INITIAL_STATE);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!volunteerId) {
      return;
    }

    const requestId = ++requestRef.current;

    apiClient
      .get(`/volunteers/${encodeURIComponent(volunteerId)}`)
      .then((response) => {
        if (requestId === requestRef.current) {
          setState({
            loadedId: volunteerId,
            profile: response.data,
            loading: false,
            error: '',
          });
        }
      })
      .catch((err) => {
        if (requestId === requestRef.current) {
          setState({
            loadedId: volunteerId,
            profile: null,
            loading: false,
            error: extractApiErrorMessage(err),
          });
        }
      });
  }, [volunteerId]);

  const reload = useCallback(async () => {
    if (!volunteerId) {
      return;
    }

    const requestId = ++requestRef.current;
    setState((prev) => ({
      loadedId: volunteerId,
      profile: prev.loadedId === volunteerId ? prev.profile : null,
      loading: true,
      error: '',
    }));

    try {
      const response = await apiClient.get(`/volunteers/${encodeURIComponent(volunteerId)}`);
      if (requestId === requestRef.current) {
        setState({
          loadedId: volunteerId,
          profile: response.data,
          loading: false,
          error: '',
        });
      }
    } catch (err) {
      if (requestId === requestRef.current) {
        setState((prev) => ({
          loadedId: volunteerId,
          profile: prev.loadedId === volunteerId ? prev.profile : null,
          loading: false,
          error: extractApiErrorMessage(err),
        }));
      }
    }
  }, [volunteerId]);

  const isCurrentVolunteer = state.loadedId === volunteerId;

  return {
    profile: isCurrentVolunteer ? state.profile : null,
    loading: isCurrentVolunteer ? state.loading : Boolean(volunteerId),
    error: isCurrentVolunteer ? state.error : '',
    reload,
  };
}
