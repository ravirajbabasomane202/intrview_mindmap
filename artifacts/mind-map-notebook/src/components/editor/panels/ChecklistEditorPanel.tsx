import { Check, Trash2 } from 'lucide-react';
import { uid } from '../../../lib/uid';
import { CanvasObject, ChecklistItem } from '../../../types/canvas';

export function ChecklistEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const items = object.checklistItems ?? [];
  const setItems = (next: ChecklistItem[]) => onUpdate(object.id, { checklistItems: next });
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Checklist items</label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
            <button type="button" onClick={() => setItems(items.map((current) => current.id === item.id ? { ...current, done: !current.done } : current))} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${item.done ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white' : 'border-[hsl(var(--border))]'}`} data-testid={`button-checklist-toggle-${index}`}>{item.done && <Check size={13} />}</button>
            <input value={item.text} onChange={(event) => setItems(items.map((current) => current.id === item.id ? { ...current, text: event.target.value } : current))} className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1.5 text-xs outline-none" data-testid={`input-checklist-text-${index}`} />
            <button type="button" onClick={() => setItems(items.filter((current) => current.id !== item.id))} aria-label="Remove item" className="rounded-lg p-1.5 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]" data-testid={`button-checklist-remove-${index}`}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setItems([...items, { id: uid('item'), text: 'New step', done: false }])} className="mt-2 w-full rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-checklist-add">+ Add item</button>
    </div>
  );
}
