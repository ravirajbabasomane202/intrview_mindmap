import { ShapePreviewSwatch } from '../../objects/ShapePreviewSwatch';
import { SHAPE_KINDS } from '../../../lib/shapes';
import { colors } from '../../../lib/storage';
import { CanvasObject } from '../../../types/canvas';

export function ShapeEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Shape</label>
        <div className="grid grid-cols-5 gap-1.5">
          {SHAPE_KINDS.map((kind) => (
            <button key={kind.value} type="button" title={kind.label} onClick={() => onUpdate(object.id, { shapeKind: kind.value })} className={`flex h-9 items-center justify-center rounded-lg ${object.shapeKind === kind.value ? 'bg-[hsl(var(--primary)/.18)] ring-2 ring-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`} data-testid={`button-set-shapekind-${kind.value}`}>
              <span className="block h-5 w-5"><ShapePreviewSwatch kind={kind.value} /></span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Label</label>
        <textarea value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} className="min-h-16 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm leading-6 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" />
      </div>
    </div>
  );
}
