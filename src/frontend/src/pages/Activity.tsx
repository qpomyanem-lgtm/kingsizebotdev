import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Eye, Link as LinkIcon, Loader2, Users, Image as ImageIcon, Search, Check, X, Square } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { formatMoscowDate } from '../lib/time';

type ActivityOverviewRow = {
  memberId: string;
  discordAvatarUrl: string | null;
  discordUsername: string;
  discordId: string;

  nickStatic: string;
  gameNickname: string;
  gameStaticId: string;

  joinedAt: string;
  screenshotsCount: number;
  approvedCount: number;
  pendingCount: number;
  screenshotsMax: number;
  forumUrl: string | null;

  threadStatus: 'active' | 'completed';
  acceptedByDiscordId: string | null;
  threadCreatedAt: string;
  elapsedDays: number;
  daysLimit: number;
};

type ScreenshotRow = {
  id: string;
  imageUrl: string;
  createdAt: string;
  sourceType: 'dm' | 'forum';
  sourceDiscordMessageId: string;
  screenshotStatus: 'pending' | 'approved' | 'rejected';
  reviewedByDiscordId: string | null;
};

function formatFamilyDuration(joinedAt: string) {
  const joinedMs = new Date(joinedAt).getTime();
  const diffMs = Date.now() - joinedMs;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days} дн`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours} ч`;

  const mins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  return `${mins} мин`;
}

export function Activity() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'completed'>('active');

  const { data: rows, isLoading } = useQuery<ActivityOverviewRow[]>({
    queryKey: ['activity_overview', statusFilter],
    queryFn: async () => {
      const { data } = await api.get(`/api/activity/overview?status=${statusFilter}`);
      return data;
    },
  });

  // Modal state
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [isShotsLoading, setIsShotsLoading] = useState(false);

  const openScreenshots = async (memberId: string) => {
    setActiveMemberId(memberId);
    setIsShotsLoading(true);
    setScreenshots([]);
    try {
      const { data } = await api.get(`/api/activity/${memberId}/screenshots`);
      setScreenshots(data);
    } finally {
      setIsShotsLoading(false);
    }
  };

  const closeModal = () => {
    setActiveMemberId(null);
    setScreenshots([]);
    setIsShotsLoading(false);
  };

  const reviewScreenshot = async (memberId: string, screenshotId: string, status: 'approved' | 'rejected') => {
    try {
      await api.post(`/api/activity/${memberId}/screenshots/${screenshotId}/review`, { status });
      setScreenshots((prev) => prev.map((s) => s.id === screenshotId ? { ...s, screenshotStatus: status } : s));
      queryClient.invalidateQueries({ queryKey: ['activity-overview'] });
    } catch (e) {
      console.error('Review failed', e);
    }
  };

  const closeActivity = async (memberId: string) => {
    if (!confirm('Завершить активность? Ветка будет закрыта.')) return;
    try {
      await api.post(`/api/activity/${memberId}/close`);
      queryClient.invalidateQueries({ queryKey: ['activity-overview'] });
    } catch (e) {
      console.error('Close failed', e);
    }
  };

  // Live refresh (WS)
  useEffect(() => {
    const HOST_URL = typeof window !== 'undefined' ? window.location.origin.replace('admin.', '') : 'http://localhost:3000';
    const newSocket: Socket = io(import.meta.env.VITE_API_URL || HOST_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    newSocket.on('activity_refresh', () => {
      queryClient.invalidateQueries({ queryKey: ['activity_overview'] });
      // Also refresh screenshots if modal is open
      if (activeMemberId) {
        api.get(`/api/activity/${activeMemberId}/screenshots`).then(({ data }) => setScreenshots(data)).catch(() => null);
      }
    });

    return () => {
      newSocket.close();
    };
  }, [queryClient]);

  const overlayRef = useRef<HTMLDivElement>(null);

  const activeRow = useMemo(() => {
    if (!activeMemberId || !rows) return null;
    return rows.find((r) => r.memberId === activeMemberId) ?? null;
  }, [activeMemberId, rows]);

  const filteredRows = useMemo(() => {
    const source = rows || [];
    const query = searchQuery.trim().toLowerCase();

    return source.filter((row) => {
      const matchesSearch =
        !query ||
        row.discordUsername.toLowerCase().includes(query) ||
        row.discordId.includes(query) ||
        row.gameNickname.toLowerCase().includes(query);

      return matchesSearch;
    });
  }, [rows, searchQuery]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
  const paginatedRows = filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="h-full flex flex-col font-sans relative">
      <header className="mb-6">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">АКТИВНОСТЬ</h1>
            <p className="text-slate-500 text-[13px] font-medium tracking-wide">
              Отслеживание активности новичков.
            </p>
          </div>
        </div>
        </div>
      </header>

      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Поиск по Discord нику, Discord ID, Nickname..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/60 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('active')}
              className={cn(
                'px-4 py-3 rounded-xl text-[13px] font-semibold border transition-all shadow-sm',
                statusFilter === 'active'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              Активные
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={cn(
                'px-4 py-3 rounded-xl text-[13px] font-semibold border transition-all shadow-sm',
                statusFilter === 'completed'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              Завершённые
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <ImageIcon className="w-12 h-12 mb-3 text-slate-200" />
            <p className="text-[14px] font-medium">{searchQuery ? 'Ничего не найдено' : 'Активность пока не зафиксирована'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[280px]">Пользователь</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">NICKNAME</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Скриншоты</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Дни</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Статус</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-[220px]">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRows.map((r) => (
                  <tr key={r.memberId} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={r.discordAvatarUrl || `https://ui-avatars.com/api/?name=${r.discordUsername}&background=random`}
                          alt={r.discordUsername}
                          className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
                        />
                        <div>
                          <p className="text-[13px] font-bold text-slate-900">{r.discordUsername}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{r.discordId}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-[13px] font-bold text-slate-900">{r.gameNickname}</p>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex px-3 py-1 rounded-full text-[12px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-mono">
                          {r.approvedCount}/{r.screenshotsMax}
                        </span>
                        {r.pendingCount > 0 && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            неподтв.: {r.pendingCount}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "inline-flex px-3 py-1 rounded-full text-[12px] font-semibold font-mono border",
                        r.elapsedDays >= r.daysLimit
                          ? "bg-red-50 text-red-700 border-red-200/70"
                          : "bg-slate-50 text-slate-700 border-slate-200/70"
                      )}>
                        {r.elapsedDays}/{r.daysLimit}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                        r.threadStatus === 'completed'
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
                          : "bg-blue-50 text-blue-700 border-blue-200/70"
                      )}>
                        {r.threadStatus === 'completed' ? 'Завершена' : 'Активна'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-2 text-[12px]">
                        <button
                          onClick={() => openScreenshots(r.memberId)}
                          className="w-8 h-8 flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                          title="Обзор всех скриншотов"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <a
                          href={r.forumUrl ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            'w-8 h-8 flex items-center justify-center rounded-lg transition-all shadow-sm border',
                            r.forumUrl
                              ? 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]'
                              : 'text-slate-400 bg-slate-50 border-slate-100 cursor-not-allowed pointer-events-none'
                          )}
                          title={r.forumUrl ? 'Ссылка на ветку форума' : 'Тред еще не создан'}
                        >
                          <LinkIcon className="w-4 h-4" />
                        </a>

                        {r.threadStatus === 'active' && (
                          <button
                            onClick={() => closeActivity(r.memberId)}
                            className="w-8 h-8 flex items-center justify-center text-red-500 bg-white border border-red-200 hover:bg-red-50 hover:text-red-700 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                            title="Завершить активность"
                          >
                            <Square className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 mt-auto">
                <span className="text-[12px] font-medium text-slate-500">
                  Страница {currentPage} из {totalPages}
                </span>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
                  >
                    Назад
                  </button>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
                  >
                    Вперед
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {activeMemberId &&
        createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 border border-slate-100/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-slate-100/80 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h2 className="text-[18px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" /> Скриншоты активности
                  </h2>
                  {activeRow ? (
                    <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                      {activeRow.discordUsername} · {activeRow.gameNickname} · в семье: {formatFamilyDuration(activeRow.joinedAt)}
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  X
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar">
                {isShotsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                  </div>
                ) : screenshots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <ImageIcon className="w-12 h-12 mb-3 text-slate-200" />
                    <p className="text-[14px] font-medium">Скриншотов нет</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {screenshots.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "bg-slate-50 border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow",
                          s.screenshotStatus === 'approved' ? 'border-emerald-200' :
                          s.screenshotStatus === 'rejected' ? 'border-red-200' :
                          'border-slate-100'
                        )}
                      >
                        <a href={s.imageUrl} target="_blank" rel="noreferrer">
                          <img src={s.imageUrl} alt="activity screenshot" className="w-full h-32 object-cover bg-white" />
                        </a>
                        <div className="p-3">
                          <p className="text-[11px] font-mono text-slate-500 truncate" title={s.sourceDiscordMessageId}>
                            {formatMoscowDate(s.createdAt, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                              s.screenshotStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              s.screenshotStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            )}>
                              {s.screenshotStatus === 'approved' ? 'Подтверждён' : s.screenshotStatus === 'rejected' ? 'Отклонён' : 'Ожидает'}
                            </span>
                            {s.screenshotStatus === 'pending' && activeMemberId && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => reviewScreenshot(activeMemberId, s.id, 'approved')}
                                  className="w-6 h-6 flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                                  title="Подтвердить"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => reviewScreenshot(activeMemberId, s.id, 'rejected')}
                                  className="w-6 h-6 flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                                  title="Отклонить"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

