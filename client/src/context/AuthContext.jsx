import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  clearStoredToken,
  extractApiErrorMessage,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from '../api/client.js';
import { AuthContext } from './authContext.js';

async function resolveSessionState() {
  try {
    const response = await apiClient.get('/auth/me');
    return { status: 'authenticated', admin: response.data.admin, error: '' };
  } catch (error) {
    if (error.response?.status === 401) {
      clearStoredToken();
      return { status: 'unauthenticated', admin: null, error: '' };
    }
    return { status: 'network_error', admin: null, error: extractApiErrorMessage(error) };
  }
}

/**
 * Provides admin authentication state, session restoration, login, and logout actions.
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState(() => (getStoredToken() ? 'checking' : 'unauthenticated'));
  const [sessionError, setSessionError] = useState('');

  const applySessionResult = useCallback((result) => {
    setAdmin(result.admin);
    setSessionError(result.error);
    setStatus(result.status);
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      return undefined;
    }

    let cancelled = false;
    resolveSessionState().then((result) => {
      if (!cancelled) {
        applySessionResult(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applySessionResult]);

  useEffect(() => {
    return setUnauthorizedHandler(() => {
      applySessionResult({ status: 'unauthenticated', admin: null, error: '' });
    });
  }, [applySessionResult]);

  const retrySession = useCallback(async () => {
    if (!getStoredToken()) {
      applySessionResult({ status: 'unauthenticated', admin: null, error: '' });
      return;
    }
    setStatus('checking');
    setSessionError('');
    const result = await resolveSessionState();
    applySessionResult(result);
  }, [applySessionResult]);

  const login = useCallback(
    async (credentials) => {
      const response = await apiClient.post('/auth/login', credentials);
      setStoredToken(response.data.token);
      applySessionResult({ status: 'authenticated', admin: response.data.admin, error: '' });
      return response.data.admin;
    },
    [applySessionResult]
  );

  const logout = useCallback(() => {
    clearStoredToken();
    applySessionResult({ status: 'unauthenticated', admin: null, error: '' });
  }, [applySessionResult]);

  const value = useMemo(
    () => ({
      admin,
      status,
      sessionError,
      login,
      logout,
      retrySession,
    }),
    [admin, status, sessionError, login, logout, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
