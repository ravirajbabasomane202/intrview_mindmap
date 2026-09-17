import { ChartView } from './ChartView';
import { ChecklistView } from './ChecklistView';
import { CustomShapeView } from './CustomShapeView';
import { FlashcardView } from './FlashcardView';
import { TableView } from './TableView';
import { renderLatexHtml, useKatexReady } from '../../lib/latex';
import { renderMarkdownBlock } from '../../lib/markdown';
import { CUSTOM_RENDER_SHAPES } from '../../lib/shapes';
import { getFontSize } from '../../lib/text-style';
import { CanvasObject } from '../../types/canvas';

export function CanvasObjectContent({ object, editing, onUpdate, onBlur }: { object: CanvasObject; editing: boolean; onUpdate: (id: string, patch: Partial<CanvasObject>) => void; onBlur: () => void }) {
  const katexReady = useKatexReady();
  if (object.type === 'image' && object.content.startsWith('data:')) {
    return <>
      <img src={object.content} alt={object.imageAlt || ''} className="absolute h-full w-full object-cover" style={{ transform: `translate(${object.cropX ?? 0}%, ${object.cropY ?? 0}%) scale(${object.cropZoom ?? 1})` }} />
      {object.imageCaption && <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1.5 text-center text-[11.5px] font-medium text-white">{object.imageCaption}</span>}
    </>;
  }
  if (editing) {
    return <textarea autoFocus value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} onBlur={onBlur} className="h-[78%] w-[85%] resize-none rounded-lg border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--card)/.4)] p-2 text-center text-sm outline-none" data-testid={`textarea-object-${object.id}`} />;
  }
  if (object.type === 'table') {
    return <div className="h-full w-full overflow-auto p-1" style={{ fontSize: getFontSize(object) }}><TableView object={object} /></div>;
  }
  if (object.type === 'flashcard') {
    return <FlashcardView object={object} onUpdate={onUpdate} />;
  }
  if (object.type === 'formula') {
    const html = renderLatexHtml(object.content, katexReady);
    if (html) return <div className="px-5" style={{ fontSize: getFontSize(object) }} dangerouslySetInnerHTML={{ __html: html }} />;
    return <span className="whitespace-pre-line px-5 font-mono" style={{ fontSize: getFontSize(object) }}>{object.content}</span>;
  }
  if (object.type === 'text') {
    return <div className="w-full whitespace-pre-line px-5 font-medium leading-6" style={{ fontSize: getFontSize(object) }}>{renderMarkdownBlock(object.content)}</div>;
  }
  if (object.type === 'checklist') {
    return <div className="h-full w-full overflow-auto px-4 py-3 text-left" style={{ fontSize: getFontSize(object) }}><ChecklistView object={object} onUpdate={onUpdate} /></div>;
  }
  if (object.type === 'code') {
    return <pre className="h-full w-full overflow-auto whitespace-pre-wrap px-4 py-3 text-left font-mono leading-5" style={{ fontSize: getFontSize(object) }}><code>{object.content}</code></pre>;
  }
  if (object.type === 'chart') {
    return <div className="h-full w-full p-2"><ChartView object={object} /></div>;
  }
  if (object.type === 'shape' && object.shapeKind && CUSTOM_RENDER_SHAPES.has(object.shapeKind)) {
    return <CustomShapeView object={object} />;
  }
  return <span className={`whitespace-pre-line px-5 font-medium leading-6 ${object.type === 'shape' ? 'font-serif font-semibold tracking-[-.04em]' : ''}`} style={{ fontSize: getFontSize(object) }}>{object.content}</span>;
}

// Flashcard: content is stored as "front|||back". Click the flip button to reveal the other
// face; double-clicking the card still opens the raw "front|||back" text for editing, same as
// every other object type.
