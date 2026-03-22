import { useMemo, useState } from 'react';
import { icons, Search, X } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface IconPickerProps {
  value?: string | null;
  onChange: (iconName: string) => void;
  onClose: () => void;
}

const ICON_NAMES = Object.keys(icons).sort();

type IconComponent = (props: LucideProps) => React.JSX.Element;

export function DynamicIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && (icons as Record<string, IconComponent>)[name]) || icons.Circle;
  return <Icon className={className} />;
}

export function IconPicker({ value, onChange, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 flex-1">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск иконки Lucide..."
              className="w-full text-[13px] outline-none bg-transparent text-slate-700"
            />
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="h-[460px] overflow-y-auto p-4 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {filteredIcons.map((name) => {
            const Icon = (icons as Record<string, IconComponent>)[name];
            const isActive = value === name;
            return (
              <button
                key={name}
                onClick={() => onChange(name)}
                title={name}
                className={[
                  'h-14 rounded-xl border flex flex-col items-center justify-center gap-1 px-1 transition text-[10px]',
                  isActive
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600',
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-full">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
