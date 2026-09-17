import { type ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, FileImage, FileText, FolderPlus, Plus, Search, Star, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Folder as FolderIcon } from 'lucide-react';
import { AuthControls, syncLabel } from '../components/AuthControls';
import { Logo } from '../components/Logo';
import { relativeDate } from '../lib/date';
import { STORAGE_KEY, apiHeaders, colors, isRootFolderParent, normalizeFolder } from '../lib/storage';
import { CLOUD_SYNC_ENABLED, deleteNoteFromCloud } from '../lib/sync';
import { templateObjects } from '../lib/templates';
import { uid } from '../lib/uid';
import { useNotebook } from '../store/notebook-store';
import { Folder, Note } from '../types/canvas';

export function Home() {
  const { notes, setNotes, folders, setFolders, syncState, setConfirmDialog } = useNotebook();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'archive' | 'trash'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'modified' | 'created'>('modified');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedFolders((current) => {
      if (current.size > 0) return current;
      const next = new Set<string>();
      for (const folder of folders) {
        if (folders.some((child) => child.parentFolderId === folder.id)) next.add(folder.id);
      }
      return next;
    });
  }, [folders]);

  const createFolder = (parentFolderId?: string) => {
    const now = new Date().toISOString();
    const localFolder: Folder = { id: uid('folder'), name: '', parentFolderId, createdAt: now, updatedAt: now };
    setFolders((current) => [...current, localFolder]);
    if (parentFolderId) setExpandedFolders((current) => new Set(current).add(parentFolderId));
    setEditingFolderId(localFolder.id);
  };

  const cancelFolderCreation = (folder: Folder) => {
    setEditingFolderId(null);
    if (!folder.name) setFolders((current) => current.filter((item) => item.id !== folder.id));
  };

  const renameFolder = async (folder: Folder, name: string) => {
    const trimmedName = name.trim();
    const isNewFolder = !folder.name;
    setEditingFolderId(null);
    if (!trimmedName) {
      if (isNewFolder) setFolders((current) => current.filter((item) => item.id !== folder.id));
      return;
    }
    if (trimmedName === folder.name) return;
    const updated = { ...folder, name: trimmedName, updatedAt: new Date().toISOString() };
    setFolders((current) => current.map((item) => item.id === folder.id ? updated : item));
    if (!CLOUD_SYNC_ENABLED) return;
    if (isNewFolder) {
      try {
        const response = await fetch('/api/folders', {
          method: 'POST', headers: apiHeaders(),
          body: JSON.stringify({ name: trimmedName, parentFolderId: folder.parentFolderId }),
        });
        if (!response.ok) throw new Error('Folder creation failed');
        const created = normalizeFolder(await response.json() as Folder);
        setFolders((current) => current.map((item) => item.id === folder.id ? created : item));
      } catch {
        // Keep optimistic local folder when cloud sync is unavailable.
      }
      return;
    }
    void fetch(`/api/folders/${encodeURIComponent(folder.id)}`, {
      method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ name: trimmedName }),
    }).catch(() => undefined);
  };

  const deleteFolder = (folder: Folder) => {
    setConfirmDialog({
      title: 'Delete folder',
      description: `Delete "${folder.name}"? Notes will be moved back to the library.`,
      confirmLabel: 'Delete folder',
      destructive: true,
      onConfirm: () => {
        setFolders((current) => current.filter((item) => item.id !== folder.id).map((item) => item.parentFolderId === folder.id ? { ...item, parentFolderId: folder.parentFolderId } : item));
        setNotes((current) => current.map((note) => note.folderId === folder.id ? { ...note, folderId: undefined, updatedAt: new Date().toISOString() } : note));
        if (selectedFolderId === folder.id) setSelectedFolderId(null);
        if (!CLOUD_SYNC_ENABLED) return;
        void fetch(`/api/folders/${encodeURIComponent(folder.id)}`, { method: 'DELETE', headers: apiHeaders() }).catch(() => undefined);
        for (const child of folders.filter((item) => item.parentFolderId === folder.id)) {
          void fetch(`/api/folders/${encodeURIComponent(child.id)}`, {
            method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ parentFolderId: folder.parentFolderId ?? null }),
          }).catch(() => undefined);
        }
      },
    });
  };

  const moveNoteToFolder = (noteId: string, folderId?: string) => {
    setNotes((current) => current.map((note) => note.id === noteId ? { ...note, folderId, updatedAt: new Date().toISOString() } : note));
  };

  const createNote = (template = 'Blank canvas') => {
    const page = templateObjects(template);
    const note: Note = {
      id: uid('note'),
      title: template === 'Blank canvas' ? 'Untitled map' : template,
      template,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorite: false,
      archived: false,
      inTrash: false,
      tags: [],
      folderId: selectedFolderId ?? undefined,
      pages: [page],
      sections: [],
    };
    setNotes((current) => {
      const nextNotes = [note, ...current];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextNotes));
      return nextNotes;
    });
    setTemplateMenuOpen(false);
    setLocation(`/note/${note.id}`);
  };

  const duplicateNote = (id: string) => {
    const original = notes.find((n) => n.id === id);
    if (!original) return;
    const duplicated: Note = {
      ...original,
      id: uid('note'),
      title: `${original.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: original.pages.map((page) => ({
        ...page,
        id: uid('page'),
      })),
    };
    setNotes((current) => [duplicated, ...current]);
  };

  const toggleFavorite = (id: string) =>
    setNotes((current) =>
      current.map((n) =>
        n.id === id ? { ...n, favorite: !n.favorite, updatedAt: new Date().toISOString() } : n
      )
    );

  const toggleArchive = (id: string) =>
    setNotes((current) =>
      current.map((n) =>
        n.id === id ? { ...n, archived: !n.archived, updatedAt: new Date().toISOString() } : n
      )
    );

  const moveToTrash = (id: string) =>
    setNotes((current) =>
      current.map((n) =>
        n.id === id ? { ...n, inTrash: true, updatedAt: new Date().toISOString() } : n
      )
    );

  const restoreFromTrash = (id: string) =>
    setNotes((current) =>
      current.map((n) =>
        n.id === id ? { ...n, inTrash: false, updatedAt: new Date().toISOString() } : n
      )
    );

  const permanentlyDeleteNote = (id: string) => {
    setConfirmDialog({
      title: 'Permanently delete note',
      description: 'Permanently delete this note? This cannot be undone.',
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: () => {
        setNotes((current) => current.filter((n) => n.id !== id));
        if (CLOUD_SYNC_ENABLED) void deleteNoteFromCloud(id).catch(() => undefined);
      },
    });
  };

  const addTag = (id: string, tag: string) => {
    setNotes((current) =>
      current.map((n) =>
        n.id === id && !n.tags.includes(tag)
          ? { ...n, tags: [...n.tags, tag], updatedAt: new Date().toISOString() }
          : n
      )
    );
  };

  const removeTag = (id: string, tag: string) => {
    setNotes((current) =>
      current.map((n) =>
        n.id === id
          ? { ...n, tags: n.tags.filter((t) => t !== tag), updatedAt: new Date().toISOString() }
          : n
      )
    );
  };

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));

  const folderAndDescendantIds = (folderId: string): Set<string> => {
    const ids = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  };

  const visibleNotes = notes.filter((note) => {
    // Filter by status (all/favorites/archive/trash)
    if (filter === 'trash' && !note.inTrash) return false;
    if (filter === 'archive' && !note.archived) return false;
    if (filter === 'archive' || filter === 'trash') {
      // Already filtered above
    } else if (note.inTrash || note.archived) {
      return false; // Hide trash and archived in 'all' view
    }
    if (filter === 'favorites' && !note.favorite) return false;

    // Search the whole notebook, not just the card title.
    const searchTerm = search.trim().toLocaleLowerCase();
    if (searchTerm) {
      const searchableText = [
        note.title,
        ...note.tags,
        ...(note.sections ?? []).map((section) => section.title),
        ...note.pages.flatMap((page) => [page.title, ...(page.objects ?? []).map((object) => object.content)]),
      ].join('\n').toLocaleLowerCase();
      if (!searchableText.includes(searchTerm)) return false;
    }

    // Filter by selected tag
    if (selectedTag && !note.tags.includes(selectedTag)) return false;

    if (selectedFolderId) {
      const allowed = folderAndDescendantIds(selectedFolderId);
      if (!note.folderId || !allowed.has(note.folderId)) return false;
    }

    return true;
  }).sort((a, b) => {
    const dateFor = (note: Note) => Date.parse(sortBy === 'created' ? note.createdAt : note.updatedAt) || 0;
    return dateFor(b) - dateFor(a);
  });

  const foldersByParent = (parentFolderId?: string | null) => folders
    .filter((folder) => isRootFolderParent(parentFolderId) ? isRootFolderParent(folder.parentFolderId) : folder.parentFolderId === parentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const renderFolder = (folder: Folder, depth = 0): ReactNode => {
    const children = foldersByParent(folder.id);
    const folderNotes = notes.filter((note) => note.folderId === folder.id && !note.archived && !note.inTrash);
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const noteCount = notes.filter((note) => note.folderId === folder.id && !note.archived && !note.inTrash).length;
    const hasChildren = children.length > 0 || folderNotes.length > 0;
    return <div key={folder.id}>
      <div className={`group flex items-center gap-1 rounded-xl pr-1 transition-colors ${isSelected ? 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--muted))]'}`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
        {hasChildren ? <button type="button" aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'} onClick={() => setExpandedFolders((current) => { const next = new Set(current); isExpanded ? next.delete(folder.id) : next.add(folder.id); return next; })} className="rounded p-1 text-[hsl(var(--muted-foreground))]"><ChevronRight size={14} className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'} /></button> : <span className="w-6" />}
        {editingFolderId === folder.id ? <input autoFocus defaultValue={folder.name} placeholder="Folder name" onBlur={(event) => void renameFolder(folder, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') cancelFolderCreation(folder); }} className="min-w-0 flex-1 rounded bg-[hsl(var(--card))] px-1 py-1 text-xs outline outline-1 outline-[hsl(var(--primary)/.4)]" aria-label="Folder name" /> : <button type="button" onClick={() => setSelectedFolderId(isSelected ? null : folder.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-xs font-semibold"><FolderIcon size={14} className="shrink-0" fill={isSelected ? 'currentColor' : 'none'} /><span className="truncate">{folder.name}</span><span className="ml-auto text-[11.5px] font-medium opacity-60">{noteCount}</span></button>}
        <div className="hidden items-center group-hover:flex">
          <button type="button" onClick={() => void createFolder(folder.id)} title="New subfolder" className="rounded p-1 hover:bg-[hsl(var(--card))]"><Plus size={13} /></button>
          <button type="button" onClick={() => setEditingFolderId(folder.id)} title="Rename folder" className="rounded p-1 hover:bg-[hsl(var(--card))]"><Check size={13} /></button>
          <button type="button" onClick={() => void deleteFolder(folder)} title="Delete folder" className="rounded p-1 hover:bg-[hsl(var(--destructive)/.12)] hover:text-[hsl(var(--destructive))]"><Trash2 size={13} /></button>
        </div>
      </div>
      {isExpanded && (
        <>
          {folderNotes.map((note) => (
            <Link key={note.id} href={`/note/${note.id}`} className="flex items-center gap-2 truncate py-1.5 text-left text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" style={{ paddingLeft: `${28 + depth * 16}px` }}>
              <FileText size={12} className="shrink-0" />
              <span className="truncate">{note.title}</span>
            </Link>
          ))}
          {children.map((child) => renderFolder(child, depth + 1))}
        </>
      )}
    </div>;
  };

  return (
    <main className="min-h-[100dvh] bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-10 lg:px-14">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-[hsl(var(--muted-foreground))] sm:block">{syncLabel(syncState)}</span>
          <AuthControls />
        </div>
      </header>
      <section className="mx-auto max-w-[1280px] px-5 pb-10 pt-10 sm:px-10 sm:pt-16 lg:px-14">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="animate-rise">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Your thinking space</p>
            <h1 className="font-serif text-5xl leading-[.98] tracking-[-.045em] text-[hsl(var(--foreground))] sm:text-6xl">My Notes</h1>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-[hsl(var(--muted-foreground))]">Arrange the pieces. Follow the thread. Keep the good questions close.</p>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setTemplateMenuOpen((value) => !value)} data-testid="button-new-note"
              className="group flex w-fit items-center gap-2.5 rounded-2xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_10px_24px_hsl(183_41%_30%/.18)] transition-transform hover:-translate-y-0.5 active:translate-y-0">
              <Plus size={18} /> New note <span className="ml-2 text-lg font-normal opacity-50 transition-transform group-hover:translate-x-0.5">→</span>
            </button>
            {templateMenuOpen && <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-52 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="menu-note-templates">
              <p className="px-2 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Start with a template</p>
              {['Blank canvas', 'Mind map', 'Math study'].map((template) => <button key={template} type="button" onClick={() => createNote(template)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><span>{template}</span><span className="text-[hsl(var(--muted-foreground))]">→</span></button>)}
            </div>}
          </div>
        </div>
        <div className="mt-12 flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] pb-3">
          <div className="segmented" data-testid="filter-segmented">
            <button type="button" onClick={() => { setFilter('all'); setSelectedTag(null); setSelectedFolderId(null); }} className={filter === 'all' ? 'segmented-active' : ''} data-testid="tab-all-notes">All notes <span className="ml-1 font-mono text-[11.5px] font-normal opacity-70">{notes.filter(n => !n.inTrash && !n.archived).length}</span></button>
            <button type="button" onClick={() => { setFilter('favorites'); setSelectedTag(null); setSelectedFolderId(null); }} className={filter === 'favorites' ? 'segmented-active' : ''} data-testid="tab-favorites">Favorites</button>
            {(filter === 'archive' || notes.some(n => n.archived)) && <button type="button" onClick={() => { setFilter('archive'); setSelectedTag(null); setSelectedFolderId(null); }} className={filter === 'archive' ? 'segmented-active' : ''} data-testid="tab-archive">Archive</button>}
            {(filter === 'trash' || notes.some(n => n.inTrash)) && <button type="button" onClick={() => { setFilter('trash'); setSelectedTag(null); setSelectedFolderId(null); }} className={filter === 'trash' ? 'segmented-active' : ''} data-testid="tab-trash">Trash</button>}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-[hsl(var(--muted-foreground))]">
              <Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes and content" className="w-24 bg-transparent text-xs outline-none placeholder:text-[hsl(var(--muted-foreground))] sm:w-40" data-testid="input-search-notes" />
            </label>
            <select value={selectedTag ?? ''} onChange={(event) => setSelectedTag(event.target.value || null)} aria-label="Filter by tag" className="hidden rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] outline-none md:block" data-testid="select-tag-filter">
              <option value="">All tags</option>
              {allTags.map((tag) => <option key={tag} value={tag}>#{tag}</option>)}
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'modified' | 'created')} aria-label="Sort notes" className="rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] outline-none" data-testid="select-note-sort">
              <option value="modified">Modified</option>
              <option value="created">Created</option>
            </select>
          </div>
        </div>
        {allTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedTag === tag
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent)/.2)]'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-3 sm:p-4" data-testid="folder-browser">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setSelectedFolderId(null)} className={`flex items-center gap-2 text-sm font-semibold ${selectedFolderId === null ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>
              <FolderIcon size={16} fill={selectedFolderId === null ? 'currentColor' : 'none'} /> Folders
            </button>
            <button type="button" onClick={() => void createFolder()} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--muted))]" data-testid="button-new-folder"><FolderPlus size={15} /> New folder</button>
          </div>
          {folders.length === 0 ? <p className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">Create folders to keep related maps together.</p> : <div className="max-h-52 overflow-y-auto">{foldersByParent(undefined).map((folder) => renderFolder(folder))}</div>}
        </div>
        {visibleNotes.length === 0 ? (
          filter === 'all' ? (
            <div className="animate-pop mt-14 flex flex-col items-center text-center">
              <h2 className="font-serif text-2xl">Start with a thought.</h2>
              <p className="mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">Pick a starting point and let the shape of your thinking emerge.</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <button type="button" onClick={() => createNote('Blank canvas')} className="elev-1 group flex w-64 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left transition-all duration-200 hover:-translate-y-0.5" data-testid="button-empty-blank-page">
                  <div className="dot-grid flex h-36 items-center justify-center bg-[hsl(var(--secondary)/.35)]">
                    <div className="h-16 w-12 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_2px_6px_hsl(30_20%_40%/.08)]" />
                  </div>
                  <div className="p-4">
                    <p className="font-serif text-lg">Blank page</p>
                    <p className="mt-0.5 text-[13px] text-[hsl(var(--muted-foreground))]">Start with an open canvas</p>
                  </div>
                </button>
                <button type="button" onClick={() => createNote('Mind map')} className="elev-1 group flex w-64 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left transition-all duration-200 hover:-translate-y-0.5" data-testid="button-empty-mind-map">
                  <div className="dot-grid relative flex h-36 items-center justify-center bg-[hsl(var(--secondary)/.35)]">
                    <div className="h-9 w-16 rounded-lg bg-[hsl(var(--teal-soft))]" />
                    <div className="absolute left-9 top-9 h-6 w-11 rounded-md bg-[hsl(var(--coral-soft))]" />
                    <div className="absolute right-9 bottom-9 h-6 w-11 rounded-md bg-[hsl(var(--coral-soft))]" />
                  </div>
                  <div className="p-4">
                    <p className="font-serif text-lg">Mind map starter</p>
                    <p className="mt-0.5 text-[13px] text-[hsl(var(--muted-foreground))]">A central idea with two branches</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-pop mt-14 flex flex-col items-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><FileText size={25} /></div>
              <h2 className="font-serif text-2xl">{filter === 'trash' ? 'Trash is empty' : 'No archived notes'}</h2>
              <p className="mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">Move some notes here to see them</p>
            </div>
          )
        ) : (
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNotes.map((note, index) => {
              const totalObjects = note.pages.reduce((sum, p) => sum + p.objects.length, 0);
              return (
                <article key={note.id} className="animate-rise group relative overflow-hidden rounded-[1.35rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_5px_18px_hsl(30_20%_40%/.035)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_hsl(30_20%_40%/.10)]" style={{ animationDelay: `${index * 70}ms` }} data-testid={`card-note-${note.id}`}>
                  <Link href={`/note/${note.id}`} className="block">
                    <div className="dot-grid relative h-44 overflow-hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.38)] p-5">
                      <div className="absolute left-1/2 top-1/2 h-16 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] rounded-xl border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--card)/.75)] px-3 py-2.5 shadow-sm">
                        <div className="mb-2 h-1.5 w-16 rounded-full bg-[hsl(var(--primary)/.55)]" /><div className="h-1.5 w-24 rounded-full bg-[hsl(var(--accent)/.45)]" /><div className="mt-2 h-1.5 w-10 rounded-full bg-[hsl(var(--primary)/.25)]" />
                      </div>
                      {note.pages[0]?.objects.slice(0, 3).map((object, objectIndex) => <div key={object.id} className="absolute h-6 w-14 rounded-md border border-[hsl(var(--primary)/.14)]" style={{ left: `${22 + objectIndex * 25}%`, top: `${27 + (objectIndex % 2) * 29}%`, backgroundColor: object.fill, transform: `rotate(${object.rotation}deg)` }} />)}
                      <span className="absolute left-5 top-4 rounded-full bg-[hsl(var(--card)/.82)] px-2 py-1 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{note.template}</span>
                    </div>
                  </Link>
                  <div className="p-5">
                    <Link href={`/note/${note.id}`} className="block">
                      <h2 className="truncate font-serif text-xl tracking-[-.02em]" data-testid={`text-note-title-${note.id}`}>{note.title}</h2>
                      <p className="mt-1.5 font-mono text-[11.5px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{relativeDate(note.updatedAt)} · {note.pages.length} page{note.pages.length !== 1 ? 's' : ''} · {totalObjects} piece{totalObjects !== 1 ? 's' : ''}</p>
                    </Link>
                    {note.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {note.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="inline-block rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">#{tag}</span>
                        ))}
                        {note.tags.length > 2 && <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">+{note.tags.length - 2}</span>}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => toggleFavorite(note.id)} className={`rounded-lg p-2 transition-colors ${note.favorite ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} aria-label={note.favorite ? 'Remove favorite' : 'Add favorite'} data-testid={`button-favorite-${note.id}`}><Star size={16} fill={note.favorite ? 'currentColor' : 'none'} /></button>
                        {filter === 'trash' ? (
                          <>
                            <button type="button" onClick={() => restoreFromTrash(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" title="Restore" data-testid={`button-restore-${note.id}`}><ArrowLeft size={15} /></button>
                            <button type="button" onClick={() => permanentlyDeleteNote(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" title="Delete permanently" data-testid={`button-delete-permanently-${note.id}`}><Trash2 size={15} /></button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => toggleArchive(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" title={note.archived ? 'Unarchive' : 'Archive'} data-testid={`button-archive-${note.id}`}><FileImage size={15} /></button>
                            <button type="button" onClick={() => moveToTrash(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition-all hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] group-hover:opacity-100" title="Delete" data-testid={`button-delete-${note.id}`}><Trash2 size={15} /></button>
                            <button type="button" onClick={() => duplicateNote(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition-all hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] group-hover:opacity-100" title="Duplicate" data-testid={`button-duplicate-${note.id}`}><Copy size={15} /></button>
                          </>
                        )}
                      </div>
                      {filter !== 'trash' && <label className="flex max-w-32 items-center gap-1 text-[11.5px] text-[hsl(var(--muted-foreground))]" title="Move to folder">
                        <FolderIcon size={12} />
                        <select value={note.folderId ?? ''} onChange={(event) => moveNoteToFolder(note.id, event.target.value || undefined)} className="min-w-0 max-w-24 bg-transparent text-[11.5px] outline-none" aria-label={`Folder for ${note.title}`} data-testid={`select-note-folder-${note.id}`}>
                          <option value="">Library</option>
                          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                        </select>
                      </label>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <footer className="mt-16 flex items-center justify-between border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]"><span>Mind Map Notebook</span><span>{syncState === 'synced' ? 'Private cloud sync enabled' : 'Local-first & private'}</span></footer>
      </section>
    </main>
  );
}

// Practical bounds for "infinite" zoom — generous enough that no user will ever hit them,
// just tight enough to keep the transform math numerically sane.
