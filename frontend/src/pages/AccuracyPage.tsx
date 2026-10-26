import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAccuracy, useScope } from "../api/client";
import type { Accuracy } from "../api/types";
import { COLORS, GwTooltip, axisProps } from "../components/chart";
import { GatePicker } from "../components/ControlsBar";
import { Page } from "../components/Layout";
import { Callout, ErrorBox, Kpi, Labelled, Legend, Loading, Panel, Th } from "../components/ui";
import { axisGw, gw, gwh, longDate, pct, shortDate, signedGw } from "../lib/format";
import { explain, lean } from "../lib/glossary";
import { useControls } from "../state/controls";

export function AccuracyPage() {
  const { gate } = useControls();
  const scope = useScope();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  // A range picked under one data source is dropped if the other source does not cover it.
  const keep = scope && range && range.from >= scope.first && range.to <= scope.last;
  const from = (keep ? range.from : scope?.first) ?? "";
  const to = (keep ? range.to : scope?.last) ?? "";
  const { data, error, isPending } = useAccuracy(gate, from, to);

  const dateInput = "rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100";
  return (
    <Page
      title="Accuracy scorecard"
      lead={`How far off was the forecast the desk actually had at gate closure? Every number below is a walk-forward replay of real decisions (${scope?.label ?? "…"}).`}
      controls={
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              <Labelled
                label="Deliveries"
                info={explain("deliveriesRange", from && to && `${longDate(from)} to ${longDate(to)}. Days without actual output yet (such as tomorrow) are not scored.`)}
              />
            </span>
            <input type="date" className={dateInput} value={from} min={scope?.first} max={to}
              onChange={(e) => e.target.value && setRange({ from: e.target.value, to })} />
            <span className="text-slate-500">to</span>
            <input type="date" className={dateInput} value={to} min={from} max={scope?.last}
              onChange={(e) => e.target.value && setRange({ from, to: e.target.value })} />
          </div>
          <GatePicker />
        </>
      }
    >
      {error && <ErrorBox error={error} />}
      {isPending && <Loading />}
      {data && <AccuracyBody a={data} />}
    </Page>
  );
}

function AccuracyBody({ a }: { a: Accuracy }) {
  const s = a.summary;
  const cs = a.corrected_summary;
  const improvement = s.mae && cs.mae ? 1 - cs.mae / s.mae : null;
  const daily = a.daily.map((d) => ({ ...d, label: shortDate(d.date) }));
  const hist = a.histogram.map((b) => ({ ...b, mid: (b.lo + b.hi) / 2 }));
  const n = (s.n ?? 0).toLocaleString("en-GB");
  const days = a.daily.length;
  const selectedGate = a.gate_comparison.find((g) => g.gate_id === a.gate_id);
  const bestGate = [...a.gate_comparison].sort((x, y) => (x.mae ?? Infinity) - (y.mae ?? Infinity))[0];
  const byMae = <T extends { mae: number }>(rows: T[]) => [...rows].sort((x, y) => x.mae - y.mae);
  const hours = byMae(a.by_hour);
  const dailySorted = byMae(a.daily);
  const overDays = a.daily.filter((d) => d.forecast_mwh > d.actual_mwh).length;
  const lead = a.lead_curve_all_runs;
  const modeBin = hist.reduce<(typeof hist)[number] | undefined>((m, b) => (!m || b.count > m.count ? b : m), undefined);
  const wind = a.by_wind_level;
  const cal = a.calibration;
  const calVerdict =
    cal.inside_share == null
      ? ""
      : cal.inside_share < 0.75
        ? "The range was too narrow (over-confident) in this period."
        : cal.inside_share > 0.85
          ? "The range was wider than necessary (cautious) in this period."
          : "The range was about right in this period.";

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi
          label="Mean abs. error"
          tone="forecast"
          value={gw(s.mae, 2)}
          hint={`${s.nmae_pct?.toFixed(1)}% of mean output`}
          info={explain(
            "mae",
            `Across ${n} hours (${days} delivery days), the forecast available at the gate missed by ${gw(s.mae, 2)} per hour on average — about ${s.nmae_pct?.toFixed(0)}% of average wind output.`,
          )}
        />
        <Kpi
          label="RMSE"
          value={gw(s.rmse, 2)}
          hint="Penalises big misses"
          info={explain(
            "rmse",
            `${gw(s.rmse, 2)} vs an MAE of ${gw(s.mae, 2)}. ${
              s.rmse != null && s.mae != null && s.rmse > 1.25 * s.mae
                ? "The gap shows some hours had large misses."
                : "The gap is small, so misses were fairly even in size."
            }`,
          )}
        />
        <Kpi
          label="Bias"
          tone="risk"
          value={signedGw(s.bias)}
          hint="+ = forecast too high"
          info={explain("bias", `On average the forecast was ${gw(Math.abs(s.bias ?? 0), 2)} per hour ${lean(s.bias)}.`)}
        />
        <Kpi
          label="P90 abs. error"
          value={gw(s.p90_abs, 2)}
          hint="9 in 10 hours are better"
          info={explain("p90Abs", `In 9 out of 10 hours the miss was under ${gw(s.p90_abs, 2)}; the largest single miss was ${gw(s.max_abs, 2)}.`)}
        />
        <Kpi
          label="Hours over-forecast"
          tone="risk"
          value={pct(s.over_forecast_share)}
          hint="Forecast > actual"
          info={explain("overForecast", `In ${pct(s.over_forecast_share)} of ${n} hours the forecast was above the actual output.`)}
        />
        <Kpi
          label="Bias-adjusted MAE"
          tone="corrected"
          value={gw(cs.mae, 2)}
          hint={improvement != null ? `${pct(improvement)} better` : undefined}
          info={explain(
            "correctedMae",
            improvement == null
              ? undefined
              : `${gw(cs.mae, 2)} vs ${gw(s.mae, 2)} for the raw forecast: ${pct(Math.abs(improvement))} ${improvement >= 0 ? "smaller" : "larger"} error, using only data known before each gate.`,
          )}
        />
      </div>

      <Callout
        tone="warn"
        infoLabel="Key finding"
        info={explain(
          "keyFinding",
          `Over ${days} delivery days the forecast promised ${gwh((s.forecast_mwh ?? 0) - (s.actual_mwh ?? 0))} more wind than arrived (${gwh(s.forecast_mwh)} forecast vs ${gwh(s.actual_mwh)} actual).`,
        )}
      >
        <strong className="font-semibold">Key finding:</strong> the national wind forecast promised more wind than was
        delivered in {pct(s.over_forecast_share)} of hours, by {signedGw(s.bias)} on average ({gwh(
          (s.forecast_mwh ?? 0) - (s.actual_mwh ?? 0),
        )} over the period). A buyer who took it at face value would systematically under-procure. A simple 7-day
        rolling bias adjustment, using only information available at the gate, cuts the mean error by{" "}
        {pct(improvement)}. A plausible driver, still to be validated, is wind curtailed during grid constraints: the
        metered outturn reflects it, the forecast may not.
      </Callout>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Which auction gives the better forecast?"
          subtitle="Mean absolute error of the latest forecast available at each gate."
          info={explain(
            "gateComparison",
            bestGate &&
              selectedGate &&
              `Most accurate: ${bestGate.label} (${gw(bestGate.mae, 2)}). Selected: ${selectedGate.label} (${gw(selectedGate.mae, 2)}).`,
          )}
        >
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.gate_comparison} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} tickFormatter={(v: string) => v.replace(" auction", "")} />
                <YAxis {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} unit=" GW" width={60} />
                <Tooltip content={<GwTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="mae" name="MAE" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {a.gate_comparison.map((g) => (
                    <Cell key={g.gate_id} fill={g.gate_id === a.gate_id ? COLORS.forecast : COLORS.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            The 15:30 half-hourly auction can use the 11:30 run (the 15:30 run lands exactly at gate closure), so it trades
            on a fresher forecast than the morning auctions.
          </p>
        </Panel>

        <Panel
          title="Error grows with forecast horizon"
          subtitle="All Elexon runs (not just gate runs), MAE by lead time in 3-hour buckets."
          info={explain(
            "leadCurve",
            lead.length > 1 &&
              `MAE is ${gw(lead[0].mae, 2)} for forecasts made ${lead[0].key} ahead and ${gw(lead.at(-1)!.mae, 2)} for ${lead.at(-1)!.key} ahead. ${
                lead.at(-1)!.mae > lead[0].mae * 1.2
                  ? "Forecasting earlier clearly costs accuracy."
                  : "The line is fairly flat, so the error is mostly not about how early the forecast was made."
              }`,
          )}
        >
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={a.lead_curve_all_runs} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="key" {...axisProps} interval={1} />
                <YAxis {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} unit=" GW" width={60} />
                <Tooltip content={<GwTooltip labelPrefix="Lead " />} />
                <Line dataKey="mae" name="MAE" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.risk} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2">
            <Legend items={[{ color: COLORS.forecast, label: "MAE" }, { color: COLORS.risk, label: "Bias", dashed: true }]} />
          </div>
        </Panel>
      </div>

      <Panel
        title="Daily energy: forecast at gate vs actual"
        subtitle="GWh per delivery day, with daily MAE."
        info={explain(
          "dailyEnergy",
          dailySorted.length > 0 &&
            `The forecast over-promised on ${overDays} of ${days} days. Worst day: ${longDate(dailySorted.at(-1)!.date)} (MAE ${gw(dailySorted.at(-1)!.mae, 2)}); best: ${longDate(dailySorted[0].date)} (${gw(dailySorted[0].mae, 2)}).`,
        )}
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={daily} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={2} />
              <YAxis yAxisId="e" {...axisProps} tickFormatter={axisGw} unit=" GWh" width={70} />
              <YAxis yAxisId="m" orientation="right" {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} unit=" GW" width={55} />
              <Tooltip
                content={({ active, payload, label }) => (
                  <GwTooltip
                    active={active}
                    payload={payload}
                    label={label}
                    format={(v) => (v > 50_000 ? gwh(v) : gw(v, 2))}
                  />
                )}
                cursor={{ fill: "#ffffff08" }}
              />
              <Bar yAxisId="e" dataKey="forecast_mwh" name="Forecast" fill={COLORS.forecast} fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar yAxisId="e" dataKey="actual_mwh" name="Actual" fill={COLORS.actual} fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="m" dataKey="mae" name="MAE" stroke={COLORS.corrected} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2">
          <Legend
            items={[
              { color: COLORS.forecast, label: "Forecast energy", band: true },
              { color: COLORS.actual, label: "Actual energy", band: true },
              { color: COLORS.corrected, label: "Daily MAE (right axis)" },
            ]}
          />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Error by hour of the delivery day"
          subtitle="MAE and bias by UK local hour (23:00 is the first delivery hour)."
          info={explain(
            "byHour",
            hours.length > 0 &&
              `Hardest hour: ${hours.at(-1)!.key} (MAE ${gw(hours.at(-1)!.mae, 2)}); easiest: ${hours[0].key} (${gw(hours[0].mae, 2)}).`,
          )}
        >
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={a.by_hour} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="key" {...axisProps} interval={2} />
                <YAxis {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} unit=" GW" width={60} />
                <Tooltip content={<GwTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} fillOpacity={0.6} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.risk} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Distribution of hourly errors"
          subtitle="Forecast − actual, 500 MW bins. Right of zero = forecast too high."
          info={explain(
            "histogram",
            modeBin &&
              `${pct(s.over_forecast_share)} of hours sit right of zero. The most common error was ${signedGw(modeBin.lo, 1)} to ${signedGw(modeBin.hi, 1)} (${modeBin.count} hours).`,
          )}
        >
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ top: 5, right: 10, bottom: 0, left: -10 }} barCategoryGap={1}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="mid" {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} />
                <YAxis {...axisProps} allowDecimals={false} width={50} />
                <ReferenceLine x={hist.find((b) => b.lo <= 0 && b.hi > 0)?.mid} stroke={COLORS.axis} strokeDasharray="3 3" />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs">
                        {signedGw(payload[0].payload.lo, 1)} to {signedGw(payload[0].payload.hi, 1)}: {payload[0].payload.count} h
                      </div>
                    ) : null
                  }
                  cursor={{ fill: "#ffffff08" }}
                />
                <Bar dataKey="count" isAnimationActive={false}>
                  {hist.map((b) => (
                    <Cell key={b.lo} fill={b.mid > 0 ? COLORS.risk : COLORS.forecast} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Error by wind level"
          subtitle="Bigger wind days carry bigger absolute errors."
          info={explain(
            "byWindLevel",
            wind.length > 1 &&
              `MAE goes from ${gw(wind[0].mae, 2)} in calm hours (${wind[0].key}) to ${gw(wind.at(-1)!.mae, 2)} in windy hours (${wind.at(-1)!.key}).`,
          )}
        >
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="text-xs text-slate-400">
              <tr>
                <Th className="py-1.5 text-left" info={explain("colWindLevel")}>Actual output</Th>
                <Th className="py-1.5" info={explain("colHours")}>Hours</Th>
                <Th className="py-1.5" info={explain("mae")}>MAE</Th>
                <Th className="py-1.5" info={explain("bias")}>Bias</Th>
                <Th className="py-1.5" info={explain("rmse")}>RMSE</Th>
              </tr>
            </thead>
            <tbody>
              {a.by_wind_level.map((r) => (
                <tr key={r.key} className="border-t border-slate-800">
                  <td className="py-1.5 text-left text-slate-300">{r.key}</td>
                  <td className="py-1.5 text-slate-400">{r.n}</td>
                  <td className="py-1.5">{gw(r.mae, 2)}</td>
                  <td className="py-1.5 text-risk">{signedGw(r.bias)}</td>
                  <td className="py-1.5">{gw(r.rmse, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Can you trust the P10–P90 range?"
          subtitle="Walk-forward check of the cockpit's uncertainty band."
          info={explain("calibration", cal.n > 0 && `${pct(cal.inside_share)} of ${cal.n.toLocaleString("en-GB")} hours landed inside the range. ${calVerdict}`)}
        >
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="Inside range"
              tone="actual"
              value={pct(a.calibration.inside_share)}
              hint="Target ≈ 80%"
              info={explain("insideRange", `${pct(cal.inside_share)} vs a target of about 80%. ${calVerdict}`)}
            />
            <Kpi
              label="Below P10"
              tone="risk"
              value={pct(a.calibration.below_p10_share)}
              hint="Target ≈ 10%"
              info={explain(
                "belowP10",
                `${pct(cal.below_p10_share)} of hours had less wind than the low case${
                  (cal.below_p10_share ?? 0) > 0.13 ? " — more often than promised, so plan cautiously." : "."
                }`,
              )}
            />
            <Kpi
              label="Above P90"
              value={pct(a.calibration.above_p90_share)}
              hint="Target ≈ 10%"
              info={explain("aboveP90", `${pct(cal.above_p90_share)} of hours had more wind than the high case.`)}
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Average band width {gw(a.calibration.mean_width, 1)}. The band is built only from errors that were observable
            before each gate, so this is an honest out-of-sample test.
          </p>
        </Panel>
      </div>
    </>
  );
}
