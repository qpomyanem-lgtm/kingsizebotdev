import React, { useEffect, useState } from 'react';
import { ShieldCheck, Moon, Sun } from 'lucide-react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, api } from '../lib/api';
import { useTheme } from '../context/ThemeContext';

// Custom Discord Icon
export function DiscordIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export function Login() {
  const [mounted, setMounted] = useState(false);
  const { themeMode, toggleTheme, currentTheme } = useTheme();

  const [searchParams] = useSearchParams();
  const noAccess = searchParams.get('error') === 'NoPanelAccess';
  const sessionExpired = searchParams.get('error') === 'SessionExpired';

  const { data: user, isLoading } = useAuth();
  const { data: adminRoles } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['adminRolesForLogin'],
    queryFn: async () => (await api.get('/api/settings/admin-roles')).data,
    retry: 1,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isLoading && user && user.permissions && user.permissions.length > 0) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    window.location.href = `/api/auth/discord?origin=${encodeURIComponent(window.location.origin)}`;
  };

  const requiredRolesText = (adminRoles && adminRoles.length > 0)
    ? adminRoles.map((r: { name: string }) => r.name).join(', ')
    : 'админская роль доступа';

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 font-sans antialiased transition-colors duration-300 relative w-full"
      style={{
        backgroundColor: currentTheme.background,
        color: currentTheme.textPrimary
      }}
    >
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2 rounded-full transition-colors duration-200 z-10"
        style={{
          color: currentTheme.textSecondary,
          backgroundColor: currentTheme.iconHeaderBg,
          border: `1px solid ${currentTheme.border}`
        }}
        aria-label="Toggle theme"
      >
        {themeMode === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>

      <div 
        className={`relative z-10 w-full max-w-[420px] transition-all duration-700 ease-out transform ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Card Component from Design System */}
        <div 
          className="rounded-xl overflow-hidden relative transition-colors duration-300"
          style={{
            backgroundColor: currentTheme.cardBackground,
            border: `1px solid ${currentTheme.border}`,
            boxShadow: themeMode === 'light' 
              ? '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -2px rgba(0, 0, 0, 0.1)' 
              : '0px 4px 6px -1px rgba(0, 0, 0, 0.5), 0px 2px 4px -2px rgba(0, 0, 0, 0.5)'
          }}
        >
          
          {/* Top accent line using primary brand color from token */}
          <div 
            className="absolute top-0 left-0 right-0 h-1 transition-colors duration-300" 
            style={{ backgroundColor: currentTheme.primary }}
          />

          <div className="flex flex-col items-center text-center p-8 sm:p-10 space-y-8">
            
            {/* Icon Header */}
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center border transition-colors duration-300"
              style={{
                backgroundColor: currentTheme.iconHeaderBg,
                borderColor: currentTheme.border,
              }}
            >
              <ShieldCheck 
                className="w-8 h-8 transition-colors duration-300" 
                strokeWidth={1.5} 
                style={{ color: currentTheme.textPrimary }}
              />
            </div>

            {/* Titles */}
            <div className="space-y-3">
              <h1 
                className="text-2xl sm:text-3xl font-semibold tracking-tight transition-colors duration-300"
                style={{ color: currentTheme.textPrimary }}
              >
                Панель управления
              </h1>
              <p 
                className="text-sm sm:text-base max-w-[280px] mx-auto leading-relaxed transition-colors duration-300"
                style={{ color: currentTheme.textSecondary }}
              >
                Авторизуйтесь через ваш рабочий Discord аккаунт для доступа к системе
              </p>
            </div>

            {/* Alerts - Match Discord/Original design system */}
            {(noAccess || sessionExpired) && (
              <div className="w-full text-center space-y-2">
                 {noAccess && (
                  <div className="py-2 px-3 rounded bg-red-500/10 border border-red-500/50 text-red-500 text-xs font-medium text-center">
                    Нет доступа к панели. Нужна роль: {requiredRolesText}.
                  </div>
                )}
                {sessionExpired && (
                  <div className="py-2 px-3 rounded bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 text-xs font-medium text-center">
                    Сессия истекла. Авторизуйтесь заново.
                  </div>
                )}
              </div>
            )}

            {/* Primary Button Component from Design System */}
            <div className="w-full pt-2">
              <button 
                onClick={handleLogin}
                className="group relative w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-md transition-all duration-200 font-medium active:scale-[0.98]"
                style={{
                  backgroundColor: currentTheme.primary,
                  color: currentTheme.primaryText,
                  border: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.primaryHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.primary;
                }}
              >
                <DiscordIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className="text-[15px]">Войти через Discord</span>
              </button>
            </div>

          </div>
        </div>

        {/* Footer Text */}
        <div className="mt-8 text-center transition-colors duration-300">
          <p 
            className="text-xs font-medium tracking-wide uppercase"
            style={{ color: currentTheme.textTertiary }}
          >
            Доступ только для персонала
          </p>
        </div>
      </div>
    </div>
  );
}
