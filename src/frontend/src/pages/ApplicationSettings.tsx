import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';

interface FieldConfig {
    key: string;
    label: string;
    placeholder: string;
    style: number;
}

export function ApplicationSettings() {
    const queryClient = useQueryClient();
    const [localFields, setLocalFields] = useState<FieldConfig[]>([]);

    const { data: fields, isLoading } = useQuery<FieldConfig[]>({
        queryKey: ['application-fields'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications/fields');
            return data;
        }
    });

    useEffect(() => {
        if (fields) setLocalFields(fields);
    }, [fields]);

    const saveMutation = useMutation({
        mutationFn: async (updatedFields: FieldConfig[]) => {
            await api.patch('/api/applications/fields', { fields: updatedFields });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['application-fields'] });
        }
    });

    const handleChange = (index: number, field: 'label' | 'placeholder' | 'style', value: string | number) => {
        setLocalFields(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
    };

    const handleSave = () => {
        saveMutation.mutate(localFields);
    };

    const hasChanges = fields ? localFields.some((f, i) => 
        f.label !== fields[i]?.label || 
        f.placeholder !== fields[i]?.placeholder ||
        f.style !== fields[i]?.style
    ) : false;

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-2">КОНСТРУКТОР АНКЕТЫ</h1>
                    <p className="text-slate-500 text-[14px] font-medium tracking-wide">
                        Настройка полей модального окна подачи заявки в Discord.
                    </p>
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

            <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar space-y-8">
                <section>
                    <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Поля анкеты</h2>
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[60px]">№</th>
                                    <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[25%]">Тип поля</th>
                                    <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4 w-[35%]">Текст вопроса (Max 45)</th>
                                    <th className="text-[11px] font-bold tracking-wider text-slate-500 uppercase py-3 px-4">Подсказка в поле (Max 100)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {localFields.map((field, index) => (
                                    <tr key={field.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center font-bold text-[13px] shrink-0">
                                                {index + 1}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex bg-slate-100 rounded-lg p-1 w-max">
                                                <button
                                                    onClick={() => handleChange(index, 'style', 1)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-md text-[12px] font-bold transition-all",
                                                        field.style === 1 ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                                    )}
                                                >
                                                    Строка
                                                </button>
                                                <button
                                                    onClick={() => handleChange(index, 'style', 2)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-md text-[12px] font-bold transition-all",
                                                        field.style !== 1 ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                                    )}
                                                >
                                                    Текст
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) => handleChange(index, 'label', e.target.value)}
                                                    placeholder={`Вопрос ${index + 1}`}
                                                    maxLength={45}
                                                    className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg px-4 py-2.5 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-medium pr-12"
                                                />
                                                <span className={cn(
                                                    "absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono",
                                                    field.label.length >= 45 ? "text-rose-400 font-bold" : "text-slate-300"
                                                )}>
                                                    {field.label.length}/45
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={field.placeholder}
                                                    onChange={(e) => handleChange(index, 'placeholder', e.target.value)}
                                                    placeholder="Введите подсказку..."
                                                    maxLength={100}
                                                    className="w-full bg-slate-50/50 border border-slate-200 text-slate-900 text-[13px] rounded-lg px-4 py-2.5 outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 font-medium pr-14"
                                                />
                                                <span className={cn(
                                                    "absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono",
                                                    field.placeholder.length >= 100 ? "text-rose-400 font-bold" : "text-slate-300"
                                                )}>
                                                    {field.placeholder.length}/100
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section>
                    <h2 className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-3 px-2">Превью в Discord</h2>
                    <div className="bg-[#313338] rounded-2xl border border-slate-700/40 shadow-sm p-8 max-w-2xl">
                        <div className="mb-6 flex flex-col items-center text-center">
                            <h3 className="text-[20px] font-bold text-[#F2F3F5] mb-1">Подача заявки</h3>
                            <p className="text-[14px] text-[#B5BAC1]">Пожалуйста, заполните анкету ниже</p>
                        </div>
                        <div className="space-y-4">
                            {localFields.map((field, index) => (
                                <div key={field.key} className="flex flex-col gap-2">
                                    <label className="text-[12px] font-bold text-[#b5bac1] uppercase tracking-wide flex items-center gap-1">
                                        {field.label || `Вопрос ${index + 1}`}
                                        <span className="text-red-400">*</span>
                                    </label>
                                    <div className={cn(
                                        "bg-[#1e1f22] border border-transparent rounded-sm p-3 flex",
                                        field.style === 1 ? "min-h-[44px] items-center" : "min-h-[88px] items-start"
                                    )}>
                                        <span className="text-[15px] text-[#87898c]">{field.placeholder || ''}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-[#3f4147]">
                           <div className="px-4 py-2 rounded text-[#dbdee1] hover:underline cursor-not-allowed text-[14px] font-medium transition-colors">Отмена</div>
                           <div className="px-6 py-2 bg-[#5865F2] hover:bg-[#4752C4] rounded text-white text-[14px] font-medium transition-colors cursor-not-allowed">Отправить</div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
