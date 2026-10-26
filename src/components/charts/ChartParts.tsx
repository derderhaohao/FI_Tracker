import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  band?: boolean;
}

/** HTML legend; shown for two or more series. Text stays in text tokens. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.band ? (
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ background: i.color, opacity: 0.25 }}
            />
          ) : (
            <span
              className="inline-block h-0 w-4"
              style={{ borderTop: `2px ${i.dashed ? 'dashed' : 'solid'} ${i.color}` }}
            />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function TooltipBox({
  title,
  rows,
  footer,
}: {
  title: ReactNode;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{title}</div>
      <table className="tabular">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="pr-3 text-muted-foreground">
                {r.color && (
                  <span
                    className="mr-1.5 inline-block size-2 rounded-full align-middle"
                    style={{ background: r.color }}
                  />
                )}
                {r.label}
              </td>
              <td className="text-right text-foreground">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <div className="mt-1 text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Height of one row in the label band above the plot (UI-8). */
export const LABEL_ROW = 18;

/**
 * A reference-line label drawn in the band above the plot, not inside it where lines cross
 * (UI-8). Recharts passes the line's `viewBox`; `row` stacks labels that would overlap.
 */
export function BandLabel({
  viewBox,
  text,
  row = 0,
  fill,
}: {
  viewBox?: { x?: number; y?: number };
  text: string;
  row?: number;
  fill: string;
}) {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null;
  return (
    <text x={viewBox.x + 3} y={viewBox.y - 6 - row * LABEL_ROW} fill={fill} fontSize={12}>
      {text}
    </text>
  );
}
