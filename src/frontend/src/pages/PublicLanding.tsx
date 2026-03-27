import { useEffect, useState } from 'react';
import { Globe, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function PublicLanding() {
  const [mounted, setMounted] = useState(false);
  const { themeMode, toggleTheme, currentTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

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
              <Globe 
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
                Сайт в разработке
              </h1>
              <p 
                className="text-sm sm:text-base max-w-[280px] mx-auto leading-relaxed transition-colors duration-300"
                style={{ color: currentTheme.textSecondary }}
              >
                Страница временно недоступна. Пожалуйста, возвращайтесь позже.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
