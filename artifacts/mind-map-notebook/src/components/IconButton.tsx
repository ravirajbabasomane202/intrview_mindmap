import { type ReactNode } from 'react';

export function IconButton({ label, children, onClick, active = false, testId }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; testId: string }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_5px_12px_hsl(183_41%_30%/.2)]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}`}>
      {children}
    </button>
  );
}
