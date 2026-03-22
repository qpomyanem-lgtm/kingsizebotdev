import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/api';
import { Hash, Save, AlertCircle, Loader2, Ticket, Calendar, Moon, Activity, ListChecks, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SystemSetting {
  key: string;
  value: string | null;
}

export function ChannelSettings() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useAuth();

  const [ticketsChannelId, setTicketsChannelId] = useState('');
  const [eventsChannelId, setEventsChannelId] = useState('');
  const [eventMclChannelId, setEventMclChannelId] = useState('');
  const [eventCaptChannelId, setEventCaptChannelId] = useState('');
  const [eventMclVoiceChannelId, setEventMclVoiceChannelId] = useState('');
  const [eventCaptVoiceChannelId, setEventCaptVoiceChannelId] = useState('');
  const [afkChannelId, setAfkChannelId] = useState('');
  const [onlineChannelId, setOnlineChannelId] = useState('');
  const [activityForumChannelId, setActivityForumChannelId] = useState('');

  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const { data: systemSettingsData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const response = await api.get<SystemSetting[]>('/api/settings/system');
      return response.data;
    },
    enabled: !!currentUser && currentUser.permissions?.includes('site:settings_channels:view')
  });

  useEffect(() => {
    if (systemSettingsData) {
      setTicketsChannelId(systemSettingsData.find(s => s.key === 'TICKETS_CHANNEL_ID')?.value || '');
      setEventsChannelId(systemSettingsData.find(s => s.key === 'EVENTS_CHANNEL_ID')?.value || '');
      setEventMclChannelId(systemSettingsData.find(s => s.key === 'EVENT_MCL_CHANNEL_ID')?.value || '');
      setEventCaptChannelId(systemSettingsData.find(s => s.key === 'EVENT_CAPT_CHANNEL_ID')?.value || '');
      setEventMclVoiceChannelId(systemSettingsData.find(s => s.key === 'EVENT_MCL_VOICE_CHANNEL_ID')?.value || '');
      setEventCaptVoiceChannelId(systemSettingsData.find(s => s.key === 'EVENT_CAPT_VOICE_CHANNEL_ID')?.value || '');
      setAfkChannelId(systemSettingsData.find(s => s.key === 'AFK_CHANNEL_ID')?.value || '');
      setOnlineChannelId(systemSettingsData.find(s => s.key === 'ONLINE_CHANNEL_ID')?.value || '');
      setActivityForumChannelId(systemSettingsData.find(s => s.key === 'ACTIVITY_FORUM_CHANNEL_ID')?.value || '');
    }
  }, [systemSettingsData]);

  const saveMutation = useMutation({
    mutationFn: async (updates: { key: string, value: string | null }[]) => {
      await api.patch('/api/settings/system', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      setSaveMessage({ type: 'success', text: 'Настройки каналов успешно сохранены. Эмбеды будут автоматически пересозданы.' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
    onError: () => {
      setSaveMessage({ type: 'error', text: 'Ошибка при сохранении настроек.' });
      setTimeout(() => setSaveMessage(null), 5000);
    }
  });

  const handleSave = () => {
    const getUpdatePayload = (key: string, newValue: string, oldData: SystemSetting[] | undefined, messageKey: string) => {
      const oldValue = oldData?.find(s => s.key === key)?.value || '';
      if (oldValue !== newValue) {
        // If the channel changed, we nullify the MESSAGE_ID so the bot recreates it in the new channel
        return [
          { key, value: newValue || null },
          { key: messageKey, value: null } // reset message ID to trigger re-deploy
        ];
      }
      return [];
    };

    let updates: { key: string, value: string | null }[] = [
      ...getUpdatePayload('TICKETS_CHANNEL_ID', ticketsChannelId, systemSettingsData, 'TICKETS_MESSAGE_ID'),
      ...getUpdatePayload('EVENTS_CHANNEL_ID', eventsChannelId, systemSettingsData, 'EVENTS_MESSAGE_ID'),
      ...getUpdatePayload('AFK_CHANNEL_ID', afkChannelId, systemSettingsData, 'AFK_MESSAGE_ID'),
      ...getUpdatePayload('ONLINE_CHANNEL_ID', onlineChannelId, systemSettingsData, 'ONLINE_MESSAGE_ID'),
    ];

    // EVENT_MCL_CHANNEL_ID and EVENT_CAPT_CHANNEL_ID don't have MESSAGE_IDs to reset
    const oldMclChannelId = systemSettingsData?.find(s => s.key === 'EVENT_MCL_CHANNEL_ID')?.value || '';
    if (oldMclChannelId !== eventMclChannelId) {
      updates.push({ key: 'EVENT_MCL_CHANNEL_ID', value: eventMclChannelId || null });
    }
    const oldCaptChannelId = systemSettingsData?.find(s => s.key === 'EVENT_CAPT_CHANNEL_ID')?.value || '';
    if (oldCaptChannelId !== eventCaptChannelId) {
      updates.push({ key: 'EVENT_CAPT_CHANNEL_ID', value: eventCaptChannelId || null });
    }

    const oldMclVoiceId = systemSettingsData?.find(s => s.key === 'EVENT_MCL_VOICE_CHANNEL_ID')?.value || '';
    if (oldMclVoiceId !== eventMclVoiceChannelId) {
      updates.push({ key: 'EVENT_MCL_VOICE_CHANNEL_ID', value: eventMclVoiceChannelId || null });
    }
    const oldCaptVoiceId = systemSettingsData?.find(s => s.key === 'EVENT_CAPT_VOICE_CHANNEL_ID')?.value || '';
    if (oldCaptVoiceId !== eventCaptVoiceChannelId) {
      updates.push({ key: 'EVENT_CAPT_VOICE_CHANNEL_ID', value: eventCaptVoiceChannelId || null });
    }

    const oldActivityForumId = systemSettingsData?.find(s => s.key === 'ACTIVITY_FORUM_CHANNEL_ID')?.value || '';
    if (oldActivityForumId !== activityForumChannelId) {
      updates.push({ key: 'ACTIVITY_FORUM_CHANNEL_ID', value: activityForumChannelId || null });
    }

    if (updates.length > 0) {
      saveMutation.mutate(updates);
    } else {
      setSaveMessage({ type: 'success', text: 'Нет изменений для сохранения.' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const hasChanges = 
    ticketsChannelId !== (systemSettingsData?.find(s => s.key === 'TICKETS_CHANNEL_ID')?.value || '') ||
    eventsChannelId !== (systemSettingsData?.find(s => s.key === 'EVENTS_CHANNEL_ID')?.value || '') ||
    eventMclChannelId !== (systemSettingsData?.find(s => s.key === 'EVENT_MCL_CHANNEL_ID')?.value || '') ||
    eventCaptChannelId !== (systemSettingsData?.find(s => s.key === 'EVENT_CAPT_CHANNEL_ID')?.value || '') ||
    eventMclVoiceChannelId !== (systemSettingsData?.find(s => s.key === 'EVENT_MCL_VOICE_CHANNEL_ID')?.value || '') ||
    eventCaptVoiceChannelId !== (systemSettingsData?.find(s => s.key === 'EVENT_CAPT_VOICE_CHANNEL_ID')?.value || '') ||
    afkChannelId !== (systemSettingsData?.find(s => s.key === 'AFK_CHANNEL_ID')?.value || '') ||
    onlineChannelId !== (systemSettingsData?.find(s => s.key === 'ONLINE_CHANNEL_ID')?.value || '') ||
    activityForumChannelId !== (systemSettingsData?.find(s => s.key === 'ACTIVITY_FORUM_CHANNEL_ID')?.value || '');

  if (isAuthLoading || isSettingsLoading) {
    return <div className="text-white">Загрузка...</div>;
  }

  if (!currentUser?.permissions?.includes('site:settings_channels:view')) {
    return (
      <div className="bg-red-900/50 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-center gap-3">
        <AlertCircle size={24} />
        <p>У вас нет доступа к настройкам системы.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
            <Hash className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">НАСТРОЙКА КАНАЛОВ</h1>
            <p className="text-slate-500 text-[14px] font-medium tracking-wide">
              Укажите ID каналов в Discord, куда бот автоматически отправит панели управления.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[14px] transition-all duration-300 shadow-sm",
            hasChanges && !saveMutation.isPending
              ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-[0_4px_16px_rgba(15,23,42,0.2)] hover:-translate-y-0.5"
              : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
          )}
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </header>

      {saveMessage && (
        <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 border ${saveMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <p className="text-[14px] font-medium">{saveMessage.text}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar">
        <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Каналы системы</h2>
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-xs font-semibold tracking-wider text-slate-500 uppercase py-4 px-6 w-[280px]">Назначение панели</th>
                <th className="text-xs font-semibold tracking-wider text-slate-500 uppercase py-4 px-6">ID текстового канала</th>
              </tr>
            </thead>
            <tbody>
              {/* Tickets */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Подача заявок</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Кнопка создания тикета-заявки</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={ticketsChannelId}
                      onChange={(e) => setTicketsChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Events */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Панель создания списков</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Кнопка создания списка на мероприятие</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={eventsChannelId}
                      onChange={(e) => setEventsChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Event MCL Channel */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                    <ListChecks className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Списки MCL / ВЗЗ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Канал для отправки списков MCL и ВЗЗ</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={eventMclChannelId}
                      onChange={(e) => setEventMclChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Event Capt Channel */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                    <ListChecks className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Списки Капт</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Канал для отправки списков Капт</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={eventCaptChannelId}
                      onChange={(e) => setEventCaptChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Event MCL Voice Channel */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Голосовой канал MCL / ВЗЗ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Голосовой канал для мероприятий MCL и ВЗЗ</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={eventMclVoiceChannelId}
                      onChange={(e) => setEventMclVoiceChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Event Capt Voice Channel */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Голосовой канал Капт</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Голосовой канал для мероприятий Капт</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={eventCaptVoiceChannelId}
                      onChange={(e) => setEventCaptVoiceChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* AFK */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Отпуск (АФК)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Уход в АФК и список отдыхающих</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={afkChannelId}
                      onChange={(e) => setAfkChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Online Settings */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Статус Сервера Phoenix</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Живой мониторинг онлайна сервера</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={onlineChannelId}
                      onChange={(e) => setOnlineChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>

              {/* Activity Forum */}
              <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-500 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-[13px] text-slate-800">Форум активности</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">ID форума, где создаются ветки скриншотов</div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={activityForumChannelId}
                      onChange={(e) => setActivityForumChannelId(e.target.value)}
                      placeholder="Пример: 123456789012345678"
                      className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
