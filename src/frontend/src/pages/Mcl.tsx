import { Swords } from 'lucide-react';

export function Mcl() {
    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-8 flex justify-between items-end">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
                        <Swords className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">MCL ВЗЗ</h1>
                        <p className="text-slate-500 text-[13px] font-medium tracking-wide">Списки MCL и ВЗЗ.</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-8 flex items-center justify-center">
                <p className="text-slate-400 text-[15px]">Раздел в разработке</p>
            </div>
        </div>
    );
}
