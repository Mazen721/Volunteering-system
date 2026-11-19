import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isAxiosError } from 'axios';
import {
  apiClient,
  clearStoredToken,
  extractApiErrorMessage,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from '../api/client';
import type {
  Admin,
  AuthStatus,
  AuthUser,
  DemoAccount,
  LoginCredentials,
  RegisterPayload,
  UpdateProfilePayload,
} from '../types';
import { AuthContext } from './authContext';

interface AuthPayload {
  user?: AuthUser;
  admin?: Admin;
}

interface LoginPayload extends AuthPayload {
  token: string;
}

interface ProfilePayload {
  user: AuthUser;
}

interface SessionResult {
  status: AuthStatus;
  user: AuthUser | null;
  error: string;
}

interface AuthProviderProps {
  children: ReactNode;
}

function normalizeAuthUser(payload: AuthPayload): AuthUser | null {
  if (payload.user) {
    return payload.user;
  }
  if (payload.admin) {
    return {
      id: payload.admin.id,
      email: payload.admin.email,
      fullName: payload.admin.email,
      role: 'admin',
      status: 'active',
      faculty: null,
      volunteer: null,
      interests: [],
      registration: null,
      rejectionReason: null,
      lastLoginAt: null,
    };
  }
  return null;
}

async function resolveSessionState(): Promise<SessionResult> {
  try {
    const response = await apiClient.get<AuthPayload>('/auth/me');
    const user = normalizeAuthUser(response.data);
    if (!user) {
      clearStoredToken();
      return { status: 'unauthenticated', user: null, error: '' };
    }
    return { status: 'authenticated', user, error: '' };
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      clearStoredToken();
      return { status: 'unauthenticated', user: null, error: '' };
    }
    return { status: 'network_error', user: null, error: extractApiErrorMessage(error) };
  }
}

/**
 * Provides authenticated user state, session restoration, login, and logout actions.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    getStoredToken() ? 'checking' : 'unauthenticated'
  );
  const [sessionError, setSessionError] = useState('');

  const applySessionResult = useCallback((result: SessionResult) => {
    setUser(result.user);
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
      applySessionResult({ status: 'unauthenticated', user: null, error: '' });
    });
  }, [applySessionResult]);

  const retrySession = useCallback(async () => {
    if (!getStoredToken()) {
      applySessionResult({ status: 'unauthenticated', user: null, error: '' });
      return;
    }
    setStatus('checking');
    setSessionError('');
    const result = await resolveSessionState();
    applySessionResult(result);
  }, [applySessionResult]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const response = await apiClient.post<LoginPayload>('/auth/login', credentials);
      const authenticatedUser = normalizeAuthUser(response.data);
      if (!authenticatedUser) {
        throw new Error('Missing authenticated user payload');
      }
      setStoredToken(response.data.token);
      applySessionResult({ status: 'authenticated', user: authenticatedUser, error: '' });
      return authenticatedUser;
    },
    [applySessionResult]
  );

  const loginDemo = useCallback(
    async (account: DemoAccount) => {
      const response = await apiClient.post<LoginPayload>('/auth/demo-login', { account });
      const authenticatedUser = normalizeAuthUser(response.data);
      if (!authenticatedUser) {
        throw new Error('Missing authenticated user payload');
      }
      setStoredToken(response.data.token);
      applySessionResult({ status: 'authenticated', user: authenticatedUser, error: '' });
      return authenticatedUser;
    },
    [applySessionResult]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const response = await apiClient.post<LoginPayload>('/auth/register', payload);
      const registeredUser = normalizeAuthUser(response.data);
      if (!registeredUser) {
        throw new Error('Missing registered user payload');
      }
      setStoredToken(response.data.token);
      applySessionResult({ status: 'authenticated', user: registeredUser, error: '' });
      return registeredUser;
    },
    [applySessionResult]
  );

  const logout = useCallback(() => {
    clearStoredToken();
    applySessionResult({ status: 'unauthenticated', user: null, error: '' });
  }, [applySessionResult]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload) => {
      const response = await apiClient.patch<ProfilePayload>('/auth/me', payload);
      setUser(response.data.user);
      return response.data.user;
    },
    []
  );

  const value = useMemo(() => {
    const admin = user?.role === 'admin' ? { id: user.id, email: user.email } : null;
    return {
      user,
      admin,
      status,
      sessionError,
      login,
      loginDemo,
      register,
      updateProfile,
      logout,
      retrySession,
    };
  }, [user, status, sessionError, login, loginDemo, register, updateProfile, logout, retrySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
