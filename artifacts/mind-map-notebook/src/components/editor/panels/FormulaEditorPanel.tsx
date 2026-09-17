import { useRef } from 'react';
import { renderLatexHtml, useKatexReady } from '../../../lib/latex';
import { colors } from '../../../lib/storage';
import { CanvasObject } from '../../../types/canvas';

export const MATH_SYMBOLS: { label: string; insert: string }[] = [
  { label: 'x²', insert: '^{}' }, { label: 'xₙ', insert: '_{}' }, { label: '√', insert: '\\sqrt{}' }, { label: 'ⁿ√', insert: '\\sqrt[n]{}' },
  { label: '∫', insert: '\\int_{}^{}' }, { label: 'Σ', insert: '\\sum_{}^{}' }, { label: 'Π', insert: '\\prod_{}^{}' }, { label: 'lim', insert: '\\lim_{x \\to }' },
  { label: 'd/dx', insert: '\\frac{d}{dx}' }, { label: '∂', insert: '\\partial' }, { label: 'frac', insert: '\\frac{}{}' }, { label: 'matrix', insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'vec', insert: '\\vec{v}' }, { label: 'det', insert: '\\det' }, { label: 'α', insert: '\\alpha' }, { label: 'β', insert: '\\beta' },
  { label: 'θ', insert: '\\theta' }, { label: 'π', insert: '\\pi' }, { label: 'λ', insert: '\\lambda' }, { label: 'Δ', insert: '\\Delta' },
  { label: '≤', insert: '\\leq' }, { label: '≥', insert: '\\geq' }, { label: '≠', insert: '\\neq' }, { label: '≈', insert: '\\approx' },
  { label: '∈', insert: '\\in' }, { label: '∪', insert: '\\cup' }, { label: '∩', insert: '\\cap' }, { label: '⊂', insert: '\\subset' },
  { label: '∧', insert: '\\land' }, { label: '∨', insert: '\\lor' }, { label: '¬', insert: '\\neg' }, { label: '→', insert: '\\rightarrow' },
  { label: 'P(x)', insert: 'P(x)' }, { label: 'f(x)', insert: 'f(x)' },
];

export function FormulaEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const katexReady = useKatexReady();
  const html = renderLatexHtml(object.content, katexReady);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insertSymbol = (snippet: string) => {
    const textarea = textareaRef.current;
    const current = object.content ?? '';
    if (!textarea) { onUpdate(object.id, { content: current + snippet }); return; }
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    onUpdate(object.id, { content: next });
    requestAnimationFrame(() => { textarea.focus(); const caret = start + snippet.length; textarea.setSelectionRange(caret, caret); });
  };
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Formula (LaTeX)</label>
      <div className="mb-2 grid grid-cols-6 gap-1 rounded-lg bg-[hsl(var(--muted))] p-1.5" data-testid="palette-math-symbols">
        {MATH_SYMBOLS.map((symbol) => (
          <button key={symbol.label} type="button" title={symbol.insert} onClick={() => insertSymbol(symbol.insert)} className="rounded px-1 py-1.5 text-[11px] font-semibold hover:bg-[hsl(var(--card))]" data-testid={`button-symbol-${symbol.label}`}>{symbol.label}</button>
        ))}
      </div>
      <textarea ref={textareaRef} value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} placeholder="e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" className="min-h-20 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 font-mono text-sm leading-6 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" />
      <p className="mt-1.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">Standard LaTeX math syntax, e.g. \frac{}{}, \sqrt{}, x^2, \sum, \alpha — or tap a symbol above to insert it.</p>
      <div className="mt-3 flex min-h-16 items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3" data-testid="formula-live-preview">
        {html
          ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-xs text-[hsl(var(--muted-foreground))]">{katexReady ? 'Nothing to preview yet' : 'Loading renderer…'}</p>}
      </div>
    </div>
  );
}
