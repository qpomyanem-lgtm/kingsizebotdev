import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/api';
import { formatMoscowDate } from '../lib/time';
import { Clock, PhoneCall, Check, X, Eye, Users, UserCheck, UserX, AlertCircle, ClipboardCheck, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { io, Socket } from 'socket.io-client';

export interface Application {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    field1: string;
    field2: string;
    field3: string;
    field4: string;
    field5: string;
    status: 'pending' | 'interview' | 'interview_ready' | 'accepted' | 'rejected' | 'excluded' | 'blacklist';
    createdAt: string;
    handledByAdminUsername: string | null;
    updatedAt: string;
}

export function Applications() {
    const { data: currentUser } = useAuth();
    const canManageApplications = !!currentUser?.permissions?.includes('site:applications:actions');
    const [filter, setFilter] = useState<'all' | 'pending' | 'interview'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);
    const queryClient = useQueryClient();

    // Modals state
    const [acceptAppId, setAcceptAppId] = useState<string | null>(null);
    const [nick, setNick] = useState('');
    const [nicknameError, setNicknameError] = useState('');

    const [rejectAppId, setRejectAppId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const { data: applications, isLoading } = useQuery<Application[]>({
        queryKey: ['applications'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications');
            return data;
        }
    });

    // Live refresh via Socket.IO
    useEffect(() => {
        const HOST_URL = typeof window !== 'undefined' ? window.location.origin.replace('admin.', '') : 'http://localhost:3000';
        const socket: Socket = io(import.meta.env.VITE_API_URL || HOST_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        socket.on('applications_refresh', () => {
            queryClient.invalidateQueries({ queryKey: ['applications'] });
        });

        return () => {
            socket.close();
        };
    }, [queryClient]);

    const { data: fieldLabels } = useQuery<{ key: string, label: string }[]>({
        queryKey: ['application-fields'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications/fields');
            return data;
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, gameNickname, rejectionReason }: {
            id: string,
            status: string,
            gameNickname?: string,
            rejectionReason?: string
        }) => {
            const payload: any = { status };
            if (gameNickname) payload.gameNickname = gameNickname;
            if (rejectionReason) payload.rejectionReason = rejectionReason;

            const { data } = await api.patch(`/api/applications/${id}/status`, payload);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applications'] });
            closeModals();
        },
        onError: (error: any) => {
            const apiError = error?.response?.data;
            if (apiError && apiError.details) {
                alert(`Ошибка: ${apiError.error}\n${JSON.stringify(apiError.details, null, 2)}`);
            } else {
                alert(`Ошибка сохранения: ${error?.message || 'Неизвестная ошибка'}`);
            }
        }
    });

    const closeModals = () => {
        setAcceptAppId(null);
        setNick('');
        setNicknameError('');

        setRejectAppId(null);
        setRejectReason('');
    };

    const formatNick = (value: string) => {
        // Only English letters and spaces
        const filtered = value.replace(/[^a-zA-Z ]/g, '');
        // Capitalize first letter
        return filtered.charAt(0).toUpperCase() + filtered.slice(1);
    };

    const handleAcceptSubmit = () => {
        let valid = true;
        if (!nick || nick.length > 22) {
            setNicknameError('Никнейм обязателен и не больше 22 символов');
            valid = false;
        } else if (!/^[A-Z]/.test(nick)) {
            setNicknameError('Никнейм должен начинаться с большой буквы');
            valid = false;
        } else if (nick.length < 3) {
            setNicknameError('Имя персонажа слишком короткое');
            valid = false;
        } else {
            setNicknameError('');
        }

        if (!canManageApplications) return;

        if (valid && acceptAppId) {
            updateStatusMutation.mutate({
                id: acceptAppId,
                status: 'accepted',
                gameNickname: nick,
            });
        }
    };

    const handleRejectSubmit = () => {
        if (!canManageApplications) return;
        if (!rejectReason.trim()) return;
        if (rejectAppId) {
            updateStatusMutation.mutate({
                id: rejectAppId,
                status: 'rejected',
                rejectionReason: rejectReason
            });
        }
    };

    const totalOpenApps = useMemo(
        () => applications?.filter(app => ['pending', 'interview', 'interview_ready'].includes(app.status)).length || 0,
        [applications]
    );

    const filteredApps = useMemo(() => {
        const source = applications || [];
        const query = searchQuery.trim().toLowerCase();

        return source.filter(app => {
            const matchesFilter =
                filter === 'all'
                    ? ['pending', 'interview', 'interview_ready'].includes(app.status)
                    : filter === 'interview'
                        ? ['interview', 'interview_ready'].includes(app.status)
                        : app.status === filter;

            const matchesSearch =
                !query ||
                app.discordUsername.toLowerCase().includes(query) ||
                app.discordId.includes(query);

            return matchesFilter && matchesSearch;
        });
    }, [applications, filter, searchQuery]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setCurrentPage(1);
    }, [filter, searchQuery]);

    const totalPages = Math.ceil((filteredApps?.length || 0) / ITEMS_PER_PAGE);
    const paginatedApps = filteredApps.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Ожидание</span>;
            case 'interview': return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Обзвон</span>;
            case 'interview_ready': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium">Готов к обзвону</span>;
            default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    const renderTextWithLinks = (text: string | null | undefined) => {
        if (!text) return <span className="text-slate-400 italic">Нет ответа</span>;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 underline font-medium" onClick={(e) => e.stopPropagation()}>
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    return (
        <div className="h-full flex flex-col font-sans relative">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
                        <ClipboardCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">ЗАЯВКИ</h1>
                        <p className="text-slate-500 text-[14px] font-medium tracking-wide">
                            Управление заявками на вступление в семью.
                        </p>
                    </div>
                </div>
                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                    Всего заявок: {totalOpenApps}
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
                    <button
                        onClick={() => setFilter('all')}
                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all", filter === 'all' ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                    >
                        Все
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all", filter === 'pending' ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                    >
                        Ожидают
                    </button>
                    <button
                        onClick={() => setFilter('interview')}
                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all", filter === 'interview' ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                    >
                        На обзвоне
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : filteredApps.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Users className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="text-[14px] font-medium">{searchQuery ? 'По запросу ничего не найдено' : 'В этой категории пока нет заявок'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[25%] text-center">Статус</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[25%] text-center">Время</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Управление</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedApps.map(app => (
                                    <tr key={app.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={app.discordAvatarUrl || `https://ui-avatars.com/api/?name=${app.discordUsername}&background=random`}
                                                    alt={app.discordUsername}
                                                    className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{app.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{app.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                {getStatusBadge(app.status)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    {formatMoscowDate(app.createdAt)}
                                                </div>
                                                {(app.status === 'interview' || app.status === 'interview_ready') && app.handledByAdminUsername && (
                                                    <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px] text-center" title={app.handledByAdminUsername}>
                                                        Решает: <span className="font-semibold text-slate-600">{app.handledByAdminUsername}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-1 text-[12px]">
                                                <button
                                                    onClick={() => setSelectedApp(app)}
                                                    className="w-8 h-8 flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                                    title="Посмотреть заявку"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {app.status === 'pending' && (
                                                    <>
                                                        <button
                                                            disabled={updateStatusMutation.isPending || !canManageApplications}
                                                            onClick={() => canManageApplications && updateStatusMutation.mutate({ id: app.id, status: 'interview' })}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-3 h-8 rounded-lg transition-all shadow-sm font-semibold border",
                                                                canManageApplications
                                                                    ? "text-blue-600 bg-blue-50/50 hover:bg-blue-100 active:scale-[0.98] border-blue-100"
                                                                    : "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed opacity-70"
                                                            )}
                                                            title={canManageApplications ? "Перевести на обзвон" : "Нет прав на взаимодействие с заявками"}
                                                        >
                                                            <PhoneCall className="w-3.5 h-3.5" /> Обзвон
                                                        </button>
                                                        <button
                                                            disabled={updateStatusMutation.isPending || !canManageApplications}
                                                            onClick={() => canManageApplications && setRejectAppId(app.id)}
                                                            className={cn(
                                                                "w-8 h-8 flex items-center justify-center rounded-lg transition-all shadow-sm border",
                                                                canManageApplications
                                                                    ? "text-rose-600 bg-rose-50/50 hover:bg-rose-100 active:scale-[0.98] border-rose-100"
                                                                    : "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed opacity-70"
                                                            )}
                                                            title={canManageApplications ? "Отклонить" : "Нет прав на взаимодействие с заявками"}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {(app.status === 'interview' || app.status === 'interview_ready') && (
                                                    <>
                                                        <button
                                                            disabled={updateStatusMutation.isPending || !canManageApplications}
                                                            onClick={() => canManageApplications && setAcceptAppId(app.id)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-3 h-8 rounded-lg transition-all shadow-sm font-semibold border",
                                                                canManageApplications
                                                                    ? "text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100 active:scale-[0.98] border-emerald-100"
                                                                    : "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed opacity-70"
                                                            )}
                                                            title={canManageApplications ? "Принять" : "Нет прав на взаимодействие с заявками"}
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Принять
                                                        </button>
                                                        <button
                                                            disabled={updateStatusMutation.isPending || !canManageApplications}
                                                            onClick={() => canManageApplications && setRejectAppId(app.id)}
                                                            className={cn(
                                                                "w-8 h-8 flex items-center justify-center rounded-lg transition-all shadow-sm border",
                                                                canManageApplications
                                                                    ? "text-rose-600 bg-rose-50/50 hover:bg-rose-100 active:scale-[0.98] border-rose-100"
                                                                    : "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed opacity-70"
                                                            )}
                                                            title={canManageApplications ? "Отклонить" : "Нет прав на взаимодействие с заявками"}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </>
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

            {/* Application Details Modal */}
            {selectedApp && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setSelectedApp(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 border border-slate-100/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-5 border-b border-slate-100/80 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
                            <div>
                                <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">Заявка от <span className="text-indigo-600">{selectedApp.discordUsername}</span></h2>
                                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Детали анкеты пользователя</p>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                            {[1, 2, 3, 4, 5].map(num => (
                                <div key={num} className="group">
                                    <h3 className="text-[13px] font-semibold text-slate-800 mb-1.5 flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                                            {num}
                                        </div>
                                        {fieldLabels?.[num - 1]?.label || `Вопрос ${num}`}
                                    </h3>
                                    <p className="text-[13px] text-slate-600 bg-slate-50/80 hover:bg-slate-50 border border-slate-100 p-3.5 rounded-2xl whitespace-pre-wrap break-words leading-relaxed transition-colors">
                                        {renderTextWithLinks((selectedApp as any)?.[`field${num}`])}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Accept Modal */}
            {acceptAppId && createPortal(
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeModals}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in duration-300 border border-slate-100/50 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="pt-8 px-6 pb-2 flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-50">
                                <UserCheck className="w-7 h-7" />
                            </div>
                            <h2 className="text-[20px] font-bold text-slate-900 tracking-tight mb-1">Принять участника</h2>
                            <p className="text-[13px] text-slate-500 font-medium px-4">Заполните игровые данные для автоматической выдачи роли</p>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-center">Игровой никнейм</label>
                                <input 
                                    type="text" 
                                    value={nick}
                                    onChange={e => setNick(formatNick(e.target.value))}
                                    placeholder="Например: John Cena"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-[14px] font-bold text-slate-900 rounded-2xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-center tracking-wide placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400"
                                />
                                {nicknameError && <p className="text-rose-500 text-[11px] font-semibold mt-1.5 flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{nicknameError}</p>}
                            </div>
                        </div>
                        <div className="px-6 pb-6 pt-2 flex gap-3">
                            <button 
                                onClick={closeModals}
                                className="flex-1 py-3 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                            >
                                Отмена
                            </button>
                            <button 
                                onClick={handleAcceptSubmit}
                                disabled={updateStatusMutation.isPending}
                                className="flex-1 py-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-2xl text-[13px] font-bold transition-all shadow-lg shadow-emerald-500/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            >
                                Подтвердить
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Reject Modal */}
            {rejectAppId && createPortal(
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeModals}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in duration-300 border border-slate-100/50 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="pt-8 px-6 pb-2 flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 ring-4 ring-rose-50">
                                <UserX className="w-7 h-7" />
                            </div>
                            <h2 className="text-[20px] font-bold text-slate-900 tracking-tight mb-1">Отклонить заявку</h2>
                            <p className="text-[13px] text-slate-500 font-medium px-4">Укажите причину отказа, она будет видна кандидату</p>
                        </div>
                        <div className="px-6 py-4">
                            <textarea 
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Например: Возраст / Некорректные ответы"
                                rows={3}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-[13px] font-medium text-slate-900 rounded-2xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all placeholder:text-slate-400 resize-none text-center"
                            />
                        </div>
                        <div className="px-6 pb-6 pt-2 flex gap-3">
                            <button 
                                onClick={closeModals}
                                className="flex-1 py-3 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                            >
                                Отмена
                            </button>
                            <button 
                                onClick={handleRejectSubmit}
                                disabled={updateStatusMutation.isPending || !rejectReason.trim()}
                                className="flex-1 py-3 bg-rose-500 text-white hover:bg-rose-600 rounded-2xl text-[13px] font-bold transition-all shadow-lg shadow-rose-500/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            >
                                Отклонить
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
