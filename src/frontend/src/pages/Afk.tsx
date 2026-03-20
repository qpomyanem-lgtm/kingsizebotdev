import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/api';
import { formatMoscowDate } from '../lib/time';
import { Clock, UserCheck, ShieldAlert, TimerOff, UserMinus, Moon } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AfkEntry {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    reason: string;
    startsAt: string;
    endsAt: string;
    status: 'active' | 'ended';
    endedByType: 'self' | 'admin' | 'expired' | null;
    endedByAdmin: string | null;
    endedAt: string | null;
    createdAt: string;
}

function TimeRemaining({ endsAt }: { endsAt: string }) {
    const [remaining, setRemaining] = useState<string>('');

    useEffect(() => {
        const calculate = () => {
            const now = new Date();
            const end = new Date(endsAt);
            const diffMs = end.getTime() - now.getTime();
            
            if (diffMs <= 0) return 'Истекло';

            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return `${diffHours}ч ${diffMins}м`;
        };

        setRemaining(calculate());
        const interval = setInterval(() => setRemaining(calculate()), 60000);
        return () => clearInterval(interval);
    }, [endsAt]);

    return <span>{remaining}</span>;
}

export function Afk() {
    const [filter, setFilter] = useState<'active' | 'ended'>('active');
    const { data: user } = useAuth();
    const queryClient = useQueryClient();

    const { data: afkEntries, isLoading } = useQuery<AfkEntry[]>({
        queryKey: ['afk'],
        queryFn: async () => {
            const { data } = await api.get('/api/afk');
            return data;
        },
        refetchInterval: 60000
    });

    const endAfkMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.post(`/api/afk/${id}/end`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['afk'] });
        }
    });

    const displayedAfks = afkEntries?.filter(afk => afk.status === filter) || [];
    const canEndAfk = user?.roleLabel && ['BOT OWNER', 'OWNER', '.', 'DEP', 'HIGH'].includes(user.roleLabel);

    const getEndReasonBadge = (type: string | null, adminName: string | null) => {
        switch (type) {
            case 'self': return <span className="flex w-max items-center gap-1.5 text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide"><UserCheck className="w-3.5 h-3.5" /> ЗАВЕРШИЛ САМ</span>;
            case 'expired': return <span className="flex w-max items-center gap-1.5 text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide"><TimerOff className="w-3.5 h-3.5" /> ВРЕМЯ ВЫШЛО</span>;
            case 'admin': return <span className="flex w-max items-center gap-1.5 text-rose-700 bg-rose-100/80 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase"><ShieldAlert className="w-3.5 h-3.5" /> {adminName || 'АДМИН'}</span>;
            default: return null;
        }
    };

    return (
        <div className="h-full flex flex-col font-sans relative">
            <header className="mb-8 flex justify-between items-end">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/20 text-white">
                        <Moon className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">СИСТЕМА АФК</h1>
                        <p className="text-slate-500 text-[13px] font-medium tracking-wide">
                            Список неактивных участников и история АФК.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60 shadow-inner">
                    <button 
                        onClick={() => setFilter('active')}
                        className={cn("px-5 py-2 rounded-xl text-[13px] font-bold transition-all duration-300", filter === 'active' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        Активные
                    </button>
                    <button 
                        onClick={() => setFilter('ended')}
                        className={cn("px-5 py-2 rounded-xl text-[13px] font-bold transition-all duration-300", filter === 'ended' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        Завершенные
                    </button>
                </div>
            </header>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : displayedAfks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Moon className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="text-[14px] font-medium">Нет {filter === 'active' ? 'активных' : 'завершенных'} АФК</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[40%] text-center">Причина</th>
                                    {filter === 'active' ? (
                                        <>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Окончание</th>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Управление</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Период</th>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Способ завершения</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {displayedAfks.map(afk => (
                                    <tr key={afk.id} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={afk.discordAvatarUrl || `https://ui-avatars.com/api/?name=${afk.discordUsername}&background=random`} 
                                                    alt={afk.discordUsername} 
                                                    className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{afk.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{afk.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex justify-center">
                                                <div className="text-[12px] font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 max-w-sm break-words line-clamp-2 text-center" title={afk.reason}>
                                                    {afk.reason}
                                                </div>
                                            </div>
                                        </td>
                                        {filter === 'active' ? (
                                            <>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="text-[12px] font-bold text-slate-900">
                                                            {formatMoscowDate(afk.endsAt)}
                                                        </div>
                                                        <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 flex items-center gap-1 border border-indigo-100">
                                                            <Clock className="w-3 h-3" />
                                                            <TimeRemaining endsAt={afk.endsAt} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <div className="flex justify-end gap-1 text-[12px]">
                                                        {canEndAfk && (
                                                            <button 
                                                                onClick={() => {
                                                                    if (confirm(`Завершить АФК пользователя ${afk.discordUsername}?`)) {
                                                                        endAfkMutation.mutate(afk.id);
                                                                    }
                                                                }}
                                                                disabled={endAfkMutation.isPending}
                                                                className="w-8 h-8 flex items-center justify-center text-rose-500 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                                                                title="Завершить АФК"
                                                            >
                                                                <UserMinus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex flex-col items-center justify-center gap-1">
                                                        <div className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                                            С: <span className="font-bold text-slate-700">{formatMoscowDate(afk.startsAt)}</span>
                                                        </div>
                                                        <div className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                                            По: <span className="font-bold text-slate-700">{formatMoscowDate(afk.endedAt || afk.endsAt)}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex justify-center">
                                                        {getEndReasonBadge(afk.endedByType, afk.endedByAdmin)}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
