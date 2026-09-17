import { useCallback, useState } from 'react';
import { Note } from '../types/canvas';

/**
 * Owns the undo/redo stacks for a note's edit history.
 *
 * Extracted verbatim from NoteEditor's inline undo/redo state — behavior is
 * unchanged: snapshots are deep clones of the full `notes` array, capped at
 * 40 entries, and `undo`/`redo` return whether they actually did anything so
 * callers can decide whether to clear selection (NoteEditor's original
 * `undo()` cleared `selectedId` only when an undo actually happened).
 */
export function useHistory(
  notes: Note[],
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
  setSaveState: (state: string) => void,
) {
  const [undoStack, setUndoStack] = useState<Note[][]>([]);
  const [redoStack, setRedoStack] = useState<Note[][]>([]);

  const pushHistorySnapshot = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-39), JSON.parse(JSON.stringify(notes)) as Note[]]);
    setRedoStack([]);
  }, [notes]);

  const undo = useCallback((): boolean => {
    if (!undoStack.length) {
      setSaveState('Nothing to undo yet');
      return false;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, JSON.parse(JSON.stringify(notes)) as Note[]]);
    setNotes(previous);
    setSaveState('Undo saved locally');
    return true;
  }, [undoStack, notes, setNotes, setSaveState]);

  const redo = useCallback((): boolean => {
    if (!redoStack.length) {
      setSaveState('Nothing to redo yet');
      return false;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, JSON.parse(JSON.stringify(notes)) as Note[]]);
    setNotes(next);
    setSaveState('Redo saved locally');
    return true;
  }, [redoStack, notes, setNotes, setSaveState]);

  return { undoStack, redoStack, pushHistorySnapshot, undo, redo };
}
