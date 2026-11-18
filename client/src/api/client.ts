import axios from 'axios';
import { AR } from '../constants/ar';

const TOKEN_STORAGE_KEY = 'mnu_admin_token';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let unauthorizedHandler: (() => void) | null = null;

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function setUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

/**
 * Extracts a user-facing Arabic error message from an Axios failure.
 */
export function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseData: unknown = error.response?.data;
    if (typeof responseData === 'object' && responseData !== null && 'message' in responseData) {
      const serverMessage = (responseData as { message?: unknown }).message;
      if (typeof serverMessage === 'string' && serverMessage.trim()) {
        return serverMessage;
      }
    }
    if (!error.response) {
      return AR.errors.networkUnavailable;
    }
    if (error.response.status === 429) {
      return AR.errors.rateLimited;
    }
  }
  return AR.errors.unexpected;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const requestUrl = error.config?.url || '';
      const isLoginRequest = requestUrl.endsWith('/auth/login');
      if (error.response?.status === 401 && !isLoginRequest) {
        clearStoredToken();
        if (unauthorizedHandler) {
          unauthorizedHandler();
        }
      }
    }
    return Promise.reject(error);
  }
);
