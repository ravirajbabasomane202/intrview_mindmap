import { type ReactNode } from 'react';

export function ToolButton({ label, onClick, active = false, testId, icon }: { label: string; onClick: () => void; active?: boolean; testId: string; icon?: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick}
      className={`relative flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_5px_12px_hsl(183_41%_30%/.2)]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}`}>
      {icon ?? label}
      {active && <span className="absolute -left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-[hsl(var(--accent))]" />}
    </button>
  );
}
