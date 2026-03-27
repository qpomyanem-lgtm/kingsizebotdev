import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { formatMoscowDate } from '../lib/time';
import { Search, Filter, X, Eye, ShieldOff } from 'lucide-react';
import { cn } from '../lib/utils';

interface ExcludedMember {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    gameNickname: string;
    gameStaticId: string;
    status: 'kicked' | 'blacklisted';
    joinedAt: string;
    kickReason: string | null;
    kickedAt: string | null;
    kickedByAdminUsername: string | null;
    acceptedByAdminUsername: string | null;
    acceptedAt: string | null;
}

type StatusFilter = 'all' | 'kicked' | 'blacklisted';

export function Kicked() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [profileModal, setProfileModal] = useState<ExcludedMember | null>(null);

    const { data: kickedMembers, isLoading } = useQuery<ExcludedMember[]>({
        queryKey: ['members-kicked'],
        queryFn: async () => {
            const { data } = await api.get('/api/members/kicked');
            return data;
        }
    });

    const unblacklistMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.post(`/api/members/${id}/unblacklist`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members-kicked'] });
            setProfileModal(null);
        }
    });

    const filteredMembers = useMemo(() => {
        if (!kickedMembers) return [];
        return kickedMembers.filter(member => {
            const query = searchQuery.toLowerCase();
            const matchesSearch = !query ||
                member.discordUsername.toLowerCase().includes(query) ||
                member.discordId.includes(query) ||
                member.gameNickname.toLowerCase().includes(query);

            const matchesStatus = statusFilter === 'all' || member.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [kickedMembers, searchQuery, statusFilter]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, searchQuery]);

    const totalPages = Math.ceil((filteredMembers?.length || 0) / ITEMS_PER_PAGE);
    const paginatedMembers = filteredMembers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
                            <ShieldOff className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">ИСКЛЮЧЕННЫЕ</h1>
                            <p className="text-slate-500 text-[13px] font-medium tracking-wide">История участников покинувших семью.</p>
                        </div>
                    </div>
                    {kickedMembers && (
                        <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                            Всего исключенных: {kickedMembers.length}
                        </span>
                    )}
                </div>
            </header>

            {/* Search & Filters */}
            <div className="flex items-center gap-3 mb-6">
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
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Статус</span>
                    {([
                        { key: 'all' as const, label: 'Все' },
                        { key: 'kicked' as const, label: 'Исключен' },
                        { key: 'blacklisted' as const, label: 'ЧС' },
                    ]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => setStatusFilter(f.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                statusFilter === f.key
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-400 text-[15px]">
                            {searchQuery || statusFilter !== 'all' ? 'Ничего не найдено' : 'Список исключенных пуст'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">NICKNAME</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Статус</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Дата и ответственный</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedMembers.map(member => (
                                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={member.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.discordUsername)}&background=random`}
                                                    alt={member.discordUsername}
                                                    className="w-9 h-9 rounded-full grayscale ring-2 ring-white shadow-sm"
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{member.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{member.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center justify-center">
                                                <p className="text-[13px] font-bold text-slate-900">{member.gameNickname}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                {member.status === 'blacklisted' ? (
                                                    <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">Черный список</span>
                                                ) : (
                                                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Исключен</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                <p className="text-[12px] font-medium text-slate-600">{formatMoscowDate(member.kickedAt || member.joinedAt)}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{member.kickedByAdminUsername || '—'}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setProfileModal(member)}
                                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Просмотр профиля"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {member.status === 'blacklisted' && (
                                                    <button
                                                        onClick={() => unblacklistMutation.mutate(member.id)}
                                                        disabled={unblacklistMutation.isPending}
                                                        className="flex items-center gap-1.5 px-3 h-8 text-rose-600 bg-rose-50/50 hover:bg-rose-100 rounded-lg transition-all shadow-sm active:scale-[0.98] font-semibold border border-rose-100 disabled:opacity-50"
                                                    >
                                                        <ShieldOff className="w-3.5 h-3.5" />
                                                        Убрать из ЧС
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

            {/* Profile Modal */}
            {profileModal && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setProfileModal(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 border border-slate-100/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                            <h2 className="text-[16px] font-bold text-slate-900">
                                Профиль исключенного участника {profileModal.discordUsername}
                            </h2>
                            <button onClick={() => setProfileModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[70vh]">
                            {/* Discord Data */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Discord данные</h3>
                                <div className="flex items-center gap-3 mb-3">
                                    <img
                                        src={profileModal.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileModal.discordUsername)}&background=random`}
                                        alt={profileModal.discordUsername}
                                        className="w-12 h-12 rounded-full grayscale"
                                    />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{profileModal.discordUsername}</p>
                                        <p className="text-xs text-slate-500 font-mono">{profileModal.discordId}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Game Data */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Игровые данные</h3>
                                <div className="bg-slate-50 rounded-xl px-4 py-3">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Nick</p>
                                    <p className="text-sm font-medium text-slate-900">{profileModal.gameNickname}</p>
                                </div>
                            </section>

                            {/* Acceptance Data */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Данные о принятии</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Кто принял</p>
                                        <p className="text-sm font-medium text-slate-900">{profileModal.acceptedByAdminUsername || '—'}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Когда принял</p>
                                        <p className="text-sm font-medium text-slate-900">{profileModal.acceptedAt ? formatMoscowDate(profileModal.acceptedAt) : '—'}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Exclusion Data */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Данные об исключении</h3>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Кто исключил</p>
                                        <p className="text-sm font-medium text-slate-900">{profileModal.kickedByAdminUsername || '—'}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Когда исключил</p>
                                        <p className="text-sm font-medium text-slate-900">{profileModal.kickedAt ? formatMoscowDate(profileModal.kickedAt) : '—'}</p>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-xl px-4 py-3">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Причина исключения</p>
                                    <p className="text-sm font-medium text-slate-900">{profileModal.kickReason || '—'}</p>
                                </div>
                            </section>

                            {/* Current Status */}
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Текущий статус</h3>
                                {profileModal.status === 'blacklisted' ? (
                                    <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-full text-xs font-bold">Черный список</span>
                                ) : (
                                    <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Исключен</span>
                                )}
                            </section>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100">
                            {profileModal.status === 'blacklisted' && (
                                <button
                                    onClick={() => unblacklistMutation.mutate(profileModal.id)}
                                    disabled={unblacklistMutation.isPending}
                                    className="flex-1 py-3 bg-red-600 text-white hover:bg-red-700 rounded-2xl text-[13px] font-bold transition-all shadow-lg shadow-red-600/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                                >
                                    <ShieldOff className="w-4 h-4" />
                                    Убрать из ЧС
                                </button>
                            )}
                            <button
                                onClick={() => setProfileModal(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
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
