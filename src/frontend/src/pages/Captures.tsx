export function Captures() {
    return (
        <div className="h-full flex flex-col font-sans">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-2">Капты</h1>
                    <p className="text-slate-500 text-[13px] font-medium tracking-wide">Список участников для каптов.</p>
                </div>
            </header>

            <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-8 flex items-center justify-center">
                <p className="text-slate-400 text-[15px]">Здесь будет таблица или список Каптов</p>
            </div>
        </div>
    );
}
