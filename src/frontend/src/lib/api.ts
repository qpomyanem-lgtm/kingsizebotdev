import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

export const api = axios.create({
  baseURL: import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL,
  withCredentials: true,
});

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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: 30_000,
  });
};
