import { createContext, useContext } from 'react';
import type { AuthContextValue, AuthUser } from '../types';

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Resolves the default landing route for a logged-in user based on status and role.
 */
export function getHomePathForUser(user: AuthUser): string {
  if (user.status === 'pending' || user.status === 'rejected') {
    return '/pending';
  }
  return user.role === 'student' ? '/me' : '/';
}

/**
 * Returns the current authentication context.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
