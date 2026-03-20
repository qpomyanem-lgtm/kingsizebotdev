import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Eye, Link as LinkIcon, Loader2, Users, Image as ImageIcon } from 'lucide-react';
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
  screenshotsMax: number;
  forumUrl: string | null;
};

type ScreenshotRow = {
  id: string;
  imageUrl: string;
  createdAt: string;
  sourceType: 'dm' | 'forum';
  sourceDiscordMessageId: string;
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

  const { data: rows, isLoading } = useQuery<ActivityOverviewRow[]>({
    queryKey: ['activity_overview'],
    queryFn: async () => {
      const { data } = await api.get('/api/activity/overview');
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

  // Live refresh (WS)
  useEffect(() => {
    const HOST_URL = typeof window !== 'undefined' ? window.location.origin.replace('admin.', '') : 'http://localhost:3000';
    const newSocket: Socket = io(import.meta.env.VITE_API_URL || HOST_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    newSocket.on('activity_refresh', () => {
      queryClient.invalidateQueries({ queryKey: ['activity_overview'] });
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

  return (
    <div className="h-full flex flex-col font-sans relative">
      <header className="mb-8 flex justify-between items-end">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">АКТИВНОСТЬ</h1>
            <p className="text-slate-500 text-[13px] font-medium tracking-wide">
              Дублирование активности из Discord на сайте (скриншоты).
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <ImageIcon className="w-12 h-12 mb-3 text-slate-200" />
            <p className="text-[14px] font-medium">Активность пока не зафиксирована</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[280px]">Пользователь</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">NICK | STATIC</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">В семье</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Скриншоты</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right w-[220px]">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.memberId} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-4 py-2.5">
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

                    <td className="px-4 py-2.5 text-center">
                      <div>
                        <p className="text-[13px] font-bold text-slate-900">{r.gameNickname}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">#{r.gameStaticId}</p>
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex px-3 py-1 rounded-full text-[12px] font-semibold bg-slate-50 text-slate-700 border border-slate-200/70">
                        {formatFamilyDuration(r.joinedAt)}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex px-3 py-1 rounded-full text-[12px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-mono">
                        {r.screenshotsCount}/{r.screenshotsMax}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end items-center gap-2 text-[12px]">
                        <button
                          onClick={() => openScreenshots(r.memberId)}
                          className="w-8 h-8 flex items-center justify-center text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-lg transition-all shadow-sm active:scale-[0.98]"
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      {activeRow.discordUsername} · {activeRow.nickStatic} · в семье: {formatFamilyDuration(activeRow.joinedAt)}
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
                        className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <a href={s.imageUrl} target="_blank" rel="noreferrer">
                          <img src={s.imageUrl} alt="activity screenshot" className="w-full h-32 object-cover bg-white" />
                        </a>
                        <div className="p-3">
                          <p className="text-[11px] font-mono text-slate-500 truncate" title={s.sourceDiscordMessageId}>
                            {formatMoscowDate(s.createdAt, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">Источник: {s.sourceType}</p>
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

