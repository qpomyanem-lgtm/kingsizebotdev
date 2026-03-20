import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function Settings() {
   const containerRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      const ctx = gsap.context(() => {
         gsap.from('.stagger-item', {
            y: 20,
            opacity: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: 'power2.out',
         });
      }, containerRef);
      return () => ctx.revert();
   }, []);

   return (
      <div ref={containerRef} className="h-full flex flex-col">
         <header className="stagger-item mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Настройки</h1>
            <p className="text-slate-500 mt-1">Системные параметры и конфигурация бота.</p>
         </header>

         <div className="stagger-item bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-3xl">
            <div className="space-y-8">
               <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4 border-b border-gray-100 pb-2">Основные</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Название семьи</label>
                        <input type="text" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" value="Majestic Family" readOnly />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">ID канала логов</label>
                        <input type="text" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" value="123456789012345678" readOnly />
                     </div>
                  </div>
               </div>

               <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4 border-b border-gray-100 pb-2">Уведомления</h3>
                  <div className="flex items-center justify-between py-2">
                     <div>
                        <p className="text-sm font-medium text-slate-900">Звуковые оповещения</p>
                        <p className="text-xs text-slate-500">Проигрывать звук при новых заявках</p>
                     </div>
                     <div className="w-11 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                     </div>
                  </div>
               </div>

               <div className="pt-4 flex justify-end">
                  <button className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md hover:shadow-lg">
                     Сохранить изменения
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
}
