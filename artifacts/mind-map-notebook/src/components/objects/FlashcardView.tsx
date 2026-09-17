import { CanvasObject } from '../../types/canvas';

export function FlashcardView({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const [front, back] = object.content.split('|||');
  const showingBack = !!object.flipped && back !== undefined;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
      <span className="text-[11px] font-bold uppercase tracking-wide opacity-50">{showingBack ? 'Answer' : 'Question'}</span>
      <p className="whitespace-pre-line text-sm font-medium leading-6">{(showingBack ? back : front)?.trim() || (showingBack ? 'No answer yet' : 'No question yet')}</p>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onUpdate(object.id, { flipped: !object.flipped }); }}
        onPointerDown={(event) => event.stopPropagation()}
        className="mt-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
        style={{ borderColor: object.color || '#1f5e60', color: object.color || '#1f5e60' }}
        data-testid={`button-flip-flashcard-${object.id}`}
      >
        Flip card
      </button>
    </div>
  );
}

// Shapes with internal structure (a knob, a track, a fill bar, a frame label) that a single
// CSS clip-path can't express — rendered as a small composed SVG/DOM tree instead.
