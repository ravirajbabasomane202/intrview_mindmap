import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { STORAGE_KEY, apiHeaders, migrateNoteToNewFormat, readNotes } from './storage';
import { Note } from '../types/canvas';

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'conflict';

export function syncReadyDate(value: string) {
  return Number.isNaN(Date.parse(value)) ? new Date().toISOString() : value;
}

export async function saveNoteToCloud(note: Note) {
  const normalized = { ...note, updatedAt: syncReadyDate(note.updatedAt) };
  const response = await fetch(`/api/notes/${encodeURIComponent(normalized.id)}`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify({ note: normalized, clientUpdatedAt: normalized.updatedAt }),
  });
  if (response.status === 409) {
    const payload = await response.json() as { note?: Note };
    return { conflict: true, note: payload.note };
  }
  if (!response.ok) throw new Error(`Sync failed with ${response.status}`);
  return { conflict: false, note: normalized };
}

export async function deleteNoteFromCloud(id: string) {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!response.ok && response.status !== 401) throw new Error(`Delete sync failed with ${response.status}`);
}

// GET /api/notes is keyset-paginated server-side (see api-server/src/routes/notes.ts)
// so a single request only ever returns one bounded page, however many notes the
// account has. The hydrate flow below still needs the *complete* set to merge
// against local storage, so this walks the cursor chain until the server reports
// there's no more — same end result as before pagination existed, just as a
// bounded sequence of requests instead of one unbounded one.
type NotesPageResponse = { notes: Note[]; nextCursor: string | null };

async function fetchAllNotesFromCloud(): Promise<Note[]> {
  const all: Note[] = [];
  let cursor: string | null = null;
  do {
    const url = cursor ? `/api/notes?cursor=${encodeURIComponent(cursor)}` : '/api/notes';
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`Sync failed with ${response.status}`);
    const page = await response.json() as NotesPageResponse;
    all.push(...page.notes);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

export const CLOUD_SYNC_ENABLED = import.meta.env.VITE_ENABLE_CLOUD_SYNC === 'true';

export async function probeApiAvailable(): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  try {
    const response = await fetch('/api/healthz', { headers: apiHeaders() });
    return response.ok;
  } catch {
    return false;
  }
}

export function useCloudNotesSync(notes: Note[], setNotes: Dispatch<SetStateAction<Note[]>>) {
  const [syncState, setSyncState] = useState<SyncState>(CLOUD_SYNC_ENABLED ? 'local' : 'local');
  const apiAvailableRef = useRef(false);
  const hydratedRef = useRef(false);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) {
      hydratedRef.current = true;
      setSyncState('local');
      return;
    }

    hydratedRef.current = false;
    apiAvailableRef.current = false;
    let cancelled = false;

    const hydrate = async () => {
      setSyncState('syncing');
      const available = await probeApiAvailable();
      if (cancelled) return;
      if (!available) {
        hydratedRef.current = true;
        apiAvailableRef.current = false;
        setSyncState('local');
        return;
      }
      apiAvailableRef.current = true;

      try {
        const serverNotes = (await fetchAllNotesFromCloud()).map(migrateNoteToNewFormat);
        const serverById = new Map(serverNotes.map((note) => [note.id, note]));
        const localNotes = readNotes();
        const merged = new Map<string, Note>();
        const pendingUploads: Note[] = [];

        for (const localNote of localNotes) {
          const serverNote = serverById.get(localNote.id);
          if (!serverNote || Date.parse(syncReadyDate(localNote.updatedAt)) >= Date.parse(syncReadyDate(serverNote.updatedAt))) {
            const normalized = { ...localNote, updatedAt: syncReadyDate(localNote.updatedAt) };
            merged.set(localNote.id, normalized);
            if (!serverNote || Date.parse(syncReadyDate(localNote.updatedAt)) > Date.parse(syncReadyDate(serverNote.updatedAt))) {
              pendingUploads.push(normalized);
            }
          } else {
            merged.set(localNote.id, migrateNoteToNewFormat(serverNote));
          }
        }
        for (const serverNote of serverNotes) {
          if (!merged.has(serverNote.id)) merged.set(serverNote.id, serverNote);
        }
        for (const note of [...notesRef.current, ...readNotes()]) {
          const existing = merged.get(note.id);
          if (!existing || Date.parse(syncReadyDate(note.updatedAt)) > Date.parse(syncReadyDate(existing.updatedAt))) {
            merged.set(note.id, note);
          }
        }

        if (cancelled) return;
        const mergedNotes = [...merged.values()];
        setNotes(mergedNotes);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedNotes));
        await Promise.all(pendingUploads.map((note) => saveNoteToCloud(note).catch(() => ({ conflict: false, note }))));
        if (!cancelled) {
          hydratedRef.current = true;
          setSyncState('synced');
        }
      } catch {
        if (!cancelled) {
          apiAvailableRef.current = false;
          hydratedRef.current = true;
          setSyncState('local');
        }
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [setNotes]);

  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED || !hydratedRef.current || !apiAvailableRef.current) return;
    const timer = window.setTimeout(async () => {
      if (!apiAvailableRef.current) return;
      setSyncState('syncing');
      try {
        const results = await Promise.all(notes.map((note) => saveNoteToCloud(note)));
        setSyncState(results.some((result) => result.conflict) ? 'conflict' : 'synced');
      } catch {
        apiAvailableRef.current = false;
        setSyncState('local');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [notes]);

  return syncState;
}
