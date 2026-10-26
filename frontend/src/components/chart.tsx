import type { ReactNode } from "react";
import { gw } from "../lib/format";

/** CSS variables (see index.css) so charts follow the active theme. */
export const COLORS = {
  forecast: "var(--color-forecast)",
  actual: "var(--color-actual)",
  corrected: "var(--color-corrected)",
  risk: "var(--color-risk)",
  grid: "var(--color-grid)",
  axis: "var(--color-axis)",
  muted: "var(--color-muted)",
};

export const axisProps = {
  stroke: COLORS.axis,
  tick: { fill: COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: COLORS.grid },
} as const;

interface TooltipEntry {
  name?: ReactNode;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/** Dark tooltip that formats MW values as GW; range values ([p10, p90]) as "a – b". */
export function GwTooltip({
  active,
  payload,
  label,
  labelPrefix = "",
  format = (v: number) => gw(v, 2),
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: ReactNode;
  labelPrefix?: string;
  format?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-slate-200">
        {labelPrefix}
        {label}
      </div>
      {payload.map((p, i) => {
        const v = p.value;
        const text = Array.isArray(v)
          ? `${format(Number(v[0]))} – ${format(Number(v[1]))}`
          : v == null
            ? "–"
            : format(Number(v));
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular-nums text-slate-100">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
