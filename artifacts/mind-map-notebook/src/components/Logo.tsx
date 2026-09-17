import { Grid2X2 } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-mark">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_5px_12px_hsl(183_41%_30%/.18)]">
        <Grid2X2 size={18} strokeWidth={1.8} />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent))]" />
      </div>
      {!compact && <span className="font-serif text-[1.12rem] font-semibold tracking-[-.03em]">Mind Map <span className="text-[hsl(var(--primary))]">Notebook</span></span>}
    </div>
  );
}
