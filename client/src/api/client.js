import axios from 'axios';
import { AR } from '../constants/ar.js';

const TOKEN_STORAGE_KEY = 'mnu_admin_token';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let unauthorizedHandler = null;

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

/**
 * Extracts a user-facing Arabic error message from an Axios failure.
 * @param {unknown} error
 * @returns {string}
 */
export function extractApiErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.message;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      return serverMessage;
    }
    if (!error.response) {
      return AR.errors.networkUnavailable;
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
  (error) => {
    const requestUrl = error.config?.url || '';
    const isLoginRequest = requestUrl.endsWith('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      clearStoredToken();
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    return Promise.reject(error);
  }
);
