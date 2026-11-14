import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/**
 * Returns the current admin authentication context.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
