import { useDeferredValue, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useExplorer, useScope } from "../api/client";
import { COLORS, GwTooltip, axisProps } from "../components/chart";
import { Page } from "../components/Layout";
import { InfoTip } from "../components/InfoTip";
import { ErrorBox, Kpi, Labelled, Legend, Loading, Panel } from "../components/ui";
import { addDays, axisGw, gw, longDate, pct, shortDate, signedGw, ukTime } from "../lib/format";
import { explain, lean } from "../lib/glossary";

const SNAPSHOT_DEFAULT = { from: "2026-01-05", to: "2026-01-11" };

export function ExplorerPage() {
  const scope = useScope();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const minDate = scope ? addDays(scope.first, -1) : "";
  const maxDate = scope?.last ?? "";
  // Default: a January week for the snapshot; for live, the last full week with outturn.
  const fallback = scope?.served === "live" ? { from: addDays(maxDate, -8), to: addDays(maxDate, -2) } : SNAPSHOT_DEFAULT;
  const { from, to } = range && range.from >= minDate && range.to <= maxDate ? range : fallback;
  const setFrom = (v: string) => setRange({ from: v, to });
  const setTo = (v: string) => setRange({ from, to: v });
  const [horizon, setHorizon] = useState(24);
  const deferredHorizon = useDeferredValue(horizon);
  const { data, error, isPending } = useExplorer(from, to, deferredHorizon);

  const points =
    data?.points.map((p) => ({
      t: p.time_utc,
      forecast: p.forecast,
      actual: p.actual,
    })) ?? [];
  const s = data?.summary;
  const dateInput = "rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100";

  return (
    <Page
      title="Lead-time explorer"
      lead="For analysts: for each hour, show the latest forecast published at least N hours earlier, and compare it with what happened. Slide N to see how accuracy changes with horizon."
      controls={
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            <Labelled label="Target dates" info={explain("targetDates", `${longDate(from)} to ${longDate(to)}.`)} />
          </span>
          <input type="date" className={dateInput} value={from} min={minDate} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span className="text-slate-500">to</span>
          <input type="date" className={dateInput} value={to} min={from} max={maxDate} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      }
    >
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-1.5 md:w-56">
            <label htmlFor="horizon" className="text-sm text-slate-300">
              Forecast horizon: <span className="font-semibold text-sky-300 tabular-nums">{horizon} h</span>
            </label>
            <InfoTip
              label="Forecast horizon"
              info={explain(
                "horizon",
                horizon === 0
                  ? "0 h: each hour uses the freshest forecast published before it."
                  : `${horizon} h: each hour uses the newest forecast published at least ${horizon} hours earlier${horizon === 24 ? " — roughly 'a day ahead'" : ""}.`,
              )}
            />
          </div>
          <input
            id="horizon"
            type="range"
            min={0}
            max={48}
            step={1}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="flex-1"
          />
        </div>
      </Panel>

      {error && <ErrorBox error={error} />}
      {isPending && <Loading />}
      {s && s.n > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="MAE"
            tone="forecast"
            value={gw(s.mae, 2)}
            hint={`${s.n} hours compared`}
            info={explain(
              "mae",
              `Over ${s.n} hours (${shortDate(from)} – ${shortDate(to)}), forecasts made at least ${deferredHorizon} h ahead missed by ${gw(s.mae, 2)} per hour on average.`,
            )}
          />
          <Kpi
            label="RMSE"
            value={gw(s.rmse, 2)}
            info={explain(
              "rmse",
              `${gw(s.rmse, 2)} vs an MAE of ${gw(s.mae, 2)}. ${
                s.rmse != null && s.mae != null && s.rmse > 1.25 * s.mae
                  ? "The gap shows some hours had large misses."
                  : "Misses were fairly even in size."
              }`,
            )}
          />
          <Kpi
            label="Bias"
            tone="risk"
            value={signedGw(s.bias)}
            info={explain("bias", `On average these forecasts were ${gw(Math.abs(s.bias ?? 0), 2)} per hour ${lean(s.bias)}.`)}
          />
          <Kpi
            label="P90 abs. error"
            value={gw(s.p90_abs, 2)}
            info={explain("p90Abs", `In 9 out of 10 hours the miss was under ${gw(s.p90_abs, 2)}; the largest was ${gw(s.max_abs, 2)}.`)}
          />
        </div>
      )}
      {data && (
        <Panel
          title={`Forecast (≥ ${data.horizon_h} h ahead) vs actual`}
          subtitle="Hourly, GW. Times shown in UK local time."
          info={explain(
            "explorerChart",
            s && s.n > 0
              ? `The forecast was above actual in ${pct(s.over_forecast_share)} of the ${s.n} hours compared.`
              : "No hours with both a forecast and an actual value in this range yet.",
          )}
        >
          <div className="h-96">
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  {...axisProps}
                  minTickGap={40}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })
                  }
                />
                <YAxis {...axisProps} tickFormatter={axisGw} unit=" GW" width={60} />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <GwTooltip active={active} payload={payload} label={label ? ukTime(String(label), true) : ""} />
                  )}
                />
                <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3">
            <Legend items={[{ color: COLORS.forecast, label: "Forecast" }, { color: COLORS.actual, label: "Actual" }]} />
          </div>
        </Panel>
      )}
    </Page>
  );
}
