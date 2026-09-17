import { SyncState } from '../lib/sync';

export function syncLabel(state: SyncState) {
  if (state === 'syncing') return 'Syncing…';
  if (state === 'synced') return 'Synced';
  if (state === 'offline') return 'Offline · saved locally';
  if (state === 'conflict') return 'Needs review';
  return 'Saved locally';
}

export function AuthControls() {
  return null;
}
