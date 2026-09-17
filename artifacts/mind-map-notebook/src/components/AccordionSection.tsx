import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function AccordionSection({ title, isOpen, onToggle, children }: { title: string; isOpen: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-[hsl(var(--line-soft))] pb-5 last:border-0 last:pb-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between py-0.5 text-left font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]" data-testid={`accordion-${title.toLowerCase()}`}>
        {title}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}
