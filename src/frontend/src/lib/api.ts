import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

export const api = axios.create({
  baseURL: import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// Intercept 401 responses: clear auth cache and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Don't redirect if already on login page or it's the /api/auth/me call handled by useAuth
      const url = error.config?.url ?? '';
      if (!url.includes('/api/auth/') && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const useAuth = () => {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/api/auth/me');
        return data.user;
      } catch (err) {
        // Only treat 401 as "logged out". Any other error shouldn't kick user to login.
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: false,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
};
