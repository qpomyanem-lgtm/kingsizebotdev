import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/api';
import { Users, UserCog, UserX, AlertCircle, X, ShieldAlert, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { DynamicIcon } from '../components/IconPicker';

export interface Role {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  priority: number;
  type: 'system' | 'access';
  systemType: string | null;
}

export interface Member {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    gameNickname: string;
    gameStaticId: string;
    roleId: string | null;
    tierRoleId: string | null;
    status: 'active' | 'kicked';
    joinedAt: string;
}

export function Members() {
    const queryClient = useQueryClient();
    const { data: currentUser } = useAuth();
    const canEdit = currentUser?.permissions?.includes('site:members:actions');
    const canKick = currentUser?.permissions?.includes('site:kicked:actions') || currentUser?.permissions?.includes('site:members:actions');

    const { data: roles = [] } = useQuery<Role[]>({
        queryKey: ['roles'],
        queryFn: async () => (await api.get('/api/members/roles')).data,
    });

    const mainRoles = useMemo(() => roles.filter(r => r.systemType === 'main' || r.systemType === 'new').sort((a,b) => a.priority - b.priority), [roles]);
    const tierRoles = useMemo(() => roles.filter(r => r.systemType === 'tier').sort((a,b) => a.priority - b.priority), [roles]);

    // Modals state
    const [editMember, setEditMember] = useState<Member | null>(null);
    const [kickMember, setKickMember] = useState<Member | null>(null);

    // Edit fields
    const [editNick, setEditNick] = useState('');
    const [editRoleId, setEditRoleId] = useState<string | null>(null);
    const [editTierRoleId, setEditTierRoleId] = useState<string | null>(null);
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
                member.discordUsername.toLowerCase().includes(query) ||
                member.discordId.toLowerCase().includes(query);

            const matchesRole = selectedRoles.length === 0 || (member.roleId && selectedRoles.includes(member.roleId));
            const matchesTier = selectedTiers.length === 0 || 
                                (member.tierRoleId && selectedTiers.includes(member.tierRoleId)) || 
                                (!member.tierRoleId && selectedTiers.includes('NONE'));

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
        setEditNick(member.gameNickname || '');
        setEditRoleId(member.roleId || (mainRoles.length > 0 ? mainRoles[0].id : null));
        setEditTierRoleId(member.tierRoleId);
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
        setErrorMsg('');
        updateMemberMutation.mutate({
            id: editMember!.id,
            data: {
                gameNickname: editNick,
                gameStaticId: '0000',
                roleId: editRoleId,
                tierRoleId: editTierRoleId
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

    const getRoleBadge = (roleId: string | null) => {
        const role = roles.find(r => r.id === roleId);
        if (!role) return <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[11px] font-semibold">Неизвестно</span>;
        
        return (
          <span 
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border border-white/20 shadow-sm"
            style={{ backgroundColor: role.color + '25', color: role.color }}
          >
            <DynamicIcon name={role.icon} className="w-3 h-3" />
            {role.name}
          </span>
        );
    };

    const getTierBadge = (tierRoleId: string | null) => {
        if (!tierRoleId) return <span className="text-slate-400 text-[11px] font-bold tracking-wider">БЕЗ TIER</span>;
        const role = roles.find(r => r.id === tierRoleId);
        if (!role) return <span className="text-slate-400 text-[11px] font-bold tracking-wider">{tierRoleId}</span>;

        return (
          <span 
            className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono tracking-wider border"
            style={{ borderColor: role.color + '40', backgroundColor: role.color + '10', color: role.color }}
          >
            {role.name}
          </span>
        );
    };

    return (
        <div className="h-full flex flex-col font-sans relative">
            <header className="mb-8 flex justify-between items-end">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">УЧАСТНИКИ</h1>
                        <p className="text-slate-500 text-[13px] font-medium tracking-wide">
                            Управление действующим составом семьи.
                        </p>
                    </div>
                </div>
                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                    Всего участников: {members?.length || 0}
                </span>
            </header>

            <div className="mb-6 flex flex-col xl:flex-row gap-4">
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

                <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Роль</span>
                        {mainRoles.map(role => (
                            <button
                                key={role.id}
                                onClick={() => setSelectedRoles(prev => prev.includes(role.id) ? prev.filter(r => r !== role.id) : [...prev, role.id])}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                    selectedRoles.includes(role.id) 
                                        ? "text-white shadow-md" 
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                                style={selectedRoles.includes(role.id) ? { backgroundColor: role.color } : {}}
                            >
                                {role.name}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200/60 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">TIER</span>
                        {tierRoles.map(tier => (
                            <button
                                key={tier.id}
                                onClick={() => setSelectedTiers(prev => prev.includes(tier.id) ? prev.filter(t => t !== tier.id) : [...prev, tier.id])}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                    selectedTiers.includes(tier.id) 
                                        ? "text-white shadow-md" 
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                                style={selectedTiers.includes(tier.id) ? { backgroundColor: tier.color } : {}}
                            >
                                {tier.name}
                            </button>
                        ))}
                        <button
                            onClick={() => setSelectedTiers(prev => prev.includes('NONE') ? prev.filter(t => t !== 'NONE') : [...prev, 'NONE'])}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                selectedTiers.includes('NONE') 
                                    ? "bg-slate-800 text-white shadow-md shadow-slate-800/20" 
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >
                            БЕЗ TIER
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
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
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[280px]">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[25%] text-center">NICKNAME</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Роль</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">TIER</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Управление</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedMembers.map(member => (
                                    <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={member.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.discordUsername)}&background=random`} 
                                                    alt={member.discordUsername} 
                                                    className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm"
                                                />
                                                <div>
                                                    <p className="text-[13px] font-bold text-slate-900">{member.discordUsername}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{member.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                <p className="text-[13px] font-bold text-slate-900">{member.gameNickname || '—'}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {getRoleBadge(member.roleId)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {getTierBadge(member.tierRoleId)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-1 text-[12px]">
                                                {canEdit && (
                                                    <button 
                                                        onClick={() => openProfile(member)}
                                                        className="w-8 h-8 flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                                        title="Профиль участника"
                                                    >
                                                        <UserCog className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canKick && (
                                                    <button 
                                                        onClick={() => openKick(member)}
                                                        className="w-8 h-8 flex items-center justify-center text-rose-600 bg-rose-50/50 hover:bg-rose-100 rounded-lg transition-all shadow-sm active:scale-[0.98] border border-rose-100"
                                                        title="Исключить участника"
                                                    >
                                                        <UserX className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
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

            {/* Modal: Edit Member */}
            {editMember && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[420px] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                                    <UserCog className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-[16px] font-bold text-slate-900 leading-tight">Профиль участника</h3>
                                    <p className="text-[12px] text-slate-500 font-medium">Редактирование данных</p>
                                </div>
                            </div>
                            <button onClick={closeModals} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="mb-6 flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <img 
                                    src={editMember.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(editMember.discordUsername)}&background=random`} 
                                    alt="avatar" 
                                    className="w-12 h-12 rounded-full shadow-sm ring-2 ring-white" 
                                />
                                <div>
                                    <p className="text-[14px] font-bold text-slate-900 leading-snug">{editMember.discordUsername}</p>
                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{editMember.discordId}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block ml-1">Nickname</label>
                                    <input 
                                        type="text" 
                                        value={editNick}
                                        onChange={(e) => setEditNick(formatNick(e.target.value))}
                                        placeholder="Имя Фамилия"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block ml-1">Роль</label>
                                        <select 
                                            value={editRoleId || ''}
                                            onChange={(e) => setEditRoleId(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                                        >
                                            <option value="" disabled>Выберите роль</option>
                                            {mainRoles.map(role => (
                                                <option key={role.id} value={role.id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block ml-1">TIER</label>
                                        <select 
                                            value={editTierRoleId || 'NONE'}
                                            onChange={(e) => setEditTierRoleId(e.target.value === 'NONE' ? null : e.target.value)}
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm appearance-none cursor-pointer"
                                        >
                                            <option value="NONE">БЕЗ TIER</option>
                                            {tierRoles.map(tier => (
                                                <option key={tier.id} value={tier.id}>{tier.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="mt-5 p-3 rounded-xl bg-rose-50 border border-rose-100 flex gap-2.5 text-rose-600 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <p className="text-[12px] font-medium leading-relaxed">{errorMsg}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button 
                                onClick={handleSave}
                                disabled={updateMemberMutation.isPending}
                                className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[13px] font-bold hover:bg-slate-800 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                            >
                                {updateMemberMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
                            </button>
                            <button 
                                onClick={closeModals}
                                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-[13px] font-bold hover:bg-slate-50 transition-all shadow-sm"
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Modal: Kick Member */}
            {kickMember && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[420px] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-rose-100 flex justify-between items-center bg-rose-50/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
                                    <UserX className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-[16px] font-bold text-rose-950 leading-tight">Исключение участника</h3>
                                    <p className="text-[12px] text-rose-600/70 font-medium">Это действие необратимо</p>
                                </div>
                            </div>
                            <button onClick={closeModals} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="mb-6 flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <img 
                                        src={kickMember.discordAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(kickMember.discordUsername)}&background=random`} 
                                        alt="avatar" 
                                        className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white" 
                                    />
                                    <div>
                                        <p className="text-[14px] font-bold text-slate-900 leading-snug">{kickMember.discordUsername}</p>
                                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{kickMember.discordId}</p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col justify-center">
                                    <p className="text-[13px] font-bold text-slate-900">{kickMember.gameNickname}</p>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block ml-1 flex items-center justify-between">
                                        <span>Причина исключения</span>
                                        <span className="text-rose-400">*</span>
                                    </label>
                                    <textarea 
                                        value={kickReason}
                                        onChange={(e) => setKickReason(e.target.value)}
                                        placeholder="Обязательно укажите причину кика (видна в логах и архиве)..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm resize-none custom-scrollbar"
                                    />
                                </div>

                                <label className="flex items-start gap-3 p-4 border border-rose-100 rounded-2xl cursor-pointer hover:bg-rose-50/50 transition-colors group">
                                    <div className="relative flex items-center mt-0.5">
                                        <input 
                                            type="checkbox" 
                                            checked={addToBlacklist}
                                            onChange={(e) => setAddToBlacklist(e.target.checked)}
                                            className="peer sr-only"
                                        />
                                        <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-rose-500 peer-checked:border-rose-500 transition-colors flex items-center justify-center group-hover:border-rose-400 peer-checked:group-hover:border-rose-500">
                                            <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-bold text-rose-900 flex items-center gap-1.5">
                                            Занести в Черный список (ЧС)
                                            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                        </p>
                                        <p className="text-[11px] text-rose-600/70 mt-1 leading-snug">Участник потеряет возможность оставлять заявки, бот не будет на него реагировать.</p>
                                    </div>
                                </label>
                            </div>

                            {kickErrorMsg && (
                                <div className="mt-5 p-3 rounded-xl bg-orange-50 border border-orange-100 flex gap-2.5 text-orange-700 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <p className="text-[12px] font-medium leading-relaxed">{kickErrorMsg}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-rose-100 bg-rose-50/30 flex gap-3">
                            <button 
                                onClick={handleKick}
                                disabled={kickMemberMutation.isPending}
                                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-[13px] font-bold hover:bg-rose-700 active:scale-[0.98] transition-all shadow-[0_2px_12px_rgba(225,29,72,0.2)] disabled:opacity-50"
                            >
                                {kickMemberMutation.isPending ? 'Выполнение...' : 'Подтвердить исключение'}
                            </button>
                            <button 
                                onClick={closeModals}
                                className="px-5 py-2.5 bg-white border border-rose-200 text-rose-700 rounded-xl text-[13px] font-bold hover:bg-rose-50 transition-all shadow-sm"
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
}

