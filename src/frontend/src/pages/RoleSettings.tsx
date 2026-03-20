import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Save, Loader2, Lock, Crown, Star, Users, Target, CheckCircle, Component, Hash } from 'lucide-react';
import { cn } from '../lib/utils';
import { api, useAuth } from '../lib/api';

const roleMetaMap: Record<string, { title: string; desc: string; icon: any; colorClass: string }> = {
  'OWNER': { title: 'Владелец (OWNER)', desc: 'Полный доступ ко всем функциям', icon: Crown, colorClass: 'bg-amber-50 text-amber-500' },
  '.': { title: 'Администратор (.)', desc: 'Управление ролями и настройками', icon: Shield, colorClass: 'bg-rose-50 text-rose-500' },
  'DEP': { title: 'Заместитель (DEP)', desc: 'Управление составом и мероприятиями', icon: Star, colorClass: 'bg-indigo-50 text-indigo-500' },
  'HIGH': { title: 'Старший состав (HIGH)', desc: 'Основные функции модерации', icon: Target, colorClass: 'bg-purple-50 text-purple-500' },
  'RECRUIT': { title: 'Рекрутер (RECRUIT)', desc: 'Управление заявками на вступление', icon: Users, colorClass: 'bg-blue-50 text-blue-500' },
  'TIER CHECK': { title: 'Проверка рангов (TIER)', desc: 'Проверка и выдача тиров', icon: CheckCircle, colorClass: 'bg-emerald-50 text-emerald-500' },
  'BLACKLIST': { title: 'Черный список', desc: 'Роль для заблокированных', icon: Shield, colorClass: 'bg-slate-50 text-slate-500' }
};

const defaultMeta = { title: 'Системная роль', desc: 'Дополнительная роль доступа', icon: Component, colorClass: 'bg-slate-50 text-slate-500' };

interface RoleSetting {
  key: string;
  name: string;
  discordRoleId: string | null;
  requiresAdmin: boolean;
}

export function RoleSettings() {
  const queryClient = useQueryClient();
  
  const { data: currentUser, isLoading: isAuthLoading } = useAuth();
  
  const [localRoles, setLocalRoles] = useState<Record<string, string>>({});

  const { data: roles, isLoading, isError } = useQuery({
    queryKey: ['roleSettings'],
    queryFn: async () => {
      const response = await api.get<RoleSetting[]>('/api/settings/roles');
      return response.data;
    }
  });



  // Sync state initially when data loads
  useEffect(() => {
    if (roles) {
      const initialMap: Record<string, string> = {};
      roles.forEach((r: RoleSetting) => {
        initialMap[r.key] = r.discordRoleId || '';
      });
      setLocalRoles(initialMap);
    }
  }, [roles]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Array<{ key: string, discordRoleId: string | null }>) => {
      await api.patch('/api/settings/roles', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roleSettings'] });
    }
  });

  const handleInputChange = (key: string, value: string) => {
    setLocalRoles(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const updates = Object.entries(localRoles).map(([key, rawValue]) => {
      const val = rawValue.trim();
      return {
        key,
        discordRoleId: val.length > 0 ? val : null
      };
    });
    
    // Fire role updates
    if (updates.length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges = roles?.some((r: RoleSetting) => {
    const val = (localRoles[r.key] || '').trim();
    const original = r.discordRoleId || '';
    return val !== original;
  });

  // Access Control Check
  if (isAuthLoading) {
    return (
      <div className="h-full flex flex-col font-sans">
        <header className="mb-8">
           <div className="h-10 w-64 bg-slate-200 animate-pulse rounded-xl mb-2" />
           <div className="h-5 w-96 bg-slate-100 animate-pulse rounded-lg" />
        </header>
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
        </div>
      </div>
    );
  }

  const hasAccess = currentUser?.roleSettingsAccess === true;

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col font-sans">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">НАСТРОЙКА РОЛЕЙ</h1>
            <p className="text-slate-500 text-[14px] font-medium tracking-wide">
              Привязка Discord ролей для контроля доступа в панель семьи.
            </p>
          </div>
        </header>

        <div className="flex-1 bg-white rounded-[32px] border border-rose-100 shadow-[0_2px_12px_rgba(225,29,72,0.02)] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-50/50 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm ring-4 ring-white">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Доступ запрещен</h2>
            <p className="text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
              Только создатель семьи (OWNER) и администратор имеют права для изменения системных привязок ролей.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  if (isError || !roles) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-rose-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Не удалось загрузить роли</h2>
          <p className="text-slate-500">Попробуйте обновить страницу или проверить соединение с сервером.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">НАСТРОЙКА РОЛЕЙ</h1>
          <p className="text-slate-500 text-[14px] font-medium tracking-wide">
            Привязка Discord ролей для контроля доступа в панель семьи.
          </p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[14px] transition-all duration-300 shadow-sm",
            hasChanges && !updateMutation.isPending
              ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-[0_4px_16px_rgba(15,23,42,0.2)] hover:-translate-y-0.5"
              : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
          )}
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar">

        <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Настройки</h2>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[280px]">Роль</th>
                <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">Значение / ID</th>
              </tr>
            </thead>
            <tbody>
              {roles?.map((role: RoleSetting) => {
                const meta = roleMetaMap[role.key] || { ...defaultMeta, title: role.key };
                const Icon = meta.icon;

                return (
                  <tr key={role.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30 transition-colors">
                    <td className="py-3 px-4 flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.colorClass)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-[13px] text-slate-800">{meta.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{meta.desc}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Hash className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={localRoles[role.key] || ''}
                          onChange={(e) => handleInputChange(role.key, e.target.value)}
                          placeholder="Пример: 123456789012345678"
                          className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                        />
                        {!localRoles[role.key]?.trim() && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" title="Требуется ID" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
