import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoscowDate } from '../lib/time';

export interface ApplicationArchive {
    id: string;
    discordId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    field1: string;
    field2: string;
    field3: string;
    field4: string;
    field5: string;
    status: 'pending' | 'interview' | 'accepted' | 'rejected' | 'excluded' | 'blacklist';
    createdAt: string;
    handledByAdminUsername: string | null;
    updatedAt: string;
    rejectionReason: string | null;
}

export function Archive() {
    const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
    const [selectedApp, setSelectedApp] = useState<ApplicationArchive | null>(null);

    const { data: applications, isLoading } = useQuery<ApplicationArchive[]>({
        queryKey: ['applications'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications');
            return data;
        }
    });

    const { data: fieldLabels } = useQuery<{ key: string, label: string }[]>({
        queryKey: ['application-fields'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications/fields');
            return data;
        }
    });

    const archivedApps = applications?.filter(app => {
        const isArchivedStatus = ['accepted', 'rejected', 'excluded', 'blacklist'].includes(app.status);
        if (!isArchivedStatus) return false;
        
        if (filter === 'all') return true;
        // Excluded and blacklisted apps were originally accepted, so show them under "Принятые"
        if (filter === 'accepted') return app.status === 'accepted' || app.status === 'excluded' || app.status === 'blacklist';
        return app.status === filter;
    }) || [];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'accepted': return <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Принят</span>;
            case 'rejected': return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Отклонен</span>;
            case 'excluded': return <span className="px-2.5 py-1 bg-slate-200 text-slate-800 rounded-full text-xs font-medium">Исключен</span>;
            case 'blacklist': return <span className="px-2.5 py-1 bg-stone-200 text-stone-800 rounded-full text-xs font-medium">ЧС</span>;
            default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-2">Архив заявок</h1>
                    <p className="text-slate-500 text-[13px] font-medium tracking-wide">История всех рассмотренных заявок.</p>
                </div>
                <div className="flex gap-2 text-sm">
                    <button 
                        onClick={() => setFilter('all')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        Все
                    </button>
                    <button 
                        onClick={() => setFilter('accepted')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'accepted' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-200 hover:bg-green-50'}`}
                    >
                        Принятые
                    </button>
                    <button 
                        onClick={() => setFilter('rejected')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'rejected' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'}`}
                    >
                        Отклоненные
                    </button>
                </div>
            </header>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"></div>
                    </div>
                ) : archivedApps.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-400 text-[15px]">В этой категории архива нет заявок</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Пользователь</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Статус</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Изменено</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {archivedApps.map(app => (
                                    <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={app.discordAvatarUrl || `https://ui-avatars.com/api/?name=${app.discordUsername}&background=random`} 
                                                    alt={app.discordUsername} 
                                                    className={`w-10 h-10 rounded-full ${app.status !== 'accepted' ? 'grayscale' : ''}`}
                                                />
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{app.discordUsername}</p>
                                                    <p className="text-xs text-slate-500 font-mono">{app.discordId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {(app.status === 'excluded' || app.status === 'blacklist') && (
                                                    <>
                                                        <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium opacity-60">Принят</span>
                                                        <span className="text-slate-400 text-xs">→</span>
                                                    </>
                                                )}
                                                {getStatusBadge(app.status)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-slate-600">
                                                {formatMoscowDate(app.updatedAt)}
                                            </div>
                                            {app.handledByAdminUsername && (
                                                <div className="text-xs text-slate-400 mt-1">
                                                    Администратор: <span className="font-medium text-slate-600">{app.handledByAdminUsername}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => setSelectedApp(app)}
                                                className="px-3 py-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-colors cursor-pointer"
                                            >
                                                Посмотреть заявку
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Application Details Modal */}
            {selectedApp && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[24px] shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-slate-900">Заявка от {selectedApp.discordUsername}</h2>
                                {getStatusBadge(selectedApp.status)}
                            </div>
                            <button 
                                onClick={() => setSelectedApp(null)}
                                className="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 text-sm space-y-6">
                            
                            {selectedApp.status === 'rejected' && selectedApp.rejectionReason && (
                                <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                                    <h3 className="font-semibold text-red-900 mb-1">Причина отклонения</h3>
                                    <p className="text-red-800">{selectedApp.rejectionReason}</p>
                                </div>
                            )}

                            {[1, 2, 3, 4, 5].map(num => (
                                <div key={num}>
                                    <h3 className="font-semibold text-slate-900 mb-2">{fieldLabels?.[num - 1]?.label || `Вопрос ${num}`}</h3>
                                    <p className="text-slate-600 bg-slate-50 p-4 rounded-xl whitespace-pre-wrap border border-slate-100">
                                        {(selectedApp as any)[`field${num}`]}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-[24px] flex justify-between items-center">
                            <div className="text-xs text-slate-500">
                                Обработано: {formatMoscowDate(selectedApp.updatedAt)} ({selectedApp.handledByAdminUsername || 'Система'})
                            </div>
                            <button 
                                onClick={() => setSelectedApp(null)}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
