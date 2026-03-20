import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, Save, Loader2, Lock, RefreshCcw, CheckCircle2, Hash } from 'lucide-react';
import { cn } from '../lib/utils';
import { api, useAuth } from '../lib/api';

export function ServerSettings() {
  const queryClient = useQueryClient();
  
  const { data: currentUser, isLoading: isAuthLoading } = useAuth();
  
  const [localGuildId, setLocalGuildId] = useState<string>('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [confirmSync, setConfirmSync] = useState(false);

  const { data: systemSettingsData, isLoading, isError } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const response = await api.get<{key: string, value: string | null}[]>('/api/settings/system');
      return response.data;
    },
    enabled: !!currentUser && currentUser.roleSettingsAccess === true
  });

  useEffect(() => {
    if (systemSettingsData) {
      const guildSetting = systemSettingsData.find(s => s.key === 'GUILD_ID');
      if (guildSetting && guildSetting.value) {
        setLocalGuildId(guildSetting.value);
      }
    }
  }, [systemSettingsData]);

  const updateSystemMutation = useMutation({
    mutationFn: async (updates: Array<{ key: string, value: string | null }>) => {
      await api.patch('/api/settings/system', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
    }
  });

  const syncMembersMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean, added: number, updated: number, kicked: number, totalFound: number }>('/api/settings/sync-members');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setSyncMessage(`Синхронизация завершена. Найдено с ролями: ${data.totalFound}. Добавлено: ${data.added}, Обновлено: ${data.updated}, Исключено: ${data.kicked}.`);
      setTimeout(() => setSyncMessage(null), 8000);
    },
    onError: (error: any) => {
      setSyncMessage(`Ошибка синхронизации: ${error.response?.data?.error || error.message}`);
      setTimeout(() => setSyncMessage(null), 8000);
    }
  });

  const handleSave = () => {
    const originalGuildId = systemSettingsData?.find(s => s.key === 'GUILD_ID')?.value || '';
    if (localGuildId.trim() !== originalGuildId) {
      updateSystemMutation.mutate([{ key: 'GUILD_ID', value: localGuildId.trim() || null }]);
    }
  };

  const hasChanges = localGuildId.trim() !== (systemSettingsData?.find(s => s.key === 'GUILD_ID')?.value || '');

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
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">НАСТРОЙКИ СЕРВЕРА</h1>
            <p className="text-slate-500 text-[14px] font-medium tracking-wide">
              Основные системные настройки и параметры Discord сервера семьи.
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
              Только создатель семьи (OWNER) и администратор имеют права для изменения системных настроек сервера.
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

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Server className="w-12 h-12 text-rose-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Не удалось загрузить настройки</h2>
          <p className="text-slate-500">Попробуйте обновить страницу или проверить соединение с сервером.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">НАСТРОЙКИ СЕРВЕРА</h1>
          <p className="text-slate-500 text-[14px] font-medium tracking-wide">
            Основные системные настройки Discord сервера семьи.
          </p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateSystemMutation.isPending}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[14px] transition-all duration-300 shadow-sm",
            hasChanges && !updateSystemMutation.isPending
              ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-[0_4px_16px_rgba(15,23,42,0.2)] hover:-translate-y-0.5"
              : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
          )}
        >
          {updateSystemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {updateSystemMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar space-y-8">

        {/* System parameters section */}
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Системные параметры</h2>
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[280px]">Параметр</th>
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">Значение / ID</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
                  <td className="py-3 px-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-[13px] text-slate-800">ID Сервера (Guild ID)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Идентификатор Discord сервера семьи</div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="relative max-w-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Hash className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={localGuildId}
                        onChange={(e) => setLocalGuildId(e.target.value)}
                        placeholder="Пример: 123456789012345678"
                        className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                      />
                      {!localGuildId?.trim() && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" title="Обязательно" />
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Tools and Actions section */}
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Инструменты и действия</h2>
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[280px]">Инструмент</th>
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">Управление</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
                  <td className="py-3 px-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                      <RefreshCcw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-[13px] text-slate-800">Синхронизация состава</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 max-w-[220px]" title="Проводит глубокую проверку всех участников Discord-сервера. Автоматически добавляет новых участников с ролями KINGSIZE/NEWKINGSIZE, обновляет их тиры (TIER 1/2/3) и исключает тех, кто потерял главные роли состава. Будьте внимательны, операция может занять несколько секунд.">
                        Проверка и обновление ролей, тиров у всех участников сервера
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                     <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <button
                          onClick={() => {
                             if (confirmSync) {
                                syncMembersMutation.mutate();
                                setConfirmSync(false);
                             } else {
                                setConfirmSync(true);
                                setTimeout(() => setConfirmSync(false), 3000);
                             }
                          }}
                          disabled={syncMembersMutation.isPending}
                          className={cn(
                            "flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 border font-semibold text-[12px] rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none w-max",
                            confirmSync 
                              ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100" 
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
                          )}
                        >
                           {syncMembersMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <RefreshCcw className={cn("w-3.5 h-3.5", confirmSync ? "text-rose-500" : "text-slate-400")} />}
                           {syncMembersMutation.isPending ? 'Синхронизация...' : confirmSync ? 'Подтвердить запуск' : 'Выполнить синхронизацию'}
                        </button>

                        {syncMessage && (
                          <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border w-max animate-in fade-in slide-in-from-bottom-2 duration-300 ${syncMessage.includes('Ошибка') ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[250px]">{syncMessage}</span>
                          </div>
                        )}
                     </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
