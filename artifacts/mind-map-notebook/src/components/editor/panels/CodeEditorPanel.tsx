import { colors } from '../../../lib/storage';
import { CanvasObject } from '../../../types/canvas';

export function CodeEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Language</label>
      <select value={object.codeLanguage ?? 'javascript'} onChange={(event) => onUpdate(object.id, { codeLanguage: event.target.value })} className="mb-3 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none" data-testid="select-code-language">
        {['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'bash', 'json'].map((lang) => <option key={lang} value={lang}>{lang}</option>)}
      </select>
      <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Code</label>
      <textarea value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} className="min-h-32 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 font-mono text-xs leading-5 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" spellCheck={false} />
    </div>
  );
}
