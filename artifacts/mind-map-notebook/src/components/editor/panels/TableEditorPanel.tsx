import { useMemo, useRef, useState } from 'react';
import { addTableColumn, addTableRow, parseCsv, parseTableRows, removeTableColumn, removeTableRow, stringifyTableRows, tableCellKey, updateTableCell } from '../../../lib/table';
import { CanvasObject, CellStyle } from '../../../types/canvas';

export function TableEditorPanel({ object, onUpdate }: { object: CanvasObject; onUpdate: (id: string, patch: Partial<CanvasObject>) => void }) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const rows = useMemo(() => parseTableRows(object.content), [object.content]);
  const hasHeader = object.tableHasHeader ?? false;
  const activeStyle = activeCell ? object.tableCellStyles?.[tableCellKey(activeCell.row, activeCell.col)] : undefined;

  const setCellStyle = (patch: Partial<CellStyle>) => {
    if (!activeCell) return;
    const key = tableCellKey(activeCell.row, activeCell.col);
    const current = object.tableCellStyles?.[key] ?? {};
    onUpdate(object.id, { tableCellStyles: { ...object.tableCellStyles, [key]: { ...current, ...patch } } });
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parseCsv(text);
      if (parsed.length === 0) return;
      onUpdate(object.id, { content: stringifyTableRows(parsed), tableCellStyles: {}, tableHasHeader: true });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Table</label>
        <div className="flex gap-1">
          <button type="button" onClick={() => csvInputRef.current?.click()} className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-[11.5px] font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]" data-testid="button-import-csv">Import CSV</button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCsv(file); event.target.value = ''; }} data-testid="input-import-csv" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
        <input type="checkbox" checked={hasHeader} onChange={(event) => onUpdate(object.id, { tableHasHeader: event.target.checked })} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" data-testid="checkbox-table-header" />
        First row is header
      </label>
      <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]" data-testid="table-editor-grid">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => {
                  const isHeader = hasHeader && rowIndex === 0;
                  const style = object.tableCellStyles?.[tableCellKey(rowIndex, colIndex)];
                  const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                  return (
                    <td key={colIndex} className={`border border-[hsl(var(--border))] p-0 ${isHeader ? 'bg-[hsl(var(--primary)/.08)]' : ''} ${isActive ? 'ring-2 ring-inset ring-[hsl(var(--accent))]' : ''}`}>
                      <input
                        value={cell}
                        onFocus={() => setActiveCell({ row: rowIndex, col: colIndex })}
                        onChange={(event) => onUpdate(object.id, updateTableCell(object, rowIndex, colIndex, event.target.value))}
                        className={`w-full min-w-14 bg-transparent px-1.5 py-1.5 text-xs outline-none ${isHeader || style?.bold ? 'font-bold' : ''} ${style?.italic ? 'italic' : ''}`}
                        style={{ textAlign: style?.align ?? 'left' }}
                        data-testid={`input-table-cell-${rowIndex}-${colIndex}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onUpdate(object.id, addTableRow(object))} className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-add-row">+ Row</button>
        <button type="button" onClick={() => rows.length > 1 && onUpdate(object.id, removeTableRow(object, rows.length - 1))} className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-remove-row">− Row</button>
        <button type="button" onClick={() => onUpdate(object.id, addTableColumn(object))} className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-add-column">+ Column</button>
        <button type="button" onClick={() => onUpdate(object.id, removeTableColumn(object, (rows[0]?.length ?? 1) - 1))} className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[hsl(var(--secondary))]" data-testid="button-remove-column">− Column</button>
      </div>
      <div className="rounded-xl bg-[hsl(var(--secondary)/.5)] p-2.5">
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{activeCell ? `Cell ${activeCell.row + 1}, ${activeCell.col + 1}` : 'Click a cell to format it'}</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" disabled={!activeCell} onClick={() => setCellStyle({ bold: !activeStyle?.bold })} className={`rounded px-2 py-1 text-xs font-bold disabled:opacity-40 ${activeStyle?.bold ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid="button-cell-bold">B</button>
          <button type="button" disabled={!activeCell} onClick={() => setCellStyle({ italic: !activeStyle?.italic })} className={`rounded px-2 py-1 text-xs italic disabled:opacity-40 ${activeStyle?.italic ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid="button-cell-italic">I</button>
          <button type="button" disabled={!activeCell} onClick={() => setCellStyle({ align: 'left' })} className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${(activeStyle?.align ?? 'left') === 'left' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid="button-cell-align-left">L</button>
          <button type="button" disabled={!activeCell} onClick={() => setCellStyle({ align: 'center' })} className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${activeStyle?.align === 'center' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid="button-cell-align-center">C</button>
          <button type="button" disabled={!activeCell} onClick={() => setCellStyle({ align: 'right' })} className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${activeStyle?.align === 'right' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid="button-cell-align-right">R</button>
        </div>
      </div>
    </div>
  );
}
