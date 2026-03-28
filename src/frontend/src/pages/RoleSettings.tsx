import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, icons, Loader2, Pencil, Plus, Save, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { api, useAuth } from '../lib/api';
import { DynamicIcon } from '../components/IconPicker';

type RoleType = 'system' | 'access' | 'none';
type SystemType = 'main' | 'new' | 'tier' | 'blacklist' | 'interview' | null;

interface Role {
  id: string;
  name: string;
  discordRoleId: string | null;
  color: string;
  icon: string | null;
  priority: number;
  type: RoleType;
  systemType: SystemType;
  isAdmin: boolean;
  canManageSettings: boolean;
  isEveryone: boolean;
}

type DraftState = { name: string; discordRoleId: string; color: string; icon: string };
const EMPTY_DRAFT: DraftState = { name: '', discordRoleId: '', color: '#6366f1', icon: 'Shield' };

const ICON_NAMES = Object.keys(icons).sort();
type IconComponent = (props: LucideProps) => React.JSX.Element;

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// ── Plain table row (used both in list and as drag overlay) ──────────────────
function RoleRow({
  role,
  canEdit,
  onEdit,
  onDelete,
  isDeleting,
  style,
  handleProps,
  rowRef,
}: {
  role: Role;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  style?: React.CSSProperties;
  handleProps?: Record<string, unknown>;
  rowRef?: (el: HTMLTableRowElement | null) => void;
}) {
  return (
    <tr ref={rowRef} style={style} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-100 last:border-0 bg-white">
      <td className="px-6 py-4 w-[45%]">
        <div className="flex items-center gap-3">
          {canEdit && (
            <span
              {...(handleProps ?? {})}
              className="flex cursor-grab touch-none items-center text-slate-300 hover:text-slate-500"
              title="Перетащить"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
          <DynamicIcon name={role.icon} className="h-4 w-4 shrink-0 text-slate-600" />
          <span className="text-[13px] font-bold text-slate-900">{role.name}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="text-[12px] font-mono text-slate-500">{role.discordRoleId || '—'}</span>
      </td>
      <td className="px-6 py-4 text-right">
        {canEdit && (
          <div className="flex justify-end gap-1">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 h-8 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all shadow-sm active:scale-[0.98] text-[12px] font-semibold"
            >
              <Pencil className="w-3.5 h-3.5" /> Редактировать
            </button>
            {!role.isEveryone && (
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="w-8 h-8 flex items-center justify-center text-rose-600 bg-rose-50/50 hover:bg-rose-100 rounded-lg transition-all shadow-sm active:scale-[0.98] border border-rose-100 disabled:opacity-50"
                title="Удалить роль"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Sortable wrapper ─────────────────────────────────────────────────────────
function SortableRoleRow({
  role,
  canEdit,
  onEdit,
  onDelete,
  isDeleting,
}: {
  role: Role;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id });
  return (
    <RoleRow
      role={role}
      canEdit={canEdit}
      onEdit={onEdit}
      onDelete={onDelete}
      isDeleting={isDeleting}
      rowRef={setNodeRef}
      handleProps={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
    />
  );
}

// ── Compact Icon Picker Dropdown ─────────────────────────────────────────────
function CompactIconPicker({
  value,
  anchorRect,
  onChange,
  onClose,
}: {
  value: string;
  anchorRect: DOMRect;
  onChange: (name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ICON_NAMES;
  }, [search]);

  const W = 288;
  const H = 264;
  const margin = 8;
  let top = anchorRect.bottom + margin;
  let left = anchorRect.left;
  if (top + H > window.innerHeight - margin) top = anchorRect.top - H - margin;
  if (left + W > window.innerWidth - margin) left = window.innerWidth - W - margin;
  if (left < margin) left = margin;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <div
        className="fixed z-[160] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        style={{ top, left, width: W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск иконки..."
              className="flex-1 text-[12px] outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
            />
          </div>
        </div>
        <div className="h-[200px] overflow-y-auto p-2 grid grid-cols-5 gap-1">
          {(search ? filtered : filtered.slice(0, 150)).map((name) => {
            const Icon = (icons as Record<string, IconComponent>)[name];
            const isActive = value === name;
            return (
              <button
                key={name}
                onClick={() => onChange(name)}
                title={name}
                className={[
                  'h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 px-1 transition-all text-[9px]',
                  isActive
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-500',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate max-w-full leading-none">{name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-5 py-8 text-center text-[12px] text-slate-400">Нет иконок</div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Modal for create / edit ──────────────────────────────────────────────────
function RoleModal({
  mode,
  role,
  onClose,
  onSave,
  isPendingSave,
}: {
  mode: 'create' | 'edit';
  role: Role | null;
  onClose: () => void;
  onSave: (draft: DraftState) => void;
  isPendingSave: boolean;
}) {
  const [draft, setDraft] = useState<DraftState>(
    role
      ? { name: role.name, discordRoleId: role.discordRoleId ?? '', color: role.color, icon: role.icon ?? 'Shield' }
      : EMPTY_DRAFT,
  );
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);

  const openIconPicker = () => {
    if (iconBtnRef.current) setPickerRect(iconBtnRef.current.getBoundingClientRect());
    setShowIconPicker(true);
  };

  const validColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#6366f1';

  return createPortal(
    <>
      <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col border border-slate-100/50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex justify-between items-start rounded-t-3xl bg-slate-50/50">
            <div>
              <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">
                {mode === 'create' ? 'Создание роли' : 'Редактирование роли'}
              </h2>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                {mode === 'create' ? 'Заполните параметры новой роли' : 'Измените параметры роли'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Название</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="Название роли"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Discord Role ID</label>
              <input
                value={draft.discordRoleId}
                onChange={(e) => setDraft((p) => ({ ...p, discordRoleId: e.target.value }))}
                placeholder="Опционально"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Цвет</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                  <label className="cursor-pointer flex-shrink-0">
                    <div
                      className="w-5 h-5 rounded-md shadow-sm border border-slate-200/80 cursor-pointer"
                      style={{ backgroundColor: validColor(draft.color) }}
                    />
                    <input
                      type="color"
                      value={validColor(draft.color)}
                      onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
                      className="sr-only"
                    />
                  </label>
                  <input
                    type="text"
                    value={draft.color}
                    onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
                    onBlur={(e) => {
                      const v = e.target.value;
                      const fixed = v.startsWith('#') ? v : '#' + v;
                      if (/^#[0-9a-fA-F]{6}$/.test(fixed)) setDraft((p) => ({ ...p, color: fixed }));
                    }}
                    placeholder="#6366f1"
                    maxLength={7}
                    spellCheck={false}
                    className="flex-1 text-[13px] font-mono text-slate-700 outline-none bg-transparent min-w-0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Иконка</label>
                <button
                  ref={iconBtnRef}
                  type="button"
                  onClick={openIconPicker}
                  className="inline-flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <DynamicIcon name={draft.icon} className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="truncate">{draft.icon || 'Shield'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => onSave(draft)}
              disabled={!draft.name.trim() || isPendingSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-50 transition-colors"
            >
              {isPendingSave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {mode === 'create' ? 'Создать' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>

      {showIconPicker && pickerRect && (
        <CompactIconPicker
          value={draft.icon}
          anchorRect={pickerRect}
          onChange={(name) => { setDraft((p) => ({ ...p, icon: name })); setShowIconPicker(false); }}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </>,
    document.body,
  );
}

// ── Main page component ──────────────────────────────────────────────────────
export function RoleSettings() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useAuth();
  const canView = !!currentUser?.permissions?.includes('site:settings_roles:view');
  const canEdit = !!currentUser?.permissions?.includes('site:settings_roles:actions');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Role[] | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const { data: roles = [], isLoading, isError } = useQuery<Role[]>({
    queryKey: ['settings-roles'],
    queryFn: async () => (await api.get('/api/settings/roles')).data,
    enabled: canView,
  });

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.priority - b.priority), [roles]);
  const displayedRoles = localOrder ?? sortedRoles;

  // Reset optimistic order when server data arrives
  useEffect(() => { setLocalOrder(null); }, [roles]);

  const createRole = useMutation({
    mutationFn: async (draft: DraftState) =>
      (await api.post('/api/settings/roles', {
        name: draft.name.trim(),
        discordRoleId: draft.discordRoleId.trim() || undefined,
        color: draft.color,
        icon: draft.icon,
      })).data as Role,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-roles'] });
      setModalMode(null);
      setEditingRole(null);
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: DraftState }) =>
      api.patch(`/api/settings/roles/${id}`, {
        name: draft.name.trim(),
        discordRoleId: draft.discordRoleId.trim() || null,
        color: draft.color,
        icon: draft.icon,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-roles'] });
      setModalMode(null);
      setEditingRole(null);
    },
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/settings/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-roles'] });
      setModalMode(null);
      setEditingRole(null);
    },
  });

  const reorderRoles = useMutation({
    mutationFn: async (order: Role[]) =>
      api.put('/api/settings/roles/reorder', {
        order: order.map((role, index) => ({ id: role.id, priority: index })),
      }),
    onSuccess: () => { setLocalOrder(null); queryClient.invalidateQueries({ queryKey: ['settings-roles'] }); },
    onError: () => { setLocalOrder(null); },
  });

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = localOrder ?? sortedRoles;
    const oldIndex = list.findIndex((r) => r.id === active.id);
    const newIndex = list.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    setLocalOrder(next);
    reorderRoles.mutate(next);
  }, [canEdit, localOrder, sortedRoles, reorderRoles]);

  const closeModal = () => { setModalMode(null); setEditingRole(null); };

  const handleDeleteFromTable = (role: Role) => {
    if (role.isEveryone || removeRole.isPending) return;
    if (window.confirm(`Удалить роль \"${role.name}\"?`)) {
      removeRole.mutate(role.id);
    }
  };

  if (!canView) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Нет доступа к настройке ролей.</div>;
  }
  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (isError) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Ошибка загрузки ролей.</div>;
  }

  const activeRole = activeId ? displayedRoles.find((r) => r.id === activeId) ?? null : null;

  return (
    <div className="h-full flex flex-col font-sans">
      <header className="mb-6 flex items-end justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 mb-1">НАСТРОЙКА РОЛЕЙ</h1>
            <p className="text-slate-500 text-[13px] font-medium tracking-wide">Управление ролями и их порядком отображения.</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setModalMode('create')}
            className="flex items-center gap-1.5 px-3 h-8 text-blue-600 bg-blue-50/50 hover:bg-blue-100 rounded-lg transition-all shadow-sm active:scale-[0.98] font-semibold border border-blue-100"
          >
            <Plus className="w-3.5 h-3.5" /> Создать роль
          </button>
        )}
      </header>

      <div className="flex-1 bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[45%]">Роль</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Discord ID</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Действия</th>
                </tr>
              </thead>
              <SortableContext items={displayedRoles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-slate-100">
                  {displayedRoles.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-sm text-slate-400">
                        Нет ролей. Нажмите «Создать роль», чтобы добавить.
                      </td>
                    </tr>
                  ) : (
                    displayedRoles.map((role) => (
                      <SortableRoleRow
                        key={role.id}
                        role={role}
                        canEdit={canEdit}
                        onEdit={() => { setEditingRole(role); setModalMode('edit'); }}
                        onDelete={() => handleDeleteFromTable(role)}
                        isDeleting={removeRole.isPending}
                      />
                    ))
                  )}
                </tbody>
              </SortableContext>
            </table>
          </div>

          <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
            {activeRole ? (
              <table className="w-full shadow-xl border border-slate-100" style={{ opacity: 0.95 }}>
                <tbody>
                  <RoleRow
                    role={activeRole}
                    canEdit={canEdit}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    isDeleting={false}
                  />
                </tbody>
              </table>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modal */}
      {modalMode !== null && (
        <RoleModal
          mode={modalMode}
          role={editingRole}
          onClose={closeModal}
          onSave={(draft) => {
            if (modalMode === 'create') createRole.mutate(draft);
            else if (editingRole) updateRole.mutate({ id: editingRole.id, draft });
          }}
          isPendingSave={createRole.isPending || updateRole.isPending}
        />
      )}
    </div>
  );
}
