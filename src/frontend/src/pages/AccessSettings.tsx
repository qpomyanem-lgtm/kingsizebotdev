import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, KeyRound, Loader2, Search, Shield, CircleSlash } from 'lucide-react';
import { api, useAuth } from '../lib/api';
import { cn } from '../lib/utils';

type RoleType = 'system' | 'access' | 'none';
type SystemType = 'main' | 'new' | 'tier' | 'blacklist' | 'interview' | null;

interface Role {
  id: string;
  name: string;
  discordRoleId: string | null;
  color: string;
  icon: string | null;
  priority: number;
  type: RoleType;
  systemType: SystemType;
  isAdmin: boolean;
  canManageSettings: boolean;
  isEveryone: boolean;
}

/* ── Permission → page mapping ────────────────────────── */

interface PageRow {
  section?: string;
  label: string;
  viewPerm?: string;
  actionPerm?: string;
}

const PAGE_ROWS: PageRow[] = [
  { section: 'Рекруты', label: 'Заявки', viewPerm: 'site:applications:view', actionPerm: 'site:applications:actions' },
  { label: 'Конструктор анкеты', viewPerm: 'site:application_settings:view', actionPerm: 'site:application_settings:actions' },
  { label: 'Активность', viewPerm: 'site:activity:view', actionPerm: 'site:activity:actions' },
  { label: 'Памятка', viewPerm: 'site:guide:view' },
  { section: 'Состав', label: 'Участники', viewPerm: 'site:members:view', actionPerm: 'site:members:actions' },
  { label: 'Система АФК', viewPerm: 'site:afk:view', actionPerm: 'site:afk:actions' },
  { section: 'Списки', label: 'MCL ВЗЗ', viewPerm: 'site:mcl:view', actionPerm: 'site:mcl:actions' },
  { label: 'Капты', viewPerm: 'site:captures:view', actionPerm: 'site:captures:actions' },
  { label: 'Карты MCL ВЗЗ', viewPerm: 'site:mcl_maps:view', actionPerm: 'site:mcl_maps:actions' },
  { section: 'Архивы', label: 'Архив заявок', viewPerm: 'site:archive:view' },
  { label: 'Журнал действий', viewPerm: 'site:logs:view' },
  { label: 'Исключённые', viewPerm: 'site:kicked:view', actionPerm: 'site:kicked:actions' },
  { section: 'Настройки', label: 'Настройка сервера', viewPerm: 'site:settings_server:view', actionPerm: 'site:settings_server:actions' },
  { label: 'Настройка ролей', viewPerm: 'site:settings_roles:view', actionPerm: 'site:settings_roles:actions' },
  { label: 'Настройка каналов', viewPerm: 'site:settings_channels:view', actionPerm: 'site:settings_channels:actions' },
  { label: 'Настройка доступа', viewPerm: 'site:settings_access:view', actionPerm: 'site:settings_access:actions' },
  { section: 'Бот', label: 'Создание списков', viewPerm: 'bot:event:create' },
];

export function AccessSettings() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useAuth();
  const canView = !!currentUser?.permissions?.includes('site:settings_access:view');
  const canEdit = !!currentUser?.permissions?.includes('site:settings_access:actions');

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const roleMenuRef = useRef<HTMLDivElement | null>(null);

  /* drafts */
  const [accessDraft, setAccessDraft] = useState({
    type: 'none' as RoleType,
    systemType: null as SystemType,
    isAdmin: false,
    canManageSettings: false,
  });
  const [permDraft, setPermDraft] = useState<Set<string>>(new Set());

  /* save status indicator */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  /* ── queries ──────────────────────────────────────────── */
  const { data: roles = [], isLoading, isError } = useQuery<Role[]>({
    queryKey: ['settings-roles'],
    queryFn: async () => (await api.get('/api/settings/roles')).data,
    enabled: canView,
  });

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.priority - b.priority), [roles]);
  const selectedRole = sortedRoles.find((r) => r.id === selectedRoleId) ?? null;
  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return sortedRoles;
    return sortedRoles.filter((r) => r.name.toLowerCase().includes(q) || (r.discordRoleId || '').toLowerCase().includes(q));
  }, [sortedRoles, roleSearch]);

  useEffect(() => {
    if (!selectedRoleId && sortedRoles.length > 0) setSelectedRoleId(sortedRoles[0].id);
  }, [selectedRoleId, sortedRoles]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!roleMenuRef.current) return;
      if (!roleMenuRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const permissionsQuery = useQuery<string[]>({
    queryKey: ['settings-role-permissions', selectedRoleId],
    queryFn: async () => (await api.get(`/api/settings/roles/${selectedRoleId}/permissions`)).data,
    enabled: !!selectedRoleId && canView,
  });

  /* sync drafts when selected role or its permissions change */
  useEffect(() => {
    if (!selectedRole) return;
    setAccessDraft({
      type: selectedRole.type,
      systemType: selectedRole.systemType,
      isAdmin: selectedRole.isAdmin,
      canManageSettings: selectedRole.canManageSettings,
    });
    setSaveStatus('idle');
  }, [selectedRole]);

  useEffect(() => {
    setPermDraft(new Set(permissionsQuery.data || []));
  }, [permissionsQuery.data]);

  /* ── mutations ─────────────────────────────────────────── */
  const saveAccess = useMutation({
    mutationFn: async (draft: typeof accessDraft) => {
      if (!selectedRoleId) return;
      await api.patch(`/api/settings/roles/${selectedRoleId}/access`, {
        type: draft.type,
        systemType: draft.type === 'system' ? draft.systemType : null,
        isAdmin: draft.isAdmin,
        canManageSettings: draft.canManageSettings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-roles'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const savePermissions = useMutation({
    mutationFn: async (perms: Set<string>) => {
      if (!selectedRoleId) return;
      await api.put(`/api/settings/roles/${selectedRoleId}/permissions`, {
        permissions: [...perms],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-role-permissions', selectedRoleId] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  /* ── debounced auto-save ───────────────────────────────── */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAccessDraft = useRef(accessDraft);
  const latestPermDraft = useRef(permDraft);
  latestAccessDraft.current = accessDraft;
  latestPermDraft.current = permDraft;

  const scheduleSave = useCallback(() => {
    if (!canEdit || !selectedRoleId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await Promise.all([
          saveAccess.mutateAsync(latestAccessDraft.current),
          savePermissions.mutateAsync(latestPermDraft.current),
        ]);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 1000);
  }, [canEdit, selectedRoleId]);

  /* clean up timer on unmount / role switch */
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selectedRoleId]);

  /* ── helpers ───────────────────────────────────────────── */
  const updateAccess = (patch: Partial<typeof accessDraft>) => {
    setAccessDraft((prev) => ({ ...prev, ...patch }));
    scheduleSave();
  };

  const togglePerm = (permission: string) => {
    setPermDraft((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
    scheduleSave();
  };

  /* Which systemTypes are already taken by other roles */
  const takenSystemTypes = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of sortedRoles) {
      if (r.type === 'system' && r.systemType && r.id !== selectedRoleId) {
        if (r.systemType !== 'tier') map[r.systemType] = r.name;
      }
    }
    return map;
  }, [sortedRoles, selectedRoleId]);

  /* ── early returns ─────────────────────────────────────── */
  if (!canView) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Нет доступа к настройке доступа.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Ошибка загрузки настроек доступа.</div>;
  }

  return (
    <div className="h-full flex flex-col font-sans pb-4">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">НАСТРОЙКА ДОСТУПА</h1>
            <p className="text-slate-500 text-[13px] font-medium tracking-wide">Компактное управление правами по ролям.</p>
          </div>
        </div>

        {saveStatus !== 'idle' && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold',
              saveStatus === 'saving' ? 'text-slate-600 bg-slate-100' : 'text-emerald-600 bg-emerald-50',
            )}
          >
            {saveStatus === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранено'}
          </span>
        )}
      </header>

      <div className="mb-3 w-full max-w-sm relative" ref={roleMenuRef}>
        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Роль</label>
        <button
          type="button"
          onClick={() => setRoleMenuOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        >
          <span className="truncate text-left">
            {selectedRole ? `${selectedRole.name}${selectedRole.isEveryone ? ' (@everyone)' : ''}` : 'Выберите роль'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', roleMenuOpen && 'rotate-180')} />
        </button>

        {roleMenuOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="px-2.5 py-2 border-b border-slate-100">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  autoFocus
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Поиск роли"
                  className="w-full text-[12px] bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {filteredRoles.map((role) => {
                const active = role.id === selectedRoleId;
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      setRoleMenuOpen(false);
                      setRoleSearch('');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="text-[12px] font-medium truncate flex-1">{role.name}</span>
                    {role.isEveryone && <span className="text-[10px] text-slate-400 font-semibold">@everyone</span>}
                  </button>
                );
              })}
              {filteredRoles.length === 0 && (
                <div className="py-6 text-center text-[12px] text-slate-400">Ничего не найдено</div>
              )}
            </div>
          </div>
        )}
      </div>

      {!selectedRole ? (
        <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-center text-sm text-slate-500">
          Выберите роль
        </div>
      ) : selectedRole.isEveryone ? (
        <div className="bg-white rounded-[22px] border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-3.5">
          <div className="mb-2.5">
            <h2 className="text-[15px] font-bold text-slate-900">@everyone</h2>
            <p className="text-[12px] text-slate-500">Базовые права участников сервера</p>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Принимать заявки</p>
              <p className="text-[12px] text-slate-500">Разрешить подачу заявок через бота</p>
            </div>
            <input
              type="checkbox"
              checked={permDraft.has('bot:ticket:apply')}
              onChange={() => togglePerm('bot:ticket:apply')}
              disabled={!canEdit}
              className="h-4 w-4 rounded border-slate-300"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <div className="rounded-[18px] border border-slate-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <p className="mb-2.5 text-[13px] font-bold text-slate-900">Флаги доступа</p>
              <div className="space-y-2">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 bg-slate-50/60">
                  <span className="text-[13px] font-medium text-slate-700">Доступ к админ-панели</span>
                  <input
                    type="checkbox"
                    checked={accessDraft.isAdmin}
                    onChange={(e) => updateAccess({ isAdmin: e.target.checked })}
                    disabled={!canEdit}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 bg-slate-50/60">
                  <span className="text-[13px] font-medium text-slate-700">Может управлять настройками</span>
                  <input
                    type="checkbox"
                    checked={accessDraft.canManageSettings}
                    onChange={(e) => updateAccess({ canManageSettings: e.target.checked })}
                    disabled={!canEdit}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <p className="mb-2.5 text-[13px] font-bold text-slate-900">Тип роли</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  disabled={!canEdit}
                  onClick={() => updateAccess({ type: 'system', systemType: accessDraft.systemType || 'tier' })}
                  className={cn(
                    'rounded-xl border p-2.5 text-left transition-all',
                    accessDraft.type === 'system'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <Shield className="mb-1.5 h-4 w-4 text-amber-600" />
                  <p className="text-[12px] font-semibold text-slate-900">Дискорд роль</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">MAIN / NEW / TIER / ЧС / Обзвон</p>
                </button>

                <button
                  disabled={!canEdit}
                  onClick={() => updateAccess({ type: 'access', systemType: null })}
                  className={cn(
                    'rounded-xl border p-2.5 text-left transition-all',
                    accessDraft.type === 'access'
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <KeyRound className="mb-1.5 h-4 w-4 text-emerald-600" />
                  <p className="text-[12px] font-semibold text-slate-900">Роль доступа</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Права панели и бота</p>
                </button>

                <button
                  disabled={!canEdit}
                  onClick={() => updateAccess({ type: 'none', systemType: null })}
                  className={cn(
                    'rounded-xl border p-2.5 text-left transition-all',
                    accessDraft.type === 'none'
                      ? 'border-slate-300 bg-slate-100'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <CircleSlash className="mb-1.5 h-4 w-4 text-slate-500" />
                  <p className="text-[12px] font-semibold text-slate-900">Не настроена</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Без назначения</p>
                </button>
              </div>
            </div>
          </div>

          {accessDraft.type === 'system' && (
            <div className="rounded-[18px] border border-slate-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <p className="mb-2.5 text-[13px] font-bold text-slate-900">Системный тип</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {([
                  { key: 'main', label: 'Основная роль', desc: 'Основная роль члена семьи' },
                  { key: 'new', label: 'Роль новенького', desc: 'Выдаётся при принятии заявки' },
                  { key: 'tier', label: 'Тировая роль', desc: 'Позиция в списках' },
                  { key: 'blacklist', label: 'Чёрный список', desc: 'Выдаётся при ЧС' },
                  { key: 'interview', label: 'Обзвон', desc: 'Выдаётся при статусе обзвона' },
                ] as const).map(({ key, label, desc }) => {
                  const taken = takenSystemTypes[key];
                  return (
                    <button
                      key={key}
                      disabled={!canEdit}
                      onClick={() => updateAccess({ systemType: key })}
                      className={cn(
                        'rounded-xl border p-2.5 text-left transition-all',
                        accessDraft.systemType === key
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <p className="text-[12px] font-semibold text-slate-900">{label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                      {taken && accessDraft.systemType !== key && (
                        <p className="mt-1 text-[11px] font-medium text-amber-600">Уже назначена: {taken}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {accessDraft.type === 'access' && (
            <div className="bg-white rounded-[22px] border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col mb-3">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <p className="text-[13px] font-bold text-slate-900">Разрешения</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Настройка видимости и действий по страницам</p>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30">
                      <th className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Страница</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Видеть</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Взаимодействовать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PAGE_ROWS.map((row, i) => (
                      <tr key={`perm-${i}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          {row.section && (
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{row.section}</div>
                          )}
                          <div className="text-[12px] font-medium text-slate-700">{row.label}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.viewPerm ? (
                            <input
                              type="checkbox"
                              checked={permDraft.has(row.viewPerm)}
                              onChange={() => togglePerm(row.viewPerm!)}
                              disabled={!canEdit}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.actionPerm ? (
                            <input
                              type="checkbox"
                              checked={permDraft.has(row.actionPerm)}
                              onChange={() => togglePerm(row.actionPerm!)}
                              disabled={!canEdit}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
