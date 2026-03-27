import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  toggleTheme: () => void;
  currentTheme: Record<string, string>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark'); 

  useEffect(() => {
    const root = window.document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const currentTheme = {
    background: 'var(--background)',
    textPrimary: 'var(--foreground)',
    textSecondary: 'var(--muted-foreground)',
    textTertiary: 'var(--muted-foreground)', 
    iconHeaderBg: 'var(--muted)',
    border: 'var(--border)',
    cardBackground: 'var(--card)',
    primary: 'var(--primary)',
    primaryText: 'var(--primary-foreground)',
    primaryHover: 'var(--chart-1)', 
  };

  return (
    <ThemeContext.Provider value={{ themeMode, toggleTheme, currentTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
