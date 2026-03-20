import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Activity } from 'lucide-react';

export function DashboardHome() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.stagger-item', {
        y: 15,
        opacity: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col font-sans">
      <header className="stagger-item mb-12">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-2">Обзор</h1>
        <p className="text-slate-500 text-[13px] font-medium tracking-wide">Краткая сводка по серверу Majestic RP.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {[
          { label: 'Новые Заявки', value: '12' },
          { label: 'Участники Семьи', value: '143' },
          { label: 'Мероприятия', value: '3' },
        ].map((stat, i) => (
          <div key={i} className="stagger-item bg-white p-7 rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between group hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-400 ease-out">
            <h3 className="text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-6">{stat.label}</h3>
            <p className="text-[40px] leading-none font-medium tracking-tight text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="stagger-item flex-1 bg-white rounded-[32px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-12 flex items-center justify-center relative overflow-hidden group">
        
        {/* Wireframe background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-40 transition-opacity duration-700 group-hover:opacity-60"></div>

        <div className="text-center relative z-10 flex flex-col items-center">
          <div className="w-[72px] h-[72px] bg-[#fafafa] rounded-[20px] flex items-center justify-center mb-6 shadow-sm border border-slate-100/50 rotate-3 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
            <Activity className="w-8 h-8 text-slate-300 transition-colors duration-500 group-hover:text-slate-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[17px] font-semibold text-slate-900 mb-2.5 tracking-tight">Активность не зафиксирована</h3>
          <p className="text-slate-400 text-[13px] max-w-[260px] leading-relaxed">
            Здесь будут отображаться графики онлайна и динамика состава.
          </p>
        </div>
      </div>
    </div>
  );
}
