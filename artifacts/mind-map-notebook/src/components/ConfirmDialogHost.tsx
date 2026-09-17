import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ConfirmDialogState } from '../store/notebook-store';

export function ConfirmDialogHost({ state, onOpenChange }: { state: ConfirmDialogState | null; onOpenChange: (open: boolean) => void }) {
  return (
    <AlertDialog open={!!state} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription>{state?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-confirm-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-confirm-accept"
            className={state?.destructive ? 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:bg-[hsl(var(--destructive)/.9)]' : undefined}
            onClick={() => { state?.onConfirm(); onOpenChange(false); }}
          >
            {state?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
