import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './pages/Login';
import { Applications } from './pages/Applications';
import { Members } from './pages/Members';
import { Afk } from './pages/Afk';
import { Mcl } from './pages/Mcl';
import { MclMaps } from './pages/MclMaps';
import { Captures } from './pages/Captures';
import { Kicked } from './pages/Kicked';
import { Archive } from './pages/Archive';
import { Guide } from './pages/Guide';
import { Logs } from './pages/Logs';
import { RoleSettings } from './pages/RoleSettings';
import { ServerSettings } from './pages/ServerSettings';
import { ChannelSettings } from './pages/ChannelSettings';
import { ApplicationSettings } from './pages/ApplicationSettings';
import { PublicLanding } from './pages/PublicLanding';
import { Activity } from './pages/Activity';
import { AccessSettings } from './pages/AccessSettings';
import { useAuth } from './lib/api';

import type { ReactNode } from 'react';

const queryClient = new QueryClient();

const DEFAULT_ROUTE_BY_PERMISSION: Array<{ permission: string; path: string }> = [
  { permission: 'site:applications:view', path: '/applications' },
  { permission: 'site:activity:view', path: '/activity' },
  { permission: 'site:members:view', path: '/members' },
  { permission: 'site:afk:view', path: '/afk' },
  { permission: 'site:mcl:view', path: '/mcl' },
  { permission: 'site:captures:view', path: '/captures' },
  { permission: 'site:mcl_maps:view', path: '/mcl-maps' },
  { permission: 'site:archive:view', path: '/archive' },
  { permission: 'site:kicked:view', path: '/kicked' },
  { permission: 'site:logs:view', path: '/logs' },
  { permission: 'site:guide:view', path: '/guide' },
  { permission: 'site:application_settings:view', path: '/settings/applications' },
  { permission: 'site:settings_server:view', path: '/settings/server' },
  { permission: 'site:settings_roles:view', path: '/settings/roles' },
  { permission: 'site:settings_channels:view', path: '/settings/channels' },
  { permission: 'site:settings_access:view', path: '/settings/access' },
];

function DefaultDashboardRoute() {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  const permissions = user?.permissions ?? [];
  const firstAllowed = DEFAULT_ROUTE_BY_PERMISSION.find((item) => permissions.includes(item.permission));

  if (!firstAllowed) {
    return <Navigate to="/login?error=NoPanelAccess" replace />;
  }

  return <Navigate to={firstAllowed.path} replace />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }
  
  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  // Avoid kicking to login on transient errors (network/5xx).
  if (isError && user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-slate-500">
        Не удалось проверить сессию. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Access is granted if the user has any permissions (meaning they have at least one access role).
  const hasPanelAccess = user.permissions && user.permissions.length > 0;
  if (!hasPanelAccess) {
    return <Navigate to="/login?error=NoPanelAccess" replace />;
  }

  return children;
}

export default function App() {
  const isAdminHost = typeof window !== 'undefined' && window.location.hostname.startsWith('admin.');

  // Public host: only show the public landing page for ALL routes
  if (!isAdminHost) {
    return (
      <QueryClientProvider client={queryClient}>
        <Router>
          <Routes>
            <Route path="*" element={<PublicLanding />} />
          </Routes>
        </Router>
      </QueryClientProvider>
    );
  }

  // Admin host: full admin panel with login
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }>
            <Route index element={<DefaultDashboardRoute />} />
            <Route path="applications" element={<Applications />} />
            <Route path="members" element={<Members />} />
            <Route path="afk" element={<Afk />} />
            <Route path="mcl" element={<Mcl />} />
            <Route path="mcl-maps" element={<MclMaps />} />
            <Route path="captures" element={<Captures />} />
            <Route path="activity" element={<Activity />} />
            <Route path="kicked" element={<Kicked />} />
            <Route path="archive" element={<Archive />} />
            <Route path="guide" element={<Guide />} />
            <Route path="logs" element={<Logs />} />
            <Route path="settings/roles" element={<RoleSettings />} />
            <Route path="settings/server" element={<ServerSettings />} />
            <Route path="settings/channels" element={<ChannelSettings />} />
            <Route path="settings/applications" element={<ApplicationSettings />} />
            <Route path="settings/access" element={<AccessSettings />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
