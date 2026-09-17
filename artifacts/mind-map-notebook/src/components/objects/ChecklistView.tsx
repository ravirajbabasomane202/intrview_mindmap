import { Check } from 'lucide-react';
import { CanvasObject } from '../../types/canvas';

export function ChecklistView({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const items = object.checklistItems ?? [];
  const toggle = (itemId: string) => {
    onUpdate(object.id, { checklistItems: items.map((item) => item.id === itemId ? { ...item, done: !item.done } : item) });
  };
  return <ul className="space-y-1.5">
    {items.map((item) => (
      <li key={item.id} className="flex items-center gap-2 leading-5">
        <button type="button" onClick={(event) => { event.stopPropagation(); toggle(item.id); }} onPointerDown={(event) => event.stopPropagation()} aria-label={item.done ? 'Mark undone' : 'Mark done'} className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white' : 'border-[hsl(var(--muted-foreground))]'}`}>
          {item.done && <Check size={11} />}
        </button>
        <span className={item.done ? 'line-through opacity-60' : ''}>{item.text}</span>
      </li>
    ))}
    {!items.length && <li className="text-xs opacity-60">No items yet</li>}
  </ul>;
}
