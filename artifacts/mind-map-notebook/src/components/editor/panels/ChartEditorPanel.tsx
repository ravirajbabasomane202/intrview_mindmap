import { Trash2 } from 'lucide-react';
import { uid } from '../../../lib/uid';
import { CanvasObject, ChartKind, ChartPoint } from '../../../types/canvas';

export function ChartEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const data = object.chartData ?? [];
  const setData = (next: ChartPoint[]) => onUpdate(object.id, { chartData: next });
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Chart type</label>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {(['bar', 'line', 'pie', 'donut', 'area', 'scatter', 'histogram', 'radar', 'progress', 'gauge'] as ChartKind[]).map((kind) => (
          <button key={kind} type="button" onClick={() => onUpdate(object.id, { chartKind: kind })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold capitalize ${object.chartKind === kind ? 'bg-[hsl(var(--primary)/.18)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`} data-testid={`button-chart-kind-${kind}`}>{kind}</button>
        ))}
      </div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Data</label>
      <div className="space-y-2">
        {data.map((point, index) => (
          <div key={point.id} className="flex items-center gap-2">
            <input value={point.label} onChange={(event) => setData(data.map((current) => current.id === point.id ? { ...current, label: event.target.value } : current))} placeholder="Label" className="w-1/2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1.5 text-xs outline-none" data-testid={`input-chart-label-${index}`} />
            <input type="number" value={point.value} onChange={(event) => setData(data.map((current) => current.id === point.id ? { ...current, value: Number(event.target.value) } : current))} placeholder="Value" className="w-1/3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1.5 text-xs outline-none" data-testid={`input-chart-value-${index}`} />
            <button type="button" onClick={() => setData(data.filter((current) => current.id !== point.id))} aria-label="Remove point" className="rounded-lg p-1.5 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]" data-testid={`button-chart-remove-${index}`}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setData([...data, { id: uid('pt'), label: `Item ${data.length + 1}`, value: 1 }])} className="mt-2 w-full rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-chart-add-point">+ Add data point</button>
    </div>
  );
}
