import type { ReactNode } from "react";
import { InfoTip, type Info } from "./InfoTip";

/** Text label followed by an ⓘ popover, when ``info`` is given. */
export function Labelled({ label, info, tipLabel }: { label: ReactNode; info?: Info; tipLabel?: string }) {
  if (!info) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoTip info={info} label={tipLabel ?? (typeof label === "string" ? label : "this")} />
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  info,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  info?: Info;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-slate-100">
                <Labelled label={title} info={info} />
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  info,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  info?: Info;
  tone?: "default" | "forecast" | "actual" | "corrected" | "risk";
}) {
  const toneClass = {
    default: "text-slate-50",
    forecast: "text-forecast",
    actual: "text-actual",
    corrected: "text-corrected",
    risk: "text-risk",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <Labelled label={label} info={info} />
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Callout({
  children,
  tone = "info",
  info,
  infoLabel = "this summary",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
  info?: Info;
  infoLabel?: string;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {info && (
        <span className="float-right ml-2 mt-0.5">
          <InfoTip info={info} label={infoLabel} />
        </span>
      )}
      {children}
    </div>
  );
}

/** Table header cell with an optional ⓘ popover. */
export function Th({ children, info, className = "" }: { children: string; info?: Info; className?: string }) {
  return (
    <th className={`font-medium ${className}`}>
      <Labelled label={children} info={info} />
    </th>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            o.value === value ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
      <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      Could not load data: {msg}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; band?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.band ? (
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: i.color, opacity: 0.35 }} />
          ) : (
            <span
              className="inline-block w-4 border-t-2"
              style={{ borderColor: i.color, borderStyle: i.dashed ? "dashed" : "solid" }}
            />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}
