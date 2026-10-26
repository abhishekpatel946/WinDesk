import { useIsFetching } from "@tanstack/react-query";
import { useMeta, useRefreshLive, useScope } from "../api/client";
import { longDate, ukTime } from "../lib/format";
import { explain } from "../lib/glossary";
import { useControls } from "../state/controls";
import { useTheme } from "../state/theme";
import { Labelled, Segmented } from "./ui";

function SourceStatusLine() {
  const { source } = useControls();
  const { data: meta, isPlaceholderData } = useMeta();
  const fetching = useIsFetching({ queryKey: [source] }) > 0;

  if (!meta || isPlaceholderData) {
    return <p className="text-slate-500">{source === "live" ? "Fetching from Elexon…" : "Loading…"}</p>;
  }
  if (source === "snapshot") {
    return <p className="text-slate-500">Bundled extract built {meta.data.built_at.slice(0, 10)}</p>;
  }
  const live = meta.source.live;
  if (live?.state === "fallback") {
    return <p className="text-amber-500">Elexon unreachable – showing the snapshot instead.</p>;
  }
  const fetched = live?.fetched_at ? ukTime(live.fetched_at, true) : "–";
  return (
    <p className={live?.state === "stale" ? "text-amber-500" : "text-slate-500"}>
      {live?.state === "stale" ? `Refresh failed – showing data from ${fetched}` : `Fetched from Elexon ${fetched}`}
      {fetching && " · updating…"}
    </p>
  );
}

export function DataSourceControl() {
  const { source, setSource } = useControls();
  const refresh = useRefreshLive();
  const scope = useScope();
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium uppercase tracking-wide text-slate-500">
          <Labelled
            label="Data"
            tipLabel="Data source"
            info={explain(
              "dataSource",
              scope && `Using ${scope.served === "live" ? "live Elexon data" : "the snapshot"}: ${scope.label}, deliveries ${longDate(scope.first)} to ${longDate(scope.last)}.`,
            )}
          />
        </span>
        {source === "live" && (
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="rounded-md px-2 py-0.5 text-sky-300 hover:bg-slate-900 disabled:opacity-50"
            title="Re-fetch WINDFOR and FUELHH from Elexon now"
          >
            {refresh.isPending ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>
      <Segmented
        value={source}
        onChange={setSource}
        options={[
          { value: "snapshot", label: "Snapshot" },
          { value: "live", label: "Live Elexon" },
        ]}
      />
      <SourceStatusLine />
      {refresh.isError && <p className="text-red-200">Refresh failed: {refresh.error.message}</p>}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
