import { type Dispatch, type ReactNode, type SetStateAction, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConfirmDialogHost } from '../components/ConfirmDialogHost';
import { FOLDERS_KEY, STORAGE_KEY, apiHeaders, normalizeFolder, readFolders, readNotes } from '../lib/storage';
import { CLOUD_SYNC_ENABLED, SyncState, probeApiAvailable, useCloudNotesSync } from '../lib/sync';
import { Folder, Note } from '../types/canvas';

export type ConfirmDialogState = { title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void };

export type NotebookStore = {
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  syncState: SyncState;
  confirmDialog: ConfirmDialogState | null;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
};

export const NotebookContext = createContext<NotebookStore | null>(null);

export function useNotebook() {
  const context = useContext(NotebookContext);
  if (!context) throw new Error('useNotebook must be used within NotebookProvider');
  return context;
}

export function NotebookProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>(readNotes);
  const [folders, setFolders] = useState<Folder[]>(readFolders);
  const syncState = useCloudNotesSync(notes, setNotes);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)), [folders]);

  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    let cancelled = false;
    void probeApiAvailable().then((available) => {
      if (!available || cancelled) return;
      return fetch('/api/folders', { headers: apiHeaders() })
        .then(async (response) => response.ok ? response.json() as Promise<Folder[]> : Promise.reject(new Error('Folder sync failed')))
        .then((cloudFolders) => {
          if (cancelled) return;
          const normalized = cloudFolders.map(normalizeFolder);
          setFolders((current) => {
            const cloudIds = new Set(normalized.map((folder) => folder.id));
            const localOnly = current.filter((folder) => !cloudIds.has(folder.id));
            return [...normalized, ...localOnly].map(normalizeFolder);
          });
        })
        .catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ notes, setNotes, folders, setFolders, syncState, confirmDialog, setConfirmDialog }), [notes, folders, syncState, confirmDialog]);
  return <NotebookContext.Provider value={value}>
    {children}
    <ConfirmDialogHost state={confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }} />
  </NotebookContext.Provider>;
}
