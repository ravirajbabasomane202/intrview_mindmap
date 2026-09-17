import { CanvasObject, CellStyle } from '../types/canvas';

// --- Table helpers -------------------------------------------------------

export function parseTableRows(content: string): string[][] {
  const rows = content.split('\n').map((row) => row.split('\t'));
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
}

export function stringifyTableRows(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n');
}

export function tableCellKey(row: number, col: number) {
  return `${row}-${col}`;
}

export function addTableRow(object: CanvasObject, atIndex?: number): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  const columnCount = rows[0]?.length ?? 2;
  const insertAt = atIndex ?? rows.length;
  const newRows = [...rows.slice(0, insertAt), Array.from({ length: columnCount }, () => ''), ...rows.slice(insertAt)];
  const shiftedStyles = shiftCellStylesForRowInsert(object.tableCellStyles, insertAt);
  return { content: stringifyTableRows(newRows), tableCellStyles: shiftedStyles };
}

export function removeTableRow(object: CanvasObject, rowIndex: number): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  if (rows.length <= 1) return {};
  const newRows = rows.filter((_, index) => index !== rowIndex);
  const shiftedStyles = shiftCellStylesForRowRemove(object.tableCellStyles, rowIndex);
  return { content: stringifyTableRows(newRows), tableCellStyles: shiftedStyles };
}

export function addTableColumn(object: CanvasObject, atIndex?: number): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  const columnCount = rows[0]?.length ?? 0;
  const insertAt = atIndex ?? columnCount;
  const newRows = rows.map((row) => [...row.slice(0, insertAt), '', ...row.slice(insertAt)]);
  const shiftedStyles = shiftCellStylesForColInsert(object.tableCellStyles, insertAt);
  return { content: stringifyTableRows(newRows), tableCellStyles: shiftedStyles };
}

export function removeTableColumn(object: CanvasObject, colIndex: number): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  if ((rows[0]?.length ?? 0) <= 1) return {};
  const newRows = rows.map((row) => row.filter((_, index) => index !== colIndex));
  const shiftedStyles = shiftCellStylesForColRemove(object.tableCellStyles, colIndex);
  return { content: stringifyTableRows(newRows), tableCellStyles: shiftedStyles };
}

export function updateTableCell(object: CanvasObject, rowIndex: number, colIndex: number, value: string): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  const newRows = rows.map((row, r) => row.map((cell, c) => (r === rowIndex && c === colIndex ? value : cell)));
  return { content: stringifyTableRows(newRows) };
}

// A cell is "covered" (hidden, merged into an earlier cell in the same row) if some merge
// starting at an earlier column in the same row spans over it.
export function isCellCovered(merges: Record<string, number> | undefined, row: number, col: number): boolean {
  if (!merges) return false;
  for (let c = 0; c < col; c++) {
    const span = merges[tableCellKey(row, c)];
    if (span && c + span > col) return true;
  }
  return false;
}

export function mergeCellRight(object: CanvasObject, row: number, col: number): Partial<CanvasObject> {
  const rows = parseTableRows(object.content);
  const columnCount = rows[0]?.length ?? 0;
  const merges = { ...(object.tableMerges ?? {}) };
  const currentSpan = merges[tableCellKey(row, col)] ?? 1;
  const nextCol = col + currentSpan;
  if (nextCol >= columnCount) return {};
  const nextSpan = merges[tableCellKey(row, nextCol)] ?? 1;
  merges[tableCellKey(row, col)] = currentSpan + nextSpan;
  delete merges[tableCellKey(row, nextCol)];
  const newRows = rows.map((r, ri) => r.map((cell, ci) => {
    if (ri !== row) return cell;
    if (ci === col) {
      const rightCell = rows[row][nextCol] ?? '';
      return rightCell ? `${cell} ${rightCell}`.trim() : cell;
    }
    return cell;
  }));
  return { content: stringifyTableRows(newRows), tableMerges: merges };
}

export function unmergeCell(object: CanvasObject, row: number, col: number): Partial<CanvasObject> {
  const merges = { ...(object.tableMerges ?? {}) };
  delete merges[tableCellKey(row, col)];
  return { tableMerges: merges };
}

export function shiftCellStylesForRowInsert(styles: Record<string, CellStyle> | undefined, atRow: number) {
  if (!styles) return styles;
  const next: Record<string, CellStyle> = {};
  for (const [key, style] of Object.entries(styles)) {
    const [r, c] = key.split('-').map(Number);
    next[tableCellKey(r >= atRow ? r + 1 : r, c)] = style;
  }
  return next;
}
export function shiftCellStylesForRowRemove(styles: Record<string, CellStyle> | undefined, atRow: number) {
  if (!styles) return styles;
  const next: Record<string, CellStyle> = {};
  for (const [key, style] of Object.entries(styles)) {
    const [r, c] = key.split('-').map(Number);
    if (r === atRow) continue;
    next[tableCellKey(r > atRow ? r - 1 : r, c)] = style;
  }
  return next;
}
export function shiftCellStylesForColInsert(styles: Record<string, CellStyle> | undefined, atCol: number) {
  if (!styles) return styles;
  const next: Record<string, CellStyle> = {};
  for (const [key, style] of Object.entries(styles)) {
    const [r, c] = key.split('-').map(Number);
    next[tableCellKey(r, c >= atCol ? c + 1 : c)] = style;
  }
  return next;
}
export function shiftCellStylesForColRemove(styles: Record<string, CellStyle> | undefined, atCol: number) {
  if (!styles) return styles;
  const next: Record<string, CellStyle> = {};
  for (const [key, style] of Object.entries(styles)) {
    const [r, c] = key.split('-').map(Number);
    if (c === atCol) continue;
    next[tableCellKey(r, c > atCol ? c - 1 : c)] = style;
  }
  return next;
}

// Small, dependency-free CSV parser (handles quoted fields with commas/quotes).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// --- Lightweight markdown rendering (bold, italic, underline, code, headings, bullets) ---
