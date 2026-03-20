import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Users, UserCog, UserX, AlertCircle, X, ShieldAlert, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Member {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    gameNickname: string;
    gameStaticId: string;
    role: 'KINGSIZE' | 'NEWKINGSIZE';
    tier: 'TIER 1' | 'TIER 2' | 'TIER 3' | 'NONE';
    status: 'active' | 'kicked';
    joinedAt: string;
}

export function Members() {
    const queryClient = useQueryClient();

    // Modals state
    const [editMember, setEditMember] = useState<Member | null>(null);
    const [kickMember, setKickMember] = useState<Member | null>(null);

    // Edit fields
    const [editNick, setEditNick] = useState('');
    const [editStatic, setEditStatic] = useState('');
    const [editRole, setEditRole] = useState<'KINGSIZE' | 'NEWKINGSIZE'>('NEWKINGSIZE');
    const [editTier, setEditTier] = useState<'TIER 1' | 'TIER 2' | 'TIER 3' | 'NONE'>('NONE');
    const [errorMsg, setErrorMsg] = useState('');

    // Kick fields
    const [kickReason, setKickReason] = useState('');
    const [addToBlacklist, setAddToBlacklist] = useState(false);
    const [kickErrorMsg, setKickErrorMsg] = useState('');

    const { data: members, isLoading } = useQuery<Member[]>({
        queryKey: ['members'],
        queryFn: async () => {
            const { data } = await api.get('/api/members');
            return data;
        }
    });

    // Filters state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [selectedTiers, setSelectedTiers] = useState<string[]>([]);

    const filteredMembers = useMemo(() => {
        if (!members) return [];
        return members.filter(member => {
            const query = searchQuery.toLowerCase();
            const matchesSearch = 
                member.gameNickname.toLowerCase().includes(query) ||
                member.gameStaticId.toLowerCase().includes(query) ||
                member.discordUsername.toLowerCase().includes(query) ||
                member.discordId.toLowerCase().includes(query);

            const matchesRole = selectedRoles.length === 0 || selectedRoles.includes(member.role);
            const matchesTier = selectedTiers.length === 0 || selectedTiers.includes(member.tier);

            return matchesSearch && matchesRole && matchesTier;
        });
    }, [members, searchQuery, selectedRoles, selectedTiers]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedRoles, selectedTiers]);

    const totalPages = Math.ceil(filteredMembers.length / ITEMS_PER_PAGE);
    const paginatedMembers = filteredMembers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);



    const updateMemberMutation = useMutation({
        mutationFn: async (payload: { id: string, data: any }) => {
            const { data } = await api.patch(`/api/members/${payload.id}`, payload.data);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
            closeModals();
        }
    });

    const kickMemberMutation = useMutation({
        mutationFn: async ({ id, reason, blacklist }: { id: string, reason: string, blacklist: boolean }) => {
            const { data } = await api.post(`/api/members/${id}/exclude`, { reason, blacklist });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
            closeModals();
        }
    });

    const openProfile = (member: Member) => {
        setEditMember(member);
        setEditNick(member.gameNickname);
        setEditStatic(member.gameStaticId);
        setEditRole(member.role);
        setEditTier(member.tier);
        setErrorMsg('');
    };

    const openKick = (member: Member) => {
        setKickMember(member);
        setKickReason('');
        setAddToBlacklist(false);
        setKickErrorMsg('');
    };

    const closeModals = () => {
        setEditMember(null);
        setKickMember(null);
    };

    const formatNick = (value: string) => {
        const filtered = value.replace(/[^a-zA-Z ]/g, '');
        return filtered.charAt(0).toUpperCase() + filtered.slice(1);
    };

    const handleSave = () => {
        if (!editNick || editNick.length > 22 || !/^[A-Z]/.test(editNick)) {
            setErrorMsg('Никнейм обязателен, до 22 символов, только английские буквы, с большой буквы.');
            return;
        }
        if (!editStatic || !/^\d{1,6}$/.test(editStatic)) {
            setErrorMsg('Статик обязателен (только цифры, до 6 символов).');
            return;
        }
        
        setErrorMsg('');
        updateMemberMutation.mutate({
            id: editMember!.id,
            data: {
                gameNickname: editNick,
                gameStaticId: editStatic,
                role: editRole,
                tier: editTier === 'NONE' ? 'БЕЗ TIER' : editTier
            }
        });
    };

    const handleKick = () => {
        if (!kickReason.trim()) {
            setKickErrorMsg('Обязательно укажите причину исключения.');
            return;
        }
        kickMemberMutation.mutate({ id: kickMember!.id, reason: kickReason, blacklist: addToBlacklist });
    };

    const getRoleBadge = (role: string) => {
        if (role === 'KINGSIZE') return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">KINGSIZE</span>;
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">NEWKINGSIZE</span>;
    };

    const getTierBadge = (tier: string) => {
        if (tier === 'NONE' || tier === 'БЕЗ TIER') return <span className="text-slate-400 text-[11px] font-bold tracking-wider">БЕЗ TIER</span>;
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-md text-[11px] font-bold font-mono tracking-wider">{tier}</span>;
    };

    return (
        <div className="h-full flex flex-col font-sans relative">
            <header className="mb-8 flex justify-between items-end">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/20 text-white">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">УЧАСТНИКИ</h1>
                        <p className="text-slate-500 text-[13px] font-medium tracking-wide">
                            Управление действующим составом семьи. <span className="font-bold text-slate-700 ml-1">Всего участников: {filteredMembers.length}</span>
                        </p>
                    </div>
                </div>
            </header>

            <div className="mb-6 flex flex-col xl:flex-row gap-4">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Поиск по Nick, Static, Discord..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/60 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                    />
                </div>

                <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Роль</span>
                        {['KINGSIZE', 'NEWKINGSIZE'].map(role => (
                            <button
                                key={role}
                                onClick={() => setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                    selectedRoles.includes(role) 
                                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" 
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                {role}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">TIER</span>
                        {[
                            { label: 'TIER 1', value: 'TIER 1' },
                            { label: 'TIER 2', value: 'TIER 2' },
                            { label: 'TIER 3', value: 'TIER 3' },
                            { label: 'БЕЗ TIER', value: 'NONE' }
                        ].map(tier => (
                            <button
                                key={tier.value}
                                onClick={() => setSelectedTiers(prev => prev.includes(tier.value) ? prev.filter(t => t !== tier.value) : [...prev, tier.value])}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                    selectedTiers.includes(tier.value) 
                                        ? "bg-slate-800 text-white shadow-md shadow-slate-800/20" 
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                {tier.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Users className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="text-[14px] font-medium">Нет участников, подходящих под фильтры</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[25%] text-center">NICK | STATIC</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Роль</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">TIER</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Управление</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedMembers.map(member => (
                                    <tr key={member.id} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={member.discordAvatarUrl || `https://ui-avatars.com/api/?name=${member.discordUsername}&background=random`} 
                                                    alt={member.discordUsername} 
                                                    className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{member.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{member.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex flex-col items-center justify-center">
                                                <p className="text-[13px] font-bold text-slate-900">{member.gameNickname}</p>
                                                <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                                    #{member.gameStaticId}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            {getRoleBadge(member.role)}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            {getTierBadge(member.tier)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="flex justify-end gap-1 text-[12px]">
                                                <button 
                                                    onClick={() => openProfile(member)}
                                                    className="w-8 h-8 flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                                    title="Профиль участника"
                                                >
                                                    <UserCog className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => openKick(member)}
                                                    className="w-8 h-8 flex items-center justify-center text-rose-500 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:text-rose-700 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                                    title="Исключить участника"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200/60 rounded-b-2xl">
                        <span className="text-[13px] font-medium text-slate-500">
                            Страница <span className="font-bold text-slate-700">{currentPage}</span> из <span className="font-bold text-slate-700">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 text-[12px] font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm active:scale-[0.98]"
                            >
                                Назад
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 text-[12px] font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                            >
                                Вперед
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            {editMember && createPortal(
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeModals}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300 border border-slate-100/50 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-5 border-b border-slate-100/80 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-[18px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                    <UserCog className="w-5 h-5 text-indigo-600" /> Профиль участника
                                </h2>
                                <p className="text-[12px] text-slate-500 font-medium mt-0.5 ml-7">{editMember.discordUsername}</p>
                            </div>
                            <button 
                                onClick={closeModals}
                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider pl-1">Игровой никнейм</label>
                                    <input 
                                        type="text" 
                                        value={editNick}
                                        onChange={e => setEditNick(formatNick(e.target.value))}
                                        className="w-full px-4 py-2.5 bg-slate-50/80 border border-slate-200 text-[13px] font-bold text-slate-900 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:font-medium placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="w-[100px]">
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider pl-1">Статик</label>
                                    <input 
                                        type="text" 
                                        value={editStatic}
                                        onChange={e => setEditStatic(e.target.value.replace(/\D/g, ''))}
                                        maxLength={6}
                                        className="w-full px-4 py-2.5 bg-slate-50/80 border border-slate-200 text-[13px] font-bold text-slate-900 font-mono rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center placeholder:font-medium placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider pl-1">Роль в Discord</label>
                                    <select 
                                        value={editRole}
                                        onChange={e => setEditRole(e.target.value as any)}
                                        className="w-full px-4 py-2.5 bg-slate-50/80 border border-slate-200 text-[13px] font-bold text-slate-900 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="NEWKINGSIZE">NEWKINGSIZE</option>
                                        <option value="KINGSIZE">KINGSIZE</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider pl-1">Ранг (TIER)</label>
                                    <select 
                                        value={editTier}
                                        onChange={e => setEditTier(e.target.value as any)}
                                        className="w-full px-4 py-2.5 bg-slate-50/80 border border-slate-200 text-[13px] font-bold text-slate-900 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer text-center"
                                    >
                                        <option value="NONE">БЕЗ TIER</option>
                                        <option value="TIER 1">TIER 1</option>
                                        <option value="TIER 2">TIER 2</option>
                                        <option value="TIER 3">TIER 3</option>
                                    </select>
                                </div>
                            </div>
                            
                            {errorMsg && <p className="text-rose-500 text-[11px] font-semibold mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errorMsg}</p>}
                        </div>
                        
                        <div className="px-6 pb-6 pt-2 flex gap-3">
                            <button 
                                onClick={closeModals}
                                className="flex-1 py-3 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                            >
                                Отмена
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={updateMemberMutation.isPending}
                                className="flex-1 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl text-[13px] font-bold transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Kick Modal */}
            {kickMember && createPortal(
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeModals}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col animate-in zoom-in-95 fade-in duration-300 border border-slate-100/50 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="pt-8 px-6 pb-2 text-center flex flex-col items-center">
                            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 ring-4 ring-rose-50">
                                <UserX className="w-7 h-7" />
                            </div>
                            <h2 className="text-[20px] font-bold text-slate-900 tracking-tight mb-1">Исключить участника</h2>
                            <p className="text-[13px] text-slate-500 font-medium px-4">Вы собираетесь удалить <span className="font-bold text-slate-700">{kickMember.discordUsername}</span> из состава.</p>
                        </div>
                        
                        <div className="px-6 py-4 space-y-5">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider pl-1">Причина исключения <span className="text-rose-500">*</span></label>
                                <textarea 
                                    value={kickReason}
                                    onChange={e => setKickReason(e.target.value)}
                                    placeholder="Нарушение правил, неактив и т.д."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 text-[13px] font-medium text-slate-900 rounded-2xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all placeholder:text-slate-400 resize-none"
                                />
                                {kickErrorMsg && <p className="text-rose-500 text-[11px] font-semibold mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{kickErrorMsg}</p>}
                            </div>

                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-rose-500" /> Черный список (ЧС)</span>
                                    <span className="text-[11px] font-medium text-slate-500 mt-0.5 max-w-[200px] leading-snug">Запрет на подачу заявок в будущем</span>
                                </div>
                                <button 
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                                        addToBlacklist ? "bg-rose-500" : "bg-slate-300"
                                    )}
                                    onClick={() => setAddToBlacklist(!addToBlacklist)}
                                >
                                    <span 
                                        className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm",
                                            addToBlacklist ? "translate-x-6" : "translate-x-1"
                                        )}
                                    />
                                </button>
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
                                onClick={handleKick}
                                disabled={kickMemberMutation.isPending || !kickReason.trim()}
                                className="flex-1 py-3 bg-rose-500 text-white hover:bg-rose-600 rounded-2xl text-[13px] font-bold transition-all shadow-lg shadow-rose-500/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                            >
                                Изгнать
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
