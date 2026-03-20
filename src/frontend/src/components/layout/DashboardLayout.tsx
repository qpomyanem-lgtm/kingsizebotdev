import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, FileText, LogOut, ChevronLeft, ChevronRight, UserX, Archive, BookOpen, ScrollText, ShieldAlert, Hash, ChevronDown, ClipboardList, Moon, List, Swords, Server, Map, Activity as ActivityIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api, useAuth } from '../../lib/api';
import { InterviewChatWidget } from '../InterviewChatWidget';

const navGroups = [
  {
    label: 'Рекруты',
    items: [
      { path: '/applications', label: 'Заявки', icon: FileText },
      { path: '/settings/applications', label: 'Конструктор анкеты', icon: ClipboardList },
      { path: '/activity', label: 'Активность', icon: ActivityIcon },
      { path: '/guide', label: 'Памятка', icon: BookOpen },
    ],
  },
  {
    label: 'Состав',
    items: [
      { path: '/members', label: 'Участники', icon: Users },
      { path: '/afk', label: 'Система АФК', icon: Moon },
    ],
  },
  {
    label: 'Списки',
    items: [
      { path: '/mcl', label: 'MCL ВЗЗ', icon: List },
      { path: '/captures', label: 'Капты', icon: Swords },
      { path: '/mcl-maps', label: 'Карты MCL ВЗЗ', icon: Map },
    ],
  },
  {
    label: 'Архивы',
    items: [
      { path: '/archive', label: 'Архив заявок', icon: Archive },
      { path: '/logs', label: 'Журнал действий', icon: ScrollText },
      { path: '/kicked', label: 'Исключенные', icon: UserX },
    ],
  },
  {
    label: 'Настройки',
    items: [
      { path: '/settings/server', label: 'Настройка сервера', icon: Server },
      { path: '/settings/roles', label: 'Настройка ролей', icon: ShieldAlert },
      { path: '/settings/channels', label: 'Настройка каналов', icon: Hash },
    ],
  },
];

export function DashboardLayout() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { data: user } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  useEffect(() => {
    // GSAP entrance animations removed to prevent conflicts with CSS transition-all
    // which caused the sidebar items to occasionally get stuck at opacity: 0
  }, []);

  const handleLogout = async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen bg-[#fafafa] overflow-hidden text-slate-900 font-sans selection:bg-slate-200">

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={cn(
          "bg-white border-r border-slate-100 flex flex-col justify-between z-20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] relative",
          isSidebarOpen ? "w-[240px]" : "w-[72px]"
        )}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3.5 top-8 bg-white border border-slate-100 text-slate-400 hover:text-slate-900 w-7 h-7 rounded-full flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] transition-all z-30"
        >
          {isSidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <div className="flex flex-col pt-5 pb-6">
          {/* Brand Logo */}
          <div className={cn("flex flex-row mb-2 transition-all duration-300", isSidebarOpen ? "px-6 items-center" : "px-0 justify-center")}>
            <div className="w-10 h-10 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-transparent">
              <img
                src="https://i.ibb.co/TBvBGV78/photo-2026-02-14-20-12-47.jpg"
                alt="Kingsize"
                className="w-full h-full object-cover"
              />
            </div>
            {isSidebarOpen && (
              <div className="opacity-100 transition-opacity duration-300 ml-3 flex flex-col justify-center">
                <h1 className="text-[14px] font-black tracking-[0.2em] text-slate-900 uppercase leading-none transform translate-y-[1px]">
                  Kingsize
                </h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-[2px] font-medium leading-none">
                  Family Panel
                </p>
              </div>
            )}
          </div>
        </div>

        <nav className={cn("flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 pb-2", isSidebarOpen ? "px-3" : "px-2 items-center")}>
          {navGroups.map((group, groupIdx) => {
            const isCollapsed = collapsedGroups.includes(group.label);
            return (
              <div key={groupIdx} className="flex flex-col gap-1.5">
                {isSidebarOpen && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center justify-between w-full px-4 mb-2 group/toggle"
                  >
                    <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase transition-colors group-hover/toggle:text-slate-700">
                      {group.label}
                    </h3>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-slate-300 transition-transform duration-300 group-hover/toggle:text-slate-600", isCollapsed && "-rotate-90")} />
                  </button>
                )}
                <div className={cn("flex flex-col overflow-hidden transition-all duration-300 ease-in-out", isCollapsed && isSidebarOpen ? "max-h-0 opacity-0 pointer-events-none gap-0" : "max-h-[500px] opacity-100 gap-1")}>
                  {group.items.filter((item) => (item.path !== '/settings/roles' && item.path !== '/settings/server') || user?.roleSettingsAccess).map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        title={!isSidebarOpen ? item.label : undefined}
                        className={cn(
                          "nav-item flex items-center transition-all duration-300 group relative",
                          isSidebarOpen ? "px-4 py-2.5 gap-3.5 w-[calc(100%-16px)] mx-2 rounded-xl" : "p-3 w-10 h-10 mx-auto justify-center rounded-xl",
                          isActive
                            ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-[0_4px_12px_rgba(15,23,42,0.15)] ring-1 ring-slate-900/10"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 flex-shrink-0 transition-all duration-300", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-700")} strokeWidth={isActive ? 2.5 : 2} />
                        {isSidebarOpen && (
                          <span className={cn("font-medium text-[13px] tracking-wide transition-colors", isActive ? "text-white font-semibold" : "")}>
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className={cn("p-4 mb-2 mt-auto", !isSidebarOpen && "flex flex-col items-center")}>
          <div className={cn("group/profile rounded-[20px] p-3 transition-all duration-300 cursor-pointer", isSidebarOpen ? "bg-slate-50/50 hover:bg-slate-50 border border-slate-100/50 hover:border-slate-200" : "bg-transparent border-transparent p-0")}>
            <div className={cn("flex items-center gap-3 transition-transform duration-300 group-hover/profile:translate-x-1", !isSidebarOpen && "justify-center p-0 mb-4 group-hover/profile:translate-x-0")}>
              <img
                src={user?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}
                alt="Avatar"
                className={cn("rounded-full object-cover bg-white shadow-sm ring-2 ring-white", isSidebarOpen ? "w-[38px] h-[38px]" : "w-8 h-8")}
              />
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 truncate leading-tight">{user?.username || 'Staff'}</p>
                  <p className="text-[10px] font-semibold text-slate-400 truncate uppercase tracking-wider mt-0.5 leading-tight">
                    {user?.roleLabel ?? '—'}
                  </p>
                </div>
              )}
            </div>
            {isSidebarOpen ? (
              <button
                onClick={handleLogout}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50/80 py-2.5 transition-all duration-300"
              >
                <LogOut className="w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110" />
                Выйти
              </button>
            ) : (
              <button
                onClick={handleLogout}
                title="Выйти"
                className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 transition-all duration-300 hover:shadow-sm"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        ref={contentRef}
        className="flex-1 overflow-y-auto p-8 lg:p-12 relative z-10"
      >
        <div className="max-w-[1200px] mx-auto h-full">
          <Outlet />
        </div>
      </main>
      
      <InterviewChatWidget />
    </div>
  );
}
