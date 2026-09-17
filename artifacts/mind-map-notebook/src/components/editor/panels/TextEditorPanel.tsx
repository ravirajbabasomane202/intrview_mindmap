import { useRef } from 'react';
import { renderMarkdownBlock } from '../../../lib/markdown';
import { colors } from '../../../lib/storage';
import { prefixTextareaLine, wrapTextareaSelection } from '../../../lib/textarea';
import { getFontSize, MAX_FONT_SIZE, MIN_FONT_SIZE } from '../../../lib/text-style';
import { CanvasObject } from '../../../types/canvas';

export function TextEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const applyWrap = (before: string, after?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { nextValue, selectionStart, selectionEnd } = wrapTextareaSelection(textarea, before, after);
    onUpdate(object.id, { content: nextValue });
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(selectionStart, selectionEnd); });
  };
  const applyLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { nextValue, selectionStart, selectionEnd } = prefixTextareaLine(textarea, prefix);
    onUpdate(object.id, { content: nextValue });
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(selectionStart, selectionEnd); });
  };
  const fontSize = getFontSize(object);
  return (
    <div>
      <label className="mb-2 flex items-center justify-between text-xs font-semibold text-[hsl(var(--muted-foreground))]">
        <span>Text size</span>
        <span className="font-mono font-normal">{fontSize}px</span>
      </label>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="range"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          value={fontSize}
          onChange={(event) => onUpdate(object.id, { fontSize: Number(event.target.value) })}
          className="w-full accent-[hsl(var(--primary))]"
          aria-label="Text size"
          data-testid="input-text-fontsize"
        />
        <input
          type="number"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          value={fontSize}
          onChange={(event) => onUpdate(object.id, { fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Number(event.target.value) || MIN_FONT_SIZE)) })}
          className="w-16 shrink-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:border-[hsl(var(--primary))]"
          aria-label="Text size in pixels"
          data-testid="input-text-fontsize-number"
        />
      </div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Content</label>
      <div className="mb-2 flex flex-wrap gap-1 rounded-lg bg-[hsl(var(--muted))] p-1" data-testid="toolbar-rich-text">
        <button type="button" title="Bold" onClick={() => applyWrap('**')} className="rounded px-2 py-1 text-xs font-bold hover:bg-[hsl(var(--card))]" data-testid="button-format-bold">B</button>
        <button type="button" title="Italic" onClick={() => applyWrap('*')} className="rounded px-2 py-1 text-xs italic hover:bg-[hsl(var(--card))]" data-testid="button-format-italic">I</button>
        <button type="button" title="Underline" onClick={() => applyWrap('<u>', '</u>')} className="rounded px-2 py-1 text-xs underline hover:bg-[hsl(var(--card))]" data-testid="button-format-underline">U</button>
        <button type="button" title="Strikethrough" onClick={() => applyWrap('~~')} className="rounded px-2 py-1 text-xs line-through hover:bg-[hsl(var(--card))]" data-testid="button-format-strike">S</button>
        <button type="button" title="Highlight" onClick={() => applyWrap('==')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-highlight-text">He</button>
        <button type="button" title="Heading" onClick={() => applyLinePrefix('# ')} className="rounded px-2 py-1 text-xs font-semibold hover:bg-[hsl(var(--card))]" data-testid="button-format-heading">H</button>
        <button type="button" title="Bullet list" onClick={() => applyLinePrefix('- ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-bullet">•</button>
        <button type="button" title="Numbered list" onClick={() => applyLinePrefix('1. ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-numbered">1.</button>
        <button type="button" title="Inline code" onClick={() => applyWrap('`')} className="rounded px-2 py-1 font-mono text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-code">{'</>'}</button>
        <button type="button" title="Quote box" onClick={() => applyLinePrefix('> ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-quote">❝</button>
        <button type="button" title="Badge" onClick={() => applyWrap('[[', ']]')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-badge">Badge</button>
        <span className="mx-0.5 w-px self-stretch bg-[hsl(var(--border))]" />
        <button type="button" title="Warning box" onClick={() => applyLinePrefix('!warning ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-warning">⚠️</button>
        <button type="button" title="Tip box" onClick={() => applyLinePrefix('!tip ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-tip">💡</button>
        <button type="button" title="Important box" onClick={() => applyLinePrefix('!important ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-important">❗</button>
        <button type="button" title="Example box" onClick={() => applyLinePrefix('!example ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-example">📎</button>
        <button type="button" title="Definition box" onClick={() => applyLinePrefix('!definition ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-definition">📖</button>
        <button type="button" title="Theorem box" onClick={() => applyLinePrefix('!theorem ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-theorem">📐</button>
        <button type="button" title="Proof box" onClick={() => applyLinePrefix('!proof ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-proof">✔️</button>
        <button type="button" title="Formula card" onClick={() => applyLinePrefix('!formula ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-formulacard">🧮</button>
        <button type="button" title="Key point" onClick={() => applyLinePrefix('!keypoint ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-keypoint">🔑</button>
        <button type="button" title="Concept card" onClick={() => applyLinePrefix('!concept ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-concept">💭</button>
        <button type="button" title="Question" onClick={() => applyLinePrefix('!question ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-question">❓</button>
        <button type="button" title="Answer" onClick={() => applyLinePrefix('!answer ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-answer">✅</button>
        <button type="button" title="Step" onClick={() => applyLinePrefix('!step ')} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--card))]" data-testid="button-format-step">👣</button>
      </div>
      <textarea ref={textareaRef} value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} className="min-h-24 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm leading-6 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" />
      <p className="mt-1.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">Markdown: **bold**, *italic*, &lt;u&gt;underline&lt;/u&gt;, ~~strike~~, ==highlight==, # heading, - bullet, 1. numbered, &gt; quote, [[badge]], `code`, !warning / !tip / !important / !example / !definition / !theorem / !proof / !formula / !keypoint / !concept / !question / !answer / !step boxes</p>
      <div className="mt-3 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 leading-6" style={{ fontSize }}>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Preview</p>
        {renderMarkdownBlock(object.content)}
      </div>
    </div>
  );
}
