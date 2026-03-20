import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Map, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface EventMap {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: string;
}

export function MclMaps() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: maps = [], isLoading } = useQuery<EventMap[]>({
    queryKey: ['eventMaps'],
    queryFn: async () => {
      const { data } = await api.get('/api/maps');
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: { name: string; imageUrl: string }) => {
      await api.post('/api/maps', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventMaps'] });
      setNewName('');
      setNewImageUrl('');
      setMessage({ type: 'success', text: 'Карта успешно добавлена!' });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Ошибка при добавлении карты.' });
      setTimeout(() => setMessage(null), 4000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/maps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventMaps'] });
      setMessage({ type: 'success', text: 'Карта удалена.' });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Ошибка при удалении карты.' });
      setTimeout(() => setMessage(null), 4000);
    },
  });

  const handleAdd = () => {
    if (!newName.trim() || !newImageUrl.trim()) return;
    addMutation.mutate({ name: newName.trim(), imageUrl: newImageUrl.trim() });
  };

  return (
    <div className="h-full flex flex-col font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">КАРТЫ MCL ВЗЗ</h1>
          <p className="text-slate-500 text-[14px] font-medium tracking-wide">
            Управление картами для мероприятий MCL и ВЗЗ.
          </p>
        </div>
      </header>

      {message && (
        <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 border ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <p className="text-[14px] font-medium">{message.text}</p>
        </div>
      )}

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 mb-6">
        <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-4">Добавить карту</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1 max-w-[280px]">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Название
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например, Mirror"
              className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg px-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Ссылка на изображение
            </label>
            <input
              type="text"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder="https://cdn.discordapp.com/..."
              className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg px-3 py-2 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-mono"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newImageUrl.trim() || addMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-[13px] transition-all duration-300 shrink-0",
              newName.trim() && newImageUrl.trim() && !addMutation.isPending
                ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-[0_4px_16px_rgba(15,23,42,0.2)] hover:-translate-y-0.5"
                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
            )}
          >
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Добавить
          </button>
        </div>
      </div>

      {/* Maps table */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar">
        <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">
          Список карт ({maps.length})
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : maps.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Map className="w-10 h-10 text-slate-300" />
              <p className="text-slate-400 text-[14px]">Пока нет добавленных карт</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[60px]">
                    Превью
                  </th>
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">
                    Название
                  </th>
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">
                    Ссылка
                  </th>
                  <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {maps.map((map) => (
                  <tr key={map.id} className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={map.imageUrl}
                          alt={map.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-4 h-4 text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>';
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[13px] text-slate-800">{map.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={map.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-indigo-500 hover:text-indigo-700 font-mono truncate max-w-[300px] block flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{map.imageUrl}</span>
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => deleteMutation.mutate(map.id)}
                        disabled={deleteMutation.isPending}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        title="Удалить карту"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
