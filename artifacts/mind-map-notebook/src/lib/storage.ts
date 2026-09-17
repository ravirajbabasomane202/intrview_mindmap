import { uid } from './uid';
import { Folder, Note, Page } from '../types/canvas';

export function normalizeFolder(folder: Folder): Folder {
  return {
    ...folder,
    parentFolderId: folder.parentFolderId ?? undefined,
  };
}

export function isRootFolderParent(parentFolderId?: string | null) {
  return parentFolderId == null || parentFolderId === '';
}

export const STORAGE_KEY = 'mind-map-notebook-v1';
export const FOLDERS_KEY = 'mind-map-notebooks-folders-v1';
export const colors = ['#d9ebe3', '#f7dfbd', '#f4cfc8', '#d8e4ee', '#e4ddf1'];
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const ANON_USER_KEY = 'mind-map-notebook-user-id';
export const getAnonUserId = (): string => {
  let id = localStorage.getItem(ANON_USER_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(ANON_USER_KEY, id);
  }
  return id;
};

export const apiHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-User-Id': getAnonUserId(),
});

export const seedNotes: Note[] = [
  {
    id: 'photosynthesis',
    title: 'Photosynthesis · the big picture',
    template: 'Science study map',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: true,
    archived: false,
    inTrash: false,
    tags: ['biology', 'science'],
    pages: [{
      id: 'page-1',
      title: 'Overview',
      objects: [
        { id: 'p1', type: 'shape', x: -175, y: -110, width: 350, height: 104, rotation: 0, zIndex: 1, content: 'Photosynthesis', color: '#1f5e60', fill: '#d9ebe3' },
        { id: 'p2', type: 'text', x: -300, y: 78, width: 210, height: 102, rotation: -2, zIndex: 2, content: 'Light energy\nbecomes chemical energy', color: '#334155', fill: '#f7dfbd' },
        { id: 'p3', type: 'formula', x: 85, y: 78, width: 260, height: 102, rotation: 2, zIndex: 2, content: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', color: '#334155', fill: '#d8e4ee' },
      ],
      connections: [],
      strokes: [],
    }],
    sections: [],
  },
  {
    id: 'renaissance',
    title: 'Renaissance notes',
    template: 'History timeline',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: false,
    archived: false,
    inTrash: false,
    tags: ['history'],
    pages: [{
      id: 'page-1',
      title: 'Overview',
      objects: [
        { id: 'r1', type: 'shape', x: -170, y: -55, width: 340, height: 90, rotation: 0, zIndex: 1, content: 'A cultural reset', color: '#1f5e60', fill: '#f4cfc8' },
        { id: 'r2', type: 'text', x: -125, y: 110, width: 250, height: 84, rotation: -3, zIndex: 2, content: 'Florence\n→ humanism\n→ new ways of seeing', color: '#334155', fill: '#d9ebe3' },
      ],
      connections: [],
      strokes: [],
    }],
    sections: [],
  },
  {
    id: 'geometry',
    title: 'Geometry proofs',
    template: 'Problem solving',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: false,
    archived: false,
    inTrash: false,
    tags: ['math'],
    pages: [{
      id: 'page-1',
      title: 'Triangles',
      objects: [
        { id: 'g1', type: 'shape', x: -125, y: -70, width: 250, height: 92, rotation: 0, zIndex: 1, content: 'Triangle congruence', color: '#1f5e60', fill: '#d8e4ee' },
        { id: 'g2', type: 'formula', x: -175, y: 90, width: 350, height: 74, rotation: 1, zIndex: 2, content: 'SAS  ·  ASA  ·  SSS', color: '#334155', fill: '#f7dfbd' },
      ],
      connections: [],
      strokes: [],
    }],
    sections: [],
  },
];

export function migrateNoteToNewFormat(note: Note): Note {
  // Migrate old single-page notes to new multi-page format
  if (!note.pages || note.pages.length === 0) {
    const page: Page = {
      id: uid('page'),
      title: 'Default Page',
      objects: note.objects || [],
      strokes: note.strokes,
      connections: note.connections,
    };
    return {
      ...note,
      pages: [page],
      sections: [],
      archived: note.archived ?? false,
      inTrash: note.inTrash ?? false,
      tags: note.tags ?? [],
      createdAt: note.createdAt || new Date().toISOString(),
    };
  }
  return note;
}

export function readNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Note[] : seedNotes;
    return parsed.map((note) => {
      const migrated = migrateNoteToNewFormat(note);
      return {
        ...migrated,
        pages: migrated.pages.map((page) => ({
          ...page,
          objects: page.objects.map((object) => ({
            ...object,
            content: object.content.replaceAll('\\n', '\n'),
          })),
        })),
      };
    });
  } catch {
    return seedNotes;
  }
}

export function readFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const parsed = raw ? JSON.parse(raw) as Folder[] : [];
    return parsed.map(normalizeFolder);
  } catch {
    return [];
  }
}
