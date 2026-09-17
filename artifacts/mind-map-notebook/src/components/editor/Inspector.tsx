import { useRef, useState } from 'react';
import { ImageIcon, Link2, Minus, MousePointer2, Palette, Trash2 } from 'lucide-react';
import { AccordionSection } from '../AccordionSection';
import { ChartEditorPanel } from './panels/ChartEditorPanel';
import { ChecklistEditorPanel } from './panels/ChecklistEditorPanel';
import { CodeEditorPanel } from './panels/CodeEditorPanel';
import { FormulaEditorPanel } from './panels/FormulaEditorPanel';
import { ShapeEditorPanel } from './panels/ShapeEditorPanel';
import { TableEditorPanel } from './panels/TableEditorPanel';
import { TextEditorPanel } from './panels/TextEditorPanel';
import { ASPECT_LOCKED_SHAPES } from '../../lib/shapes';
import { colors } from '../../lib/storage';
import { getFontSize, MAX_FONT_SIZE, MIN_FONT_SIZE } from '../../lib/text-style';
import { CanvasObject, Connection, Page, Stroke } from '../../types/canvas';

// Types whose TextEditorPanel already carries its own dedicated font-size control (see
// TextEditorPanel.tsx), so the generic Style-section control below would be a confusing duplicate.
const HAS_OWN_FONT_SIZE_CONTROL = new Set<CanvasObject['type']>(['text']);
// Types with no meaningful body text to size (an image has none; a chart's text comes from
// recharts' own tick/legend sizing, not object.content).
const NO_TEXT_CONTENT_TYPES = new Set<CanvasObject['type']>(['image', 'chart']);

export function Inspector({ object, stroke, connection, pages, onUpdate, onUpdateStroke, onUpdateConnection, onReplaceImage, onBring, onDelete, onFollowLink, floating = false }: { object?: CanvasObject; stroke?: Stroke; connection?: Connection; pages?: Page[]; onUpdate: (id: string, patch: Partial<CanvasObject>) => void; onUpdateStroke: (id: string, patch: Partial<Stroke>) => void; onUpdateConnection: (id: string, patch: Partial<Connection>) => void; onReplaceImage: (id: string, file: File) => void; onBring?: (id: string, direction: 'forward' | 'backward' | 'front' | 'back') => void; onDelete?: () => void; onFollowLink?: (link: { pageId: string; objectId?: string }) => void; floating?: boolean }) {
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const [openSection, setOpenSection] = useState<'content' | 'style' | 'arrange'>('style');
  return (
    <aside className={floating
      ? 'z-10 max-h-[calc(100vh-8rem)] w-[274px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.96)] p-5 backdrop-blur-md elev-3'
      : 'z-10 w-[274px] shrink-0 overflow-y-auto border-l border-[hsl(var(--border))] bg-[hsl(var(--card)/.92)] p-5 backdrop-blur-md max-[900px]:absolute max-[900px]:bottom-0 max-[900px]:right-0 max-[900px]:top-0 max-[640px]:w-[calc(100%-68px)]'} data-testid="panel-inspector">
<div className="mb-7 flex items-center justify-between"><div><p className="font-mono text-[11.5px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Contextual edit</p><h2 className="mt-1 font-serif text-2xl">{object ? 'Piece details' : stroke ? 'Stroke details' : connection ? 'Connection details' : 'Nothing selected'}</h2></div><Palette size={17} className="text-[hsl(var(--accent))]" /></div>
        {object ? <div className="animate-pop">
        <AccordionSection title="Content" isOpen={openSection === 'content'} onToggle={() => setOpenSection((v) => v === 'content' ? 'style' : 'content')}>
         {object.type === 'image' ? <div className="space-y-4 rounded-2xl bg-[hsl(var(--secondary)/.6)] p-3"><div className="flex items-center justify-between gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><ImageIcon size={15} /> Image attached</span><button type="button" onClick={() => replacementInputRef.current?.click()} className="rounded-lg bg-[hsl(var(--card))] px-2 py-1 text-[hsl(var(--primary))]">Replace</button></div><input ref={replacementInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onReplaceImage(object.id, file); event.target.value = ''; }} data-testid="input-image-replace" /><label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Caption<input value={object.imageCaption ?? ''} onChange={(event) => onUpdate(object.id, { imageCaption: event.target.value })} placeholder="Describe this image" className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs font-normal outline-none focus:border-[hsl(var(--primary))]" data-testid="input-image-caption" /></label><label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Alt text<input value={object.imageAlt ?? ''} onChange={(event) => onUpdate(object.id, { imageAlt: event.target.value })} placeholder="Accessible image description" className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs font-normal outline-none focus:border-[hsl(var(--primary))]" data-testid="input-image-alt" /></label><div><p className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Crop & positioning</p><label className="block text-[11.5px] text-[hsl(var(--muted-foreground))]">Zoom <input type="range" min="1" max="3" step="0.05" value={object.cropZoom ?? 1} onChange={(event) => onUpdate(object.id, { cropZoom: Number(event.target.value) })} className="mt-1 w-full accent-[hsl(var(--primary))]" data-testid="input-image-crop-zoom" /></label><label className="mt-2 block text-[11.5px] text-[hsl(var(--muted-foreground))]">Horizontal <input type="range" min="-50" max="50" value={object.cropX ?? 0} onChange={(event) => onUpdate(object.id, { cropX: Number(event.target.value) })} className="mt-1 w-full accent-[hsl(var(--primary))]" data-testid="input-image-crop-x" /></label><label className="mt-2 block text-[11.5px] text-[hsl(var(--muted-foreground))]">Vertical <input type="range" min="-50" max="50" value={object.cropY ?? 0} onChange={(event) => onUpdate(object.id, { cropY: Number(event.target.value) })} className="mt-1 w-full accent-[hsl(var(--primary))]" data-testid="input-image-crop-y" /></label></div></div> : object.type === 'table' ? <TableEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'formula' ? <FormulaEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'text' ? <TextEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'checklist' ? <ChecklistEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'code' ? <CodeEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'chart' ? <ChartEditorPanel object={object} onUpdate={onUpdate} />
         : object.type === 'shape' ? <ShapeEditorPanel object={object} onUpdate={onUpdate} />
         : <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Content</label><textarea value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} className="min-h-24 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm leading-6 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" /></div>}
        </AccordionSection>
        <AccordionSection title="Style" isOpen={openSection === 'style'} onToggle={() => setOpenSection((v) => v === 'style' ? 'content' : 'style')}>
        <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Fill</label><div className="flex flex-wrap gap-2">{colors.map((color) => <button key={color} type="button" aria-label={`Set fill ${color}`} onClick={() => onUpdate(object.id, { fill: color })} className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110 ${object.fill === color ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/.18)] ring-offset-2' : 'border-transparent'}`} style={{ backgroundColor: color }} data-testid={`button-color-${color.slice(1)}`} />)}</div></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Width<input type="number" value={object.width} onChange={(event) => { const next = Number(event.target.value); onUpdate(object.id, object.shapeKind && ASPECT_LOCKED_SHAPES.has(object.shapeKind) ? { width: next, height: next } : { width: next }); }} className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none" data-testid="input-object-width" /></label><label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Height<input type="number" value={object.height} onChange={(event) => { const next = Number(event.target.value); onUpdate(object.id, object.shapeKind && ASPECT_LOCKED_SHAPES.has(object.shapeKind) ? { width: next, height: next } : { height: next }); }} className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none" data-testid="input-object-height" /></label></div>
        {object.shapeKind && ASPECT_LOCKED_SHAPES.has(object.shapeKind) && <p className="-mt-1.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">Width and height stay locked together for this shape.</p>}
        <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Rotation <span className="font-mono font-normal">{object.rotation}°</span></label><input type="range" min="-180" max="180" value={object.rotation} onChange={(event) => onUpdate(object.id, { rotation: Number(event.target.value) })} className="w-full accent-[hsl(var(--primary))]" data-testid="input-object-rotation" /></div>
        {!NO_TEXT_CONTENT_TYPES.has(object.type) && !HAS_OWN_FONT_SIZE_CONTROL.has(object.type) && (
          <div>
            <label className="mb-2 flex items-center justify-between text-xs font-semibold text-[hsl(var(--muted-foreground))]"><span>Text size</span><span className="font-mono font-normal">{getFontSize(object)}px</span></label>
            <div className="flex items-center gap-3">
              <input type="range" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={getFontSize(object)} onChange={(event) => onUpdate(object.id, { fontSize: Number(event.target.value) })} className="w-full accent-[hsl(var(--primary))]" aria-label="Text size" data-testid="input-object-fontsize" />
              <input type="number" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={getFontSize(object)} onChange={(event) => onUpdate(object.id, { fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Number(event.target.value) || MIN_FONT_SIZE)) })} className="w-16 shrink-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]" aria-label="Text size in pixels" data-testid="input-object-fontsize-number" />
            </div>
          </div>
        )}
        </AccordionSection>
        <AccordionSection title="Arrange" isOpen={openSection === 'arrange'} onToggle={() => setOpenSection((v) => v === 'arrange' ? 'style' : 'arrange')}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onBring?.(object.id, 'forward')} className="rounded-xl bg-[hsl(var(--muted))] px-2 py-2 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-bring-forward">Bring forward</button>
          <button type="button" onClick={() => onBring?.(object.id, 'backward')} className="rounded-xl bg-[hsl(var(--muted))] px-2 py-2 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-send-backward">Send backward</button>
          <button type="button" onClick={() => onBring?.(object.id, 'front')} className="rounded-xl bg-[hsl(var(--muted))] px-2 py-2 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-bring-front">To front</button>
          <button type="button" onClick={() => onBring?.(object.id, 'back')} className="rounded-xl bg-[hsl(var(--muted))] px-2 py-2 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-send-back">To back</button>
        </div>
        </AccordionSection>
        {pages && (
          <div className="mt-5 space-y-3 rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"><Link2 size={14} className="text-[hsl(var(--primary))]" /> Link</div>
            <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Go to page
              <select
                value={object.link?.pageId ?? ''}
                onChange={(event) => onUpdate(object.id, { link: event.target.value ? { pageId: event.target.value, objectId: undefined } : undefined })}
                className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-2 text-xs outline-none transition-colors focus:border-[hsl(var(--primary))]"
                data-testid="select-object-link-page"
              >
                <option value="">No link</option>
                {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
              </select>
            </label>
            {object.link && (
              <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Focus piece (optional)
                <select
                  value={object.link.objectId ?? ''}
                  onChange={(event) => onUpdate(object.id, { link: { pageId: object.link!.pageId, objectId: event.target.value || undefined } })}
                  className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-2 text-xs outline-none transition-colors focus:border-[hsl(var(--primary))]"
                  data-testid="select-object-link-target"
                >
                  <option value="">None (whole page)</option>
                  {(pages.find((page) => page.id === object.link!.pageId)?.objects ?? []).filter((candidate) => candidate.id !== object.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{(candidate.content || candidate.type).slice(0, 28)}</option>)}
                </select>
              </label>
            )}
            {object.link && (
              <button
                type="button"
                onClick={() => onFollowLink?.(object.link!)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-2.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                data-testid="button-inspector-follow-link"
              >
                <Link2 size={13} /> Visit page
              </button>
            )}
            {object.link && <p className="text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">Or click the link badge on the piece itself (bottom-right) to follow it.</p>}
          </div>
        )}
        <div className="mt-5 space-y-2">
        <button type="button" onClick={() => onUpdate(object.id, { locked: !object.locked })} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-[hsl(var(--muted))]" data-testid="button-toggle-lock">{object.locked ? 'Unlock object' : 'Lock object'}</button>
        <button type="button" onClick={() => onDelete?.()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--destructive)/.22)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]" data-testid="button-delete-object"><Trash2 size={14} /> Delete piece</button>
        </div>
      </div> : stroke ? <div className="space-y-4 animate-pop">
            <div className="space-y-4 rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"><Minus size={14} className="text-[hsl(var(--primary))]" /> Appearance</div>
              <div className="flex items-center gap-3">
                <input type="color" value={stroke.color ?? '#1f5e60'} onChange={(event) => onUpdateStroke(stroke.id, { color: event.target.value })} aria-label="Stroke color" className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[hsl(var(--border))] bg-transparent p-0.5" data-testid="input-selected-stroke-color" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"><span>Width</span><span className="font-mono">{stroke.width ?? 4}px</span></div>
                  <input type="range" min="1" max="18" value={stroke.width ?? 4} onChange={(event) => onUpdateStroke(stroke.id, { width: Number(event.target.value) })} aria-label="Stroke width" className="mt-1.5 w-full accent-[hsl(var(--primary))]" data-testid="input-selected-stroke-width" />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Style</p>
                <div className="flex gap-1.5 rounded-xl bg-[hsl(var(--card)/.7)] p-1" data-testid="select-selected-stroke-style">
                  {([['', 'Solid'], ['7 7', 'Dashed'], ['2 4', 'Dotted'], ['10 4 2 4', 'Dash-dot']] as const).map(([value, label]) => (
                    <button key={label} type="button" onClick={() => onUpdateStroke(stroke.id, { dasharray: value || undefined })} className={`flex-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-semibold transition-colors ${(stroke.dasharray ?? '') === value ? 'bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid={`button-stroke-style-${label.toLowerCase()}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--destructive)/.22)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]" data-testid="button-delete-stroke"><Trash2 size={14} /> Delete stroke</button>
          </div> : connection ? <div className="space-y-4 animate-pop">
            <div className="space-y-4 rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"><Link2 size={14} className="text-[hsl(var(--primary))]" /> Line settings</div>
              <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Label
                <input value={connection.label ?? ''} onChange={(event) => onUpdateConnection(connection.id, { label: event.target.value || undefined })} placeholder="Connection label" className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="input-connection-label" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Type
                  <select value={connection.type ?? 'default'} onChange={(event) => onUpdateConnection(connection.id, { type: event.target.value as Connection['type'] })} className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-2 text-xs outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="select-connection-type"><option value="default">Default</option><option value="depends">Depends on</option><option value="relates">Relates to</option><option value="contains">Contains</option><option value="references">References</option></select>
                </label>
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Arrowhead
                  <select value={connection.arrowhead ?? 'arrow'} onChange={(event) => onUpdateConnection(connection.id, { arrowhead: event.target.value as Connection['arrowhead'] })} className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-2 text-xs outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="select-connection-arrowhead"><option value="none">None</option><option value="arrow">Arrow</option><option value="circle">Circle</option><option value="diamond">Diamond</option><option value="both">Both ends</option></select>
                </label>
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-[hsl(var(--card)/.7)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                Curved line
                <input type="checkbox" checked={connection.curved ?? false} onChange={(event) => onUpdateConnection(connection.id, { curved: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-connection-curved" />
              </label>
            </div>
            <div className="space-y-4 rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"><Palette size={14} className="text-[hsl(var(--primary))]" /> Appearance</div>
              <div className="flex items-center gap-3">
                <input type="color" value={connection.strokeColor ?? '#1f5e60'} onChange={(event) => onUpdateConnection(connection.id, { strokeColor: event.target.value })} aria-label="Connection color" className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[hsl(var(--border))] bg-transparent p-0.5" data-testid="input-connection-color" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"><span>Width</span><span className="font-mono">{connection.strokeWidth ?? 2}px</span></div>
                  <input type="range" min="1" max="8" value={connection.strokeWidth ?? 2} onChange={(event) => onUpdateConnection(connection.id, { strokeWidth: Number(event.target.value) })} aria-label="Connection width" className="mt-1.5 w-full accent-[hsl(var(--primary))]" data-testid="input-connection-width" />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Style</p>
                <div className="flex gap-1.5 rounded-xl bg-[hsl(var(--card)/.7)] p-1" data-testid="select-connection-style">
                  {([['', 'Solid'], ['7 7', 'Dashed'], ['3 3', 'Dotted'], ['10 5 2 5', 'Dash-dot']] as const).map(([value, label]) => (
                    <button key={label} type="button" onClick={() => onUpdateConnection(connection.id, { strokeDasharray: value })} className={`flex-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-semibold transition-colors ${(connection.strokeDasharray ?? '7 7') === value ? 'bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid={`button-connection-style-${label.toLowerCase()}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--destructive)/.22)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]" data-testid="button-delete-connection"><Trash2 size={14} /> Delete connection</button>
          </div> : <div className="rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]"><MousePointer2 size={17} className="mb-3 text-[hsl(var(--primary))]" /><p>Click a piece or stroke on the canvas to edit it.</p><p className="mt-3 text-xs">Use Draw, Line, Arrow, or Erase from the left toolbar.</p></div>}
      <div className="mt-10 border-t border-[hsl(var(--border))] pt-4 text-[11.5px] leading-5 text-[hsl(var(--muted-foreground))]"><span className="font-mono uppercase tracking-[.12em]">Canvas notebook</span><p className="mt-1">Your work is saved privately in this browser.</p></div>
    </aside>

  );
}
