import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoscowDate } from '../lib/time';

export interface ExcludedMember {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    gameNickname: string;
    gameStaticId: string;
    status: 'kicked' | 'blacklisted';
    joinedAt: string;
}

export function Kicked() {
    const queryClient = useQueryClient();

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
        }
    });

    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-8">
                <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-2">Исключенные</h1>
                <p className="text-slate-500 text-[13px] font-medium tracking-wide">История участников покинувших семью.</p>
            </header>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : !kickedMembers || kickedMembers.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-400 text-[15px]">Список исключенных пуст</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">NICK | STATIC</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Статус</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Дата</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {kickedMembers.map(member => (
                                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={member.discordAvatarUrl || `https://ui-avatars.com/api/?name=${member.discordUsername}&background=random`} 
                                                    alt={member.discordUsername} 
                                                    className="w-10 h-10 rounded-full grayscale"
                                                />
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{member.discordUsername}</p>
                                                    <p className="text-xs text-slate-500 font-mono">{member.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-slate-900 line-through text-opacity-50">{member.gameNickname}</p>
                                            <p className="text-xs text-slate-500 font-mono">#{member.gameStaticId}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {member.status === 'blacklisted' ? (
                                                <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">ЧС</span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Исключен</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {formatMoscowDate(member.joinedAt)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {member.status === 'blacklisted' && (
                                                <button 
                                                    onClick={() => unblacklistMutation.mutate(member.id)}
                                                    disabled={unblacklistMutation.isPending}
                                                    className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                >
                                                    Снять ЧС
                                                </button>
                                            )}
                                        </td>
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
