import { useMemo } from 'react';
import { parseTableRows, tableCellKey } from '../../lib/table';
import { CanvasObject } from '../../types/canvas';

export function TableView({ object, cellClassName }: { object: CanvasObject; cellClassName?: (row: number, col: number, isHeader: boolean) => string }) {
  const rows = useMemo(() => parseTableRows(object.content), [object.content]);
  const hasHeader = object.tableHasHeader ?? false;
  const isMatrix = object.tableStyle === 'matrix';
  return (
    <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, colIndex) => {
              // A matrix table also treats the first column as a header, in addition to the first
              // row — giving the classic row-label / column-label intersecting grid.
              const isHeader = (hasHeader && rowIndex === 0) || (isMatrix && colIndex === 0);
              const style = object.tableCellStyles?.[tableCellKey(rowIndex, colIndex)];
              const align = style?.align ?? 'left';
              return (
                <td
                  key={colIndex}
                  className={`truncate border-b border-r border-[hsl(var(--primary)/.18)] px-2 py-1.5 last:border-r-0 ${isHeader ? 'bg-[hsl(var(--primary)/.1)] font-bold' : ''} ${style?.bold ? 'font-bold' : ''} ${style?.italic ? 'italic' : ''} ${cellClassName ? cellClassName(rowIndex, colIndex, isHeader) : ''}`}
                  style={{ textAlign: align }}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
