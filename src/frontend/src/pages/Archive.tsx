import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoscowDate } from '../lib/time';
import { Search, X, Eye, Archive as ArchiveIcon, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface ArchiveApp {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    field1: string;
    field2: string;
    field3: string;
    field4: string;
    field5: string;
    status: 'accepted' | 'rejected' | 'excluded' | 'blacklist';
    createdAt: string;
    handledByAdminUsername: string | null;
    updatedAt: string;
    rejectionReason: string | null;
    memberKickReason: string | null;
    memberKickedAt: string | null;
    memberKickedByAdminUsername: string | null;
    memberStatus: string | null;
}

function getStatusBadges(app: ArchiveApp) {
    switch (app.status) {
        case 'accepted':
            return <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Принят</span>;
        case 'rejected':
            return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Отклонен</span>;
        case 'excluded':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium opacity-60">Принят</span>
                    <span className="text-slate-400 text-xs">→</span>
                    <span className="px-2.5 py-1 bg-slate-200 text-slate-800 rounded-full text-xs font-medium">Исключен</span>
                </div>
            );
        case 'blacklist':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium opacity-60">Принят</span>
                    <span className="text-slate-400 text-xs">→</span>
                    <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">Черный список</span>
                </div>
            );
    }
}

function getResponsibleInfo(app: ArchiveApp) {
    if (app.status === 'rejected') {
        return (
            <div className="flex flex-col items-center justify-center text-center">
                <p className="text-[12px] font-medium text-slate-600">{formatMoscowDate(app.updatedAt)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{app.handledByAdminUsername || '—'}</p>
                {app.rejectionReason && (
                    <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[160px]" title={app.rejectionReason}>{app.rejectionReason}</p>
                )}
            </div>
        );
    }
    if (app.status === 'excluded' || app.status === 'blacklist') {
        return (
            <div className="flex flex-col items-center justify-center text-center">
                <p className="text-[12px] font-medium text-slate-600">{formatMoscowDate(app.memberKickedAt || app.updatedAt)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{app.memberKickedByAdminUsername || app.handledByAdminUsername || '—'}</p>
                {app.memberKickReason && (
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[160px]" title={app.memberKickReason}>{app.memberKickReason}</p>
                )}
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center justify-center text-center">
            <p className="text-[12px] font-medium text-slate-600">{formatMoscowDate(app.updatedAt)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{app.handledByAdminUsername || '—'}</p>
        </div>
    );
}

export function Archive() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
    const [selectedApp, setSelectedApp] = useState<ArchiveApp | null>(null);

    const { data: archivedApps, isLoading } = useQuery<ArchiveApp[]>({
        queryKey: ['applications-archive'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications/archive');
            return data;
        }
    });

    const { data: fieldLabels } = useQuery<{ key: string; label: string }[]>({
        queryKey: ['application-fields'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications/fields');
            return data;
        }
    });

    const filteredApps = useMemo(() => {
        if (!archivedApps) return [];
        const byStatus = archivedApps.filter((app) => {
            if (statusFilter === 'all') return true;
            // Первый статус: excluded/blacklist — сначала были приняты
            if (statusFilter === 'accepted') return app.status === 'accepted' || app.status === 'excluded' || app.status === 'blacklist';
            return app.status === 'rejected';
        });

        if (!searchQuery) return byStatus;
        const query = searchQuery.toLowerCase();
        return byStatus.filter(app =>
            (
                app.discordUsername.toLowerCase().includes(query) ||
                app.discordId.includes(query)
            )
        );
    }, [archivedApps, searchQuery, statusFilter]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, searchQuery]);

    const totalPages = Math.ceil((filteredApps?.length || 0) / ITEMS_PER_PAGE);
    const paginatedApps = filteredApps.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
                        <ArchiveIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">АРХИВ ЗАЯВОК</h1>
                            <p className="text-slate-500 text-[13px] font-medium tracking-wide">Полная история всех рассмотренных заявок. Только просмотр.</p>
                        </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                        Всего в архиве: {archivedApps?.length || 0}
                    </span>
                </div>
            </header>

            <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 mb-6">
                <div className="relative flex-1 w-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Поиск по Discord нику или Discord ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/60 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                    />
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Статус</span>
                    {[
                        { key: 'all', label: 'Все' },
                        { key: 'accepted', label: 'Принят' },
                        { key: 'rejected', label: 'Отклонен' },
                    ].map((item) => (
                        <button
                            key={item.key}
                            onClick={() => setStatusFilter(item.key as 'all' | 'accepted' | 'rejected')}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                statusFilter === item.key
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : filteredApps.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-400 text-[15px]">
                            {searchQuery || statusFilter !== 'all' ? 'Ничего не найдено' : 'Архив пуст'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[25%] text-center">Статус</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[25%] text-center">Дата и ответственный</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedApps.map(app => (
                                    <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={app.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(app.discordUsername)}&background=random`}
                                                    alt={app.discordUsername}
                                                    className={`w-9 h-9 rounded-full ring-2 ring-white shadow-sm ${app.status !== 'accepted' ? 'grayscale' : ''}`}
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{app.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{app.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">{getStatusBadges(app)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">{getResponsibleInfo(app)}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedApp(app)}
                                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Детали заявки"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
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

            {/* Details Modal */}
            {selectedApp && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setSelectedApp(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 border border-slate-100/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                            <h2 className="text-[16px] font-bold text-slate-900">
                                Детали заявки из архива
                            </h2>
                            <button onClick={() => setSelectedApp(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                            {/* User Info */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Информация о пользователе</h3>
                                <div className="flex items-center gap-3">
                                    <img
                                        src={selectedApp.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedApp.discordUsername)}&background=random`}
                                        alt={selectedApp.discordUsername}
                                        className={`w-12 h-12 rounded-full ${selectedApp.status !== 'accepted' ? 'grayscale' : ''}`}
                                    />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{selectedApp.discordUsername}</p>
                                        <p className="text-xs text-slate-500 font-mono">{selectedApp.discordId}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Application Fields */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Поля заявки</h3>
                                <div className="space-y-3">
                                    {[1, 2, 3, 4, 5].map(num => (
                                        <div key={num} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                                            <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                                {fieldLabels?.[num - 1]?.label || `Вопрос ${num}`}
                                            </p>
                                            <p className="text-sm text-slate-900 whitespace-pre-wrap">
                                                {(selectedApp as any)[`field${num}`]}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Metadata */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Метаданные</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Дата подачи</p>
                                        <p className="text-sm font-medium text-slate-900">{formatMoscowDate(selectedApp.createdAt)}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Текущий статус</p>
                                        <div className="mt-0.5">{getStatusBadges(selectedApp)}</div>
                                    </div>
                                </div>
                            </section>

                            {/* Final Decision */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Данные финального решения</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                            {selectedApp.status === 'rejected' ? 'Кто отклонил' : 'Кто принял'}
                                        </p>
                                        <p className="text-sm font-medium text-slate-900">{selectedApp.handledByAdminUsername || '—'}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Дата решения</p>
                                        <p className="text-sm font-medium text-slate-900">{formatMoscowDate(selectedApp.updatedAt)}</p>
                                    </div>
                                </div>
                                {selectedApp.status === 'rejected' && selectedApp.rejectionReason && (
                                    <div className="bg-red-50 rounded-xl px-4 py-3 mt-3 border border-red-100">
                                        <p className="text-[11px] font-semibold text-red-400 uppercase mb-1">Причина отклонения</p>
                                        <p className="text-sm font-medium text-red-900">{selectedApp.rejectionReason}</p>
                                    </div>
                                )}
                            </section>

                            {/* Exclusion/Blacklist info (if applicable) */}
                            {(selectedApp.status === 'excluded' || selectedApp.status === 'blacklist') && (
                                <section>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        {selectedApp.status === 'blacklist' ? 'Данные о блокировке' : 'Данные об исключении'}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 rounded-xl px-4 py-3">
                                            <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Кто исключил</p>
                                            <p className="text-sm font-medium text-slate-900">{selectedApp.memberKickedByAdminUsername || '—'}</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl px-4 py-3">
                                            <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Когда исключил</p>
                                            <p className="text-sm font-medium text-slate-900">{selectedApp.memberKickedAt ? formatMoscowDate(selectedApp.memberKickedAt) : '—'}</p>
                                        </div>
                                    </div>
                                    {selectedApp.memberKickReason && (
                                        <div className="bg-amber-50 rounded-xl px-4 py-3 mt-3 border border-amber-100">
                                            <p className="text-[11px] font-semibold text-amber-500 uppercase mb-1">Причина</p>
                                            <p className="text-sm font-medium text-amber-900">{selectedApp.memberKickReason}</p>
                                        </div>
                                    )}
                                </section>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100">
                            <button
                                onClick={() => setSelectedApp(null)}
                                className="w-full py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
