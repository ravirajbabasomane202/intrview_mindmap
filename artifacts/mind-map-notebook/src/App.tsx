import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowLeft, Check, Download, FileImage, FileText, Grid2X2, ImageIcon, Maximize2,
  Minus, MousePointer2, Palette, PanelRight, Plus, Redo2, Search, Shapes, Sigma,
  Sparkles, Star, Table2, Trash2, Undo2, ZoomIn,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';

type ObjectType = 'text' | 'formula' | 'image' | 'table' | 'shape';
type Tool = 'select' | 'draw' | 'connect';
type Point = { x: number; y: number };
type Stroke = { id: string; points: Point[] };
type Connection = { id: string; from: string; to: string };
type CanvasObject = {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: string;
  color: string;
  fill: string;
};
type Note = {
  id: string;
  title: string;
  template: string;
  updatedAt: string;
  favorite: boolean;
  objects: CanvasObject[];
  strokes?: Stroke[];
  connections?: Connection[];
};

const queryClient = new QueryClient();
const STORAGE_KEY = 'mind-map-notebook-v1';
const colors = ['#d9ebe3', '#f7dfbd', '#f4cfc8', '#d8e4ee', '#e4ddf1'];

const seedNotes: Note[] = [
  {
    id: 'photosynthesis',
    title: 'Photosynthesis · the big picture',
    template: 'Science study map',
    updatedAt: 'Today, 9:42 AM',
    favorite: true,
    objects: [
      { id: 'p1', type: 'shape', x: -175, y: -110, width: 350, height: 104, rotation: 0, zIndex: 1, content: 'Photosynthesis', color: '#1f5e60', fill: '#d9ebe3' },
      { id: 'p2', type: 'text', x: -300, y: 78, width: 210, height: 102, rotation: -2, zIndex: 2, content: 'Light energy\nbecomes chemical energy', color: '#334155', fill: '#f7dfbd' },
      { id: 'p3', type: 'formula', x: 85, y: 78, width: 260, height: 102, rotation: 2, zIndex: 2, content: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', color: '#334155', fill: '#d8e4ee' },
    ],
    connections: [],
    strokes: [],
  },
  {
    id: 'renaissance',
    title: 'Renaissance notes',
    template: 'History timeline',
    updatedAt: 'Yesterday, 4:18 PM',
    favorite: false,
    objects: [
      { id: 'r1', type: 'shape', x: -170, y: -55, width: 340, height: 90, rotation: 0, zIndex: 1, content: 'A cultural reset', color: '#1f5e60', fill: '#f4cfc8' },
      { id: 'r2', type: 'text', x: -125, y: 110, width: 250, height: 84, rotation: -3, zIndex: 2, content: 'Florence\n→ humanism\n→ new ways of seeing', color: '#334155', fill: '#d9ebe3' },
    ],
    connections: [],
    strokes: [],
  },
  {
    id: 'geometry',
    title: 'Geometry proofs',
    template: 'Problem solving',
    updatedAt: 'Mar 14, 2024',
    favorite: false,
    objects: [
      { id: 'g1', type: 'shape', x: -125, y: -70, width: 250, height: 92, rotation: 0, zIndex: 1, content: 'Triangle congruence', color: '#1f5e60', fill: '#d8e4ee' },
      { id: 'g2', type: 'formula', x: -175, y: 90, width: 350, height: 74, rotation: 1, zIndex: 2, content: 'SAS  ·  ASA  ·  SSS', color: '#334155', fill: '#f7dfbd' },
    ],
    connections: [],
    strokes: [],
  },
];

function readNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Note[] : seedNotes;
    return parsed.map((note) => ({
      ...note,
      objects: note.objects.map((object) => ({
        ...object,
        content: object.content.replaceAll('\\n', '\n'),
      })),
    }));
  } catch {
    return seedNotes;
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function relativeDate(date: string) {
  if (date.includes('Today') || date.includes('Yesterday')) return date;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
}

function Logo({ compact = false }: { compact?: boolean }) {
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

function IconButton({ label, children, onClick, active = false, testId }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; testId: string }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_5px_12px_hsl(183_41%_30%/.2)]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}`}>
      {children}
    </button>
  );
}

function ToolButton({ label, onClick, active = false, testId }: { label: string; onClick: () => void; active?: boolean; testId: string }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick}
      className={`flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_5px_12px_hsl(183_41%_30%/.2)]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}`}>
      {label}
    </button>
  );
}

function templateObjects(template: string): CanvasObject[] {
  if (template === 'Mind map') {
    return [
      { id: uid('shape'), type: 'shape', x: -150, y: -60, width: 300, height: 100, rotation: 0, zIndex: 1, content: 'Central idea', color: '#1f5e60', fill: '#d9ebe3' },
      { id: uid('text'), type: 'text', x: -370, y: 120, width: 220, height: 90, rotation: -2, zIndex: 2, content: 'First branch', color: '#334155', fill: '#f7dfbd' },
      { id: uid('text'), type: 'text', x: 150, y: 120, width: 220, height: 90, rotation: 2, zIndex: 2, content: 'Second branch', color: '#334155', fill: '#d8e4ee' },
    ];
  }
  if (template === 'Math study') {
    return [
      { id: uid('formula'), type: 'formula', x: -180, y: -90, width: 360, height: 90, rotation: 0, zIndex: 1, content: 'a² + b² = c²', color: '#334155', fill: '#d8e4ee' },
      { id: uid('text'), type: 'text', x: -180, y: 75, width: 360, height: 100, rotation: -1, zIndex: 2, content: 'What do I know?\nWhat do I need to prove?', color: '#334155', fill: '#f7dfbd' },
    ];
  }
  return [];
}

function Home() {
  const [notes, setNotes] = useState<Note[]>(readNotes);
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)), [notes]);

  const createNote = (template = 'Blank canvas') => {
    const note: Note = {
      id: uid('note'), title: template === 'Blank canvas' ? 'Untitled map' : template,
      template, updatedAt: new Date().toISOString(), favorite: false,
      objects: templateObjects(template), connections: [], strokes: [],
    };
    setNotes((current) => [note, ...current]);
    setTemplateMenuOpen(false);
    setLocation(`/note/${note.id}`);
  };
  const toggleFavorite = (id: string) => setNotes((current) => current.map((n) => n.id === id ? { ...n, favorite: !n.favorite, updatedAt: new Date().toISOString() } : n));
  const removeNote = (id: string) => {
    if (window.confirm('Delete this note? This cannot be undone.')) setNotes((current) => current.filter((n) => n.id !== id));
  };
  const visibleNotes = notes.filter((note) => (filter === 'all' || note.favorite) && note.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-[100dvh] bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-10 lg:px-14">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-[hsl(var(--muted-foreground))] sm:block">A quiet place for ideas</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="avatar-user">AM</div>
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
              <p className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Start with a template</p>
              {['Blank canvas', 'Mind map', 'Math study'].map((template) => <button key={template} type="button" onClick={() => createNote(template)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><span>{template}</span><span className="text-[hsl(var(--muted-foreground))]">→</span></button>)}
            </div>}
          </div>
        </div>
        <div className="mt-12 flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] pb-3">
          <div className="flex gap-6 text-sm">
            <button type="button" onClick={() => setFilter('all')} className={`${filter === 'all' ? 'border-b-2 border-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'} pb-3`} data-testid="tab-all-notes">All notes <span className="ml-1 text-xs font-normal opacity-60">{notes.length}</span></button>
            <button type="button" onClick={() => setFilter('favorites')} className={`${filter === 'favorites' ? 'border-b-2 border-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'} pb-3`} data-testid="tab-favorites">Favorites</button>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-[hsl(var(--muted-foreground))]">
            <Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" className="w-24 bg-transparent text-xs outline-none placeholder:text-[hsl(var(--muted-foreground))] sm:w-36" data-testid="input-search-notes" />
          </label>
        </div>
        {visibleNotes.length === 0 ? (
          <div className="animate-pop mt-14 flex flex-col items-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><FileText size={25} /></div>
            <h2 className="font-serif text-2xl">A blank page is a beginning</h2>
            <p className="mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">Start a note and let the shape of your thinking emerge.</p>
            <button type="button" onClick={() => createNote()} className="mt-6 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-empty-new-note">Create a note</button>
          </div>
        ) : (
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNotes.map((note, index) => (
              <article key={note.id} className="animate-rise group relative overflow-hidden rounded-[1.35rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_5px_18px_hsl(30_20%_40%/.035)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_hsl(30_20%_40%/.10)]" style={{ animationDelay: `${index * 70}ms` }} data-testid={`card-note-${note.id}`}>
                <Link href={`/note/${note.id}`} className="block">
                  <div className="dot-grid relative h-44 overflow-hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.38)] p-5">
                    <div className="absolute left-1/2 top-1/2 h-16 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] rounded-xl border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--card)/.75)] px-3 py-2.5 shadow-sm">
                      <div className="mb-2 h-1.5 w-16 rounded-full bg-[hsl(var(--primary)/.55)]" /><div className="h-1.5 w-24 rounded-full bg-[hsl(var(--accent)/.45)]" /><div className="mt-2 h-1.5 w-10 rounded-full bg-[hsl(var(--primary)/.25)]" />
                    </div>
                    {note.objects.slice(0, 3).map((object, objectIndex) => <div key={object.id} className="absolute h-6 w-14 rounded-md border border-[hsl(var(--primary)/.14)]" style={{ left: `${22 + objectIndex * 25}%`, top: `${27 + (objectIndex % 2) * 29}%`, backgroundColor: object.fill, transform: `rotate(${object.rotation}deg)` }} />)}
                    <span className="absolute left-5 top-4 rounded-full bg-[hsl(var(--card)/.82)] px-2 py-1 font-mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{note.template}</span>
                  </div>
                </Link>
                <div className="flex items-start justify-between gap-3 p-5">
                  <Link href={`/note/${note.id}`} className="min-w-0">
                    <h2 className="truncate font-serif text-xl tracking-[-.02em]" data-testid={`text-note-title-${note.id}`}>{note.title}</h2>
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{relativeDate(note.updatedAt)} · {note.objects.length} pieces</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => toggleFavorite(note.id)} className={`rounded-lg p-2 transition-colors ${note.favorite ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} aria-label={note.favorite ? 'Remove favorite' : 'Add favorite'} data-testid={`button-favorite-${note.id}`}><Star size={16} fill={note.favorite ? 'currentColor' : 'none'} /></button>
                    <button type="button" onClick={() => removeNote(note.id)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition-all hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] group-hover:opacity-100" aria-label="Delete note" data-testid={`button-delete-note-${note.id}`}><Trash2 size={15} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <footer className="mt-16 flex items-center justify-between border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]"><span>Mind Map Notebook</span><span>Local & private by default</span></footer>
      </section>
    </main>
  );
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportNoteAsPng(note: Note) {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 900;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#fbf9f4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);

  for (const connection of note.connections ?? []) {
    const from = note.objects.find((object) => object.id === connection.from);
    const to = note.objects.find((object) => object.id === connection.to);
    if (!from || !to) continue;
    context.strokeStyle = 'rgba(31, 94, 96, .45)';
    context.lineWidth = 3;
    context.setLineDash([10, 10]);
    context.beginPath();
    context.moveTo(from.x + from.width / 2, from.y + from.height / 2);
    context.lineTo(to.x + to.width / 2, to.y + to.height / 2);
    context.stroke();
    context.setLineDash([]);
  }
  for (const stroke of note.strokes ?? []) {
    if (stroke.points.length < 2) continue;
    context.strokeStyle = 'rgba(31, 94, 96, .65)';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }
  for (const object of note.objects) {
    context.save();
    context.translate(object.x + object.width / 2, object.y + object.height / 2);
    context.rotate((object.rotation * Math.PI) / 180);
    context.shadowColor = 'rgba(69, 59, 45, .14)';
    context.shadowBlur = 18;
    context.shadowOffsetY = 8;
    context.fillStyle = object.fill;
    roundedRect(context, -object.width / 2, -object.height / 2, object.width, object.height, 18);
    context.fill();
    context.shadowColor = 'transparent';
    context.fillStyle = object.color;
    if (object.type === 'image' && object.content.startsWith('data:')) {
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, -object.width / 2 + 8, -object.height / 2 + 8, object.width - 16, object.height - 16);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = object.content;
      });
    } else if (object.type === 'table') {
      const rows = object.content.split('\n').map((row) => row.split('\t'));
      const cellWidth = object.width / 2;
      const cellHeight = object.height / Math.max(rows.length, 1);
      context.font = '16px "DM Sans", sans-serif';
      rows.forEach((row, rowIndex) => row.slice(0, 2).forEach((cell, cellIndex) => {
        context.strokeStyle = 'rgba(31, 94, 96, .25)';
        context.strokeRect(-object.width / 2 + cellIndex * cellWidth, -object.height / 2 + rowIndex * cellHeight, cellWidth, cellHeight);
        context.fillText(cell, -object.width / 2 + cellIndex * cellWidth + 12, -object.height / 2 + rowIndex * cellHeight + 26);
      }));
    } else {
      context.font = object.type === 'shape' ? '600 26px Fraunces, serif' : '16px "DM Sans", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      object.content.split('\n').forEach((line, lineIndex, lines) => context.fillText(line, 0, (lineIndex - (lines.length - 1) / 2) * 24));
    }
    context.restore();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) saveBlob(blob, `${note.title.replace(/\s+/g, '-').toLowerCase()}.png`);
}

function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState<Note[]>(readNotes);
  const note = notes.find((item) => item.id === id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [connectStart, setConnectStart] = useState<string | null>(null);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [showInspector, setShowInspector] = useState(true);
  const [saveState, setSaveState] = useState('All changes saved');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Note[][]>([]);
  const [redoStack, setRedoStack] = useState<Note[][]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: 'pan' | 'object' | 'draw'; pointerX: number; pointerY: number; startX: number; startY: number; objectId?: string } | null>(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)), [notes]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedId && !(event.target as HTMLElement).matches('input, textarea')) {
        setNotes((current) => current.map((n) => n.id === id ? { ...n, objects: n.objects.filter((o) => o.id !== selectedId), updatedAt: new Date().toISOString() } : n));
        setSelectedId(null); setSaveState('Saved locally');
      }
      if (event.key === 'Escape') { setSelectedId(null); setEditingObjectId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, selectedId]);

  const selected = useMemo(() => note?.objects.find((object) => object.id === selectedId), [note, selectedId]);
  const mutateNote = useCallback((updater: (current: Note) => Note, recordHistory = true) => {
    setNotes((current) => {
      if (recordHistory) {
        setUndoStack((stack) => [...stack.slice(-39), JSON.parse(JSON.stringify(current)) as Note[]]);
        setRedoStack([]);
      }
      return current.map((item) => item.id === id ? updater(item) : item);
    });
    setSaveState('Saved locally');
  }, [id]);
  const pushHistorySnapshot = () => {
    setUndoStack((stack) => [...stack.slice(-39), JSON.parse(JSON.stringify(notes)) as Note[]]);
    setRedoStack([]);
  };
  const undo = () => {
    if (!undoStack.length) {
      setSaveState('Nothing to undo yet');
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, JSON.parse(JSON.stringify(notes)) as Note[]]);
    setNotes(previous);
    setSaveState('Undo saved locally');
    setSelectedId(null);
  };
  const redo = () => {
    if (!redoStack.length) {
      setSaveState('Nothing to redo yet');
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, JSON.parse(JSON.stringify(notes)) as Note[]]);
    setNotes(next);
    setSaveState('Redo saved locally');
  };
  const updateObject = (objectId: string, patch: Partial<CanvasObject>, recordHistory = true) => mutateNote((current) => ({ ...current, updatedAt: new Date().toISOString(), objects: current.objects.map((object) => object.id === objectId ? { ...object, ...patch } : object) }), recordHistory);
  const addObject = (type: ObjectType, contentOverride?: string) => {
    const defaults: Record<ObjectType, Partial<CanvasObject>> = {
      text: { width: 220, height: 110, content: 'A thought worth keeping', fill: '#f7dfbd', color: '#334155' },
      formula: { width: 290, height: 82, content: 'x + y = a useful question', fill: '#d8e4ee', color: '#334155' },
      image: { width: 280, height: 190, content: contentOverride ?? '', fill: '#f5f1e9', color: '#334155' },
      table: { width: 300, height: 150, content: 'Question\tAnswer\nWhat matters?\tMake it visible', fill: '#f5f1e9', color: '#334155' },
      shape: { width: 260, height: 100, content: 'New idea', fill: '#d9ebe3', color: '#1f5e60' },
    };
    const preset = defaults[type];
    const object: CanvasObject = { id: uid(type), type, x: -Number(preset.width) / 2 + (note?.objects.length ?? 0) * 22, y: -40 + (note?.objects.length ?? 0) * 22, rotation: type === 'text' ? -2 : 0, zIndex: (note?.objects.length ?? 0) + 1, ...preset } as CanvasObject;
    mutateNote((current) => ({ ...current, updatedAt: new Date().toISOString(), objects: [...current.objects, object] }));
    setSelectedId(object.id); setEditingObjectId(object.id); setAddMenuOpen(false); setTool('select');
  };
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addObject('image', String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  const canvasPoint = (event: React.PointerEvent): Point => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left - bounds.width / 2 - pan.x) / zoom,
      y: (event.clientY - bounds.top - bounds.height / 2 - pan.y) / zoom,
    };
  };
  const startPan = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const isCanvas = event.target === event.currentTarget;
    if (tool === 'draw' && isCanvas) {
      const point = canvasPoint(event);
      setDrawPoints([point]);
      dragRef.current = { kind: 'draw', pointerX: event.clientX, pointerY: event.clientY, startX: 0, startY: 0 };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'connect' || !isCanvas) return;
    if (isCanvas) {
      dragRef.current = { kind: 'pan', pointerX: event.clientX, pointerY: event.clientY, startX: pan.x, startY: pan.y };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  };
  const startObjectDrag = (event: React.PointerEvent, object: CanvasObject) => {
    if (tool === 'draw') return;
    if (tool === 'connect') {
      event.stopPropagation();
      if (!connectStart) {
        setConnectStart(object.id);
        setSelectedId(object.id);
        setSaveState('Choose another piece');
      } else if (connectStart !== object.id) {
        const exists = (note?.connections ?? []).some((connection) => (connection.from === connectStart && connection.to === object.id) || (connection.from === object.id && connection.to === connectStart));
        if (!exists) {
          mutateNote((current) => ({ ...current, connections: [...(current.connections ?? []), { id: uid('connection'), from: connectStart, to: object.id }] }));
          setSaveState('Connection saved locally');
        }
        setConnectStart(null);
        setSelectedId(object.id);
      }
      return;
    }
    event.stopPropagation(); setSelectedId(object.id); setEditingObjectId(null);
    pushHistorySnapshot();
    dragRef.current = { kind: 'object', pointerX: event.clientX, pointerY: event.clientY, startX: object.x, startY: object.y, objectId: object.id };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const movePointer = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') setPan({ x: drag.startX + event.clientX - drag.pointerX, y: drag.startY + event.clientY - drag.pointerY });
    else if (drag.kind === 'draw') setDrawPoints((current) => [...current, canvasPoint(event)]);
    else if (drag.objectId) updateObject(drag.objectId, { x: drag.startX + (event.clientX - drag.pointerX) / zoom, y: drag.startY + (event.clientY - drag.pointerY) / zoom }, false);
  };
  const endPointer = () => {
    if (dragRef.current?.kind === 'draw' && drawPoints.length > 1) {
      mutateNote((current) => ({ ...current, strokes: [...(current.strokes ?? []), { id: uid('stroke'), points: drawPoints }] }));
      setSaveState('Drawing saved locally');
    }
    setDrawPoints([]);
    dragRef.current = null;
  };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const printNote = () => {
    document.title = note?.title ?? 'Mind Map Notebook';
    window.print();
  };

  if (!note) return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-center"><p className="font-serif text-2xl">This note has wandered off.</p><Link href="/" className="mt-4 inline-block text-sm text-[hsl(var(--primary))]">Return to My Notes</Link></div></div>;

  return (
    <main className="flex min-h-[100dvh] flex-col overflow-hidden bg-[hsl(var(--background))]">
      <header className="z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.86)] px-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label="Back to notes" data-testid="link-back-notes"><ArrowLeft size={18} /></Link>
          <div className="h-6 w-px bg-[hsl(var(--border))]" />
          <Logo compact />
          <div className="ml-1 hidden h-6 w-px bg-[hsl(var(--border))] sm:block" />
          {editingTitle ? <input autoFocus value={note.title} onChange={(event) => mutateNote((current) => ({ ...current, title: event.target.value }))} onBlur={() => setEditingTitle(false)} onKeyDown={(event) => event.key === 'Enter' && setEditingTitle(false)} className="w-44 rounded-lg border border-[hsl(var(--primary)/.35)] bg-transparent px-2 py-1 text-sm font-semibold outline-none sm:w-64" data-testid="input-note-title" /> : <button type="button" onClick={() => setEditingTitle(true)} className="max-w-[190px] truncate text-left text-sm font-semibold hover:text-[hsl(var(--primary))] sm:max-w-xs" data-testid="button-edit-note-title">{note.title}</button>}
        </div>
         <div className="flex items-center gap-1.5 sm:gap-3">
           <button type="button" onClick={undo} aria-label="Undo" title="Undo" data-testid="button-undo" className="hidden h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] sm:flex"><Undo2 size={16} /></button>
           <button type="button" onClick={redo} aria-label="Redo" title="Redo" data-testid="button-redo" className="hidden h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] sm:flex"><Redo2 size={16} /></button>
           <span className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] sm:flex" data-testid="status-save"><Check size={14} className="text-[hsl(var(--primary))]" /> {saveState}</span>
           <button type="button" onClick={() => void exportNoteAsPng(note)} aria-label="Export PNG" title="Export PNG" data-testid="button-export-png" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><FileImage size={16} /></button>
           <button type="button" onClick={printNote} aria-label="Export PDF" title="Print or export PDF" data-testid="button-export-pdf" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"><Download size={16} /></button>
           <button type="button" onClick={() => setShowInspector((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${showInspector ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} aria-label="Toggle inspector" data-testid="button-toggle-inspector"><PanelRight size={17} /></button>
           <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[10px] font-bold text-[hsl(var(--primary-foreground))]">AM</div>
         </div>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
         <aside className="z-10 flex w-[118px] shrink-0 flex-col items-center border-r border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-3 py-5 backdrop-blur-sm">
           <div className="flex w-full flex-col gap-2">
             <div className="relative">
               <ToolButton label="+ Add" onClick={() => setAddMenuOpen((value) => !value)} active={addMenuOpen} testId="button-add" />
               <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="input-image-upload" />
               {addMenuOpen && <div className="absolute left-[calc(100%+10px)] top-0 z-30 w-44 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[0_16px_30px_hsl(30_20%_40%/.14)]" data-testid="menu-add">
                 <p className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Add to canvas</p>
                 <button type="button" onClick={() => addObject('text')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><FileText size={15} /> Text note</button>
                 <button type="button" onClick={() => addObject('formula')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Sigma size={15} /> Math formula</button>
                 <button type="button" onClick={() => imageInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><ImageIcon size={15} /> Image</button>
                 <button type="button" onClick={() => addObject('table')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Table2 size={15} /> Table</button>
                 <button type="button" onClick={() => addObject('shape')} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]"><Shapes size={15} /> Shape</button>
               </div>}
             </div>
             <ToolButton label="Draw" onClick={() => { setTool((value) => value === 'draw' ? 'select' : 'draw'); setConnectStart(null); }} active={tool === 'draw'} testId="button-draw" />
             <ToolButton label="Connect" onClick={() => { setTool((value) => value === 'connect' ? 'select' : 'connect'); setConnectStart(null); }} active={tool === 'connect'} testId="button-connect" />
           </div>
           <div className="mt-auto flex flex-col items-center gap-2 pt-8 text-[10px] text-[hsl(var(--muted-foreground))]">
             <MousePointer2 size={15} />
             <span className="text-center leading-4">{tool === 'draw' ? 'Draw freely' : tool === 'connect' ? (connectStart ? 'Choose another piece' : 'Link two pieces') : 'Select and move'}</span>
           </div>
        </aside>
         <section ref={surfaceRef} className={`relative min-w-0 flex-1 overflow-hidden ${tool === 'draw' ? 'cursor-crosshair' : tool === 'connect' ? 'cursor-cell' : 'cursor-default'} dot-grid`} onPointerDown={startPan} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} data-testid="canvas-surface">
          <div className="pointer-events-none absolute left-6 top-5 z-10 hidden md:block">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Canvas / {note.template}</p>
            <p className="mt-2 max-w-[170px] text-xs leading-5 text-[hsl(var(--muted-foreground))]">Place ideas anywhere. Drag the canvas to make room.</p>
          </div>
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.86)] px-3 py-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] backdrop-blur-md">Tip: select a piece to edit it</div>
          <div className="absolute left-1/2 top-1/2 h-0 w-0 transition-transform duration-100 ease-out" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
             <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
               {(note.connections ?? []).map((connection) => {
                 const from = note.objects.find((object) => object.id === connection.from);
                 const to = note.objects.find((object) => object.id === connection.to);
                 if (!from || !to) return null;
                 return <line key={connection.id} x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} stroke="hsl(183 41% 30% / .45)" strokeWidth="2" strokeDasharray="7 7" />;
               })}
               {(note.strokes ?? []).map((stroke) => <polyline key={stroke.id} points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="hsl(183 41% 30% / .65)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
               {drawPoints.length > 1 && <polyline points={drawPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="hsl(183 41% 30% / .65)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
             </svg>
             {note.objects.map((object) => (
               <div key={object.id} className={`canvas-object absolute flex items-center justify-center overflow-hidden text-center shadow-[0_8px_18px_hsl(30_20%_40%/.11)] transition-shadow ${selectedId === object.id ? 'ring-2 ring-[hsl(var(--accent))] ring-offset-4 ring-offset-[hsl(var(--background))]' : 'hover:shadow-[0_12px_22px_hsl(30_20%_40%/.17)]'} ${object.type === 'shape' ? 'rounded-2xl' : 'rounded-xl'}`}
                 style={{ left: object.x, top: object.y, width: object.width, height: object.height, zIndex: object.zIndex, backgroundColor: object.fill, color: object.color, transform: `rotate(${object.rotation}deg)` }} onPointerDown={(event) => startObjectDrag(event, object)} onDoubleClick={() => object.type !== 'image' && setEditingObjectId(object.id)} data-testid={`canvas-object-${object.id}`}>
                 {object.type === 'image' && object.content.startsWith('data:') ? <img src={object.content} alt="Canvas upload" className="h-full w-full object-cover" /> : editingObjectId === object.id ? <textarea autoFocus value={object.content} onChange={(event) => updateObject(object.id, { content: event.target.value })} onBlur={() => setEditingObjectId(null)} className="h-[78%] w-[85%] resize-none rounded-lg border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--card)/.4)] p-2 text-center text-sm outline-none" data-testid={`textarea-object-${object.id}`} /> : object.type === 'table' ? <div className="grid w-full grid-cols-2 text-left text-xs">{object.content.split('\n').flatMap((row, rowIndex) => row.split('\t').slice(0, 2).map((cell, cellIndex) => <div key={`${rowIndex}-${cellIndex}`} className="border-b border-r border-[hsl(var(--primary)/.18)] px-2 py-2 last:border-b-0">{cell}</div>))}</div> : <span className={`whitespace-pre-line px-5 ${object.type === 'shape' ? 'font-serif text-2xl font-semibold tracking-[-.04em]' : object.type === 'formula' ? 'font-mono text-sm' : 'text-sm font-medium leading-6'}`}>{object.content}</span>}
                 {selectedId === object.id && <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent))]" />}
               </div>
             ))}
          </div>
          {note.objects.length === 0 && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Sparkles size={23} /></div><p className="font-serif text-2xl">Start with one thought</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Choose a tool on the left to begin arranging.</p></div>}
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.9)] p-1.5 shadow-[0_8px_20px_hsl(30_20%_40%/.09)] backdrop-blur-md">
            <IconButton label="Zoom out" onClick={() => setZoom((value) => Math.max(.55, Number((value - .1).toFixed(2))))} testId="button-zoom-out"><Minus size={15} /></IconButton>
            <button type="button" onClick={resetView} className="min-w-12 rounded-lg px-1 py-2 font-mono text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-reset-view">{Math.round(zoom * 100)}%</button>
            <IconButton label="Zoom in" onClick={() => setZoom((value) => Math.min(1.7, Number((value + .1).toFixed(2))))} testId="button-zoom-in"><ZoomIn size={15} /></IconButton>
            <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />
            <IconButton label="Fit canvas" onClick={resetView} testId="button-fit-canvas"><Maximize2 size={15} /></IconButton>
          </div>
        </section>
        {showInspector && <Inspector object={selected} onUpdate={updateObject} onDelete={() => { if (selected) { updateObject(selected.id, {}); setNotes((current) => current.map((n) => n.id === id ? { ...n, objects: n.objects.filter((o) => o.id !== selected.id) } : n)); setSelectedId(null); } }} />}
      </div>
    </main>
  );
}

function Inspector({ object, onUpdate, onDelete }: { object?: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void; onDelete: () => void }) {
  return (
    <aside className="z-10 w-[274px] shrink-0 overflow-y-auto border-l border-[hsl(var(--border))] bg-[hsl(var(--card)/.92)] p-5 backdrop-blur-md max-[900px]:absolute max-[900px]:bottom-0 max-[900px]:right-0 max-[900px]:top-0 max-[640px]:w-[calc(100%-68px)]" data-testid="panel-inspector">
      <div className="mb-7 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Contextual edit</p><h2 className="mt-1 font-serif text-2xl">{object ? 'Piece details' : 'Nothing selected'}</h2></div><Palette size={17} className="text-[hsl(var(--accent))]" /></div>
       {object ? <div className="space-y-6 animate-pop">
         {object.type === 'image' ? <div className="rounded-2xl bg-[hsl(var(--secondary)/.6)] p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"><ImageIcon size={15} /> Image attached</div><p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Resize or rotate this image from the controls below.</p></div> : <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">{object.type === 'table' ? 'Cells (tab-separated)' : 'Content'}</label><textarea value={object.content} onChange={(event) => onUpdate(object.id, { content: event.target.value })} className="min-h-24 w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm leading-6 outline-none transition-colors focus:border-[hsl(var(--primary))]" data-testid="textarea-selected-content" /></div>}
        <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Fill</label><div className="flex flex-wrap gap-2">{colors.map((color) => <button key={color} type="button" aria-label={`Set fill ${color}`} onClick={() => onUpdate(object.id, { fill: color })} className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110 ${object.fill === color ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/.18)] ring-offset-2' : 'border-transparent'}`} style={{ backgroundColor: color }} data-testid={`button-color-${color.slice(1)}`} />)}</div></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Width<input type="number" value={object.width} onChange={(event) => onUpdate(object.id, { width: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none" data-testid="input-object-width" /></label><label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Height<input type="number" value={object.height} onChange={(event) => onUpdate(object.id, { height: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs outline-none" data-testid="input-object-height" /></label></div>
        <div><label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Rotation <span className="font-mono font-normal">{object.rotation}°</span></label><input type="range" min="-12" max="12" value={object.rotation} onChange={(event) => onUpdate(object.id, { rotation: Number(event.target.value) })} className="w-full accent-[hsl(var(--primary))]" data-testid="input-object-rotation" /></div>
        <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--destructive)/.22)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/.08)]" data-testid="button-delete-object"><Trash2 size={14} /> Delete piece</button>
      </div> : <div className="rounded-2xl bg-[hsl(var(--secondary)/.6)] p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]"><MousePointer2 size={17} className="mb-3 text-[hsl(var(--primary))]" /><p>Click a piece on the canvas to edit its content, color, size, or rotation.</p><p className="mt-3 text-xs">Double-click a piece to edit right on the canvas.</p></div>}
      <div className="mt-10 border-t border-[hsl(var(--border))] pt-4 text-[10px] leading-5 text-[hsl(var(--muted-foreground))]"><span className="font-mono uppercase tracking-[.12em]">Canvas notebook</span><p className="mt-1">Your work is saved privately in this browser.</p></div>
    </aside>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/note/:id" component={NoteEditor} /><Route component={NotFound} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;