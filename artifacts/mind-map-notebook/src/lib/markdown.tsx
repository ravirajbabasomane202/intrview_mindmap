import { type ReactNode } from 'react';

export const BOX_PRESETS: Record<string, { label: string; className: string }> = {
  warning: { label: '⚠️ Warning', className: 'border-amber-400/60 bg-amber-400/10 text-amber-900' },
  tip: { label: '💡 Tip', className: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-900' },
  important: { label: '❗ Important', className: 'border-rose-400/60 bg-rose-400/10 text-rose-900' },
  example: { label: '📎 Example', className: 'border-sky-400/60 bg-sky-400/10 text-sky-900' },
  definition: { label: '📖 Definition', className: 'border-violet-400/60 bg-violet-400/10 text-violet-900' },
  theorem: { label: '📐 Theorem', className: 'border-indigo-400/60 bg-indigo-400/10 text-indigo-900' },
  proof: { label: '✔️ Proof', className: 'border-slate-400/60 bg-slate-400/10 text-slate-900' },
  formula: { label: '🧮 Formula', className: 'border-cyan-400/60 bg-cyan-400/10 text-cyan-900' },
  keypoint: { label: '🔑 Key point', className: 'border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-900' },
  concept: { label: '💭 Concept', className: 'border-teal-400/60 bg-teal-400/10 text-teal-900' },
  question: { label: '❓ Question', className: 'border-orange-400/60 bg-orange-400/10 text-orange-900' },
  answer: { label: '✅ Answer', className: 'border-lime-500/60 bg-lime-400/10 text-lime-900' },
  step: { label: '👣 Step', className: 'border-blue-400/60 bg-blue-400/10 text-blue-900' },
};

export function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|`(.+?)`|<u>(.+?)<\/u>|\[\[(.+?)\]\]|~~(.+?)~~|==(.+?)==)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) nodes.push(<strong key={`${keyPrefix}-${key++}`}>{match[2]}</strong>);
    else if (match[3] !== undefined) nodes.push(<u key={`${keyPrefix}-${key++}`}>{match[3]}</u>);
    else if (match[4] !== undefined) nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[4]}</em>);
    else if (match[5] !== undefined) nodes.push(<code key={`${keyPrefix}-${key++}`} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]">{match[5]}</code>);
    else if (match[6] !== undefined) nodes.push(<u key={`${keyPrefix}-${key++}`}>{match[6]}</u>);
    else if (match[7] !== undefined) nodes.push(<span key={`${keyPrefix}-${key++}`} className="mx-0.5 inline-block rounded-full bg-[hsl(var(--primary)/.16)] px-2 py-0.5 text-[0.85em] font-semibold text-[hsl(var(--primary))]">{match[7]}</span>);
    else if (match[8] !== undefined) nodes.push(<s key={`${keyPrefix}-${key++}`}>{match[8]}</s>);
    else if (match[9] !== undefined) nodes.push(<mark key={`${keyPrefix}-${key++}`} className="rounded-sm bg-yellow-300/70 px-0.5">{match[9]}</mark>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
}

export function renderMarkdownBlock(content: string): ReactNode {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, index) => {
        const key = `md-line-${index}`;
        const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const sizeClass = level === 1 ? 'text-lg font-bold' : level === 2 ? 'text-base font-bold' : 'text-sm font-bold';
          return <div key={key} className={sizeClass}>{renderInlineMarkdown(headingMatch[2], key)}</div>;
        }
        const boxMatch = line.match(/^!(warning|tip|important|example|definition|theorem|proof|formula|keypoint|concept|question|answer|step)\s+(.*)$/i);
        if (boxMatch) {
          const preset = BOX_PRESETS[boxMatch[1].toLowerCase()];
          return (
            <div key={key} className={`my-1 rounded-lg border-l-4 px-2.5 py-1.5 text-left ${preset.className}`}>
              <p className="mb-0.5 text-[11.5px] font-bold uppercase tracking-wide opacity-80">{preset.label}</p>
              <div>{renderInlineMarkdown(boxMatch[2], key)}</div>
            </div>
          );
        }
        const quoteMatch = line.match(/^>\s?(.*)$/);
        if (quoteMatch) {
          return <div key={key} className="my-1 border-l-4 border-[hsl(var(--muted-foreground)/.4)] pl-2.5 italic opacity-90">{renderInlineMarkdown(quoteMatch[1], key)}</div>;
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        if (bulletMatch) {
          return <div key={key} className="flex gap-1.5 pl-1"><span>•</span><span>{renderInlineMarkdown(bulletMatch[1], key)}</span></div>;
        }
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return <div key={key} className="flex gap-1.5 pl-1"><span className="font-semibold">{numberedMatch[1]}.</span><span>{renderInlineMarkdown(numberedMatch[2], key)}</span></div>;
        }
        if (line.trim().length === 0) return <div key={key} className="h-2" />;
        return <div key={key}>{renderInlineMarkdown(line, key)}</div>;
      })}
    </>
  );
}

// Same syntax this file's renderers turn into styled elements (headings, !box prefixes,
// bold/italic/strike/highlight/underline/badges/inline-code), collapsed to plain text instead.
// For spots that can't host the styled block output — a compact inline chip, an export routine —
// but still shouldn't show raw "!concept **solver:**" source to the reader.
export function stripMarkdownToPlainText(source: string): string {
  return source
    .split('\n')
    .map((rawLine) => {
      let line = rawLine;
      line = line.replace(/^#{1,6}\s+/, '');
      line = line.replace(/^>\s?/, '');
      line = line.replace(/^[-*]\s+/, '• ');
      line = line.replace(/^!(warning|tip|important|example|definition|theorem|proof|formula|keypoint|concept|question|answer|step)\s+/i, '');
      line = line.replace(/\*\*([^*]+)\*\*/g, '$1');
      line = line.replace(/~~([^~]+)~~/g, '$1');
      line = line.replace(/==([^=]+)==/g, '$1');
      line = line.replace(/<u>([^<]*)<\/u>/gi, '$1');
      line = line.replace(/\[\[([^\]]+)\]\]/g, '$1');
      line = line.replace(/`([^`]+)`/g, '$1');
      line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
      return line;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
