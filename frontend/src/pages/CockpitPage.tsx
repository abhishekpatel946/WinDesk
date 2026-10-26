import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCockpit } from "../api/client";
import type { Cockpit } from "../api/types";
import { COLORS, GwTooltip, axisProps } from "../components/chart";
import { DeliveryDatePicker, GatePicker } from "../components/ControlsBar";
import { Page } from "../components/Layout";
import { Callout, ErrorBox, Kpi, Legend, Loading, Panel, Th } from "../components/ui";
import { addDays, axisGw, gw, gwh, longDate, signedGw, ukTime } from "../lib/format";
import { explain, lean, type GlossaryKey } from "../lib/glossary";
import { useControls } from "../state/controls";

const COLUMNS: { label: string; key: GlossaryKey; hindsight?: boolean }[] = [
  { label: "Hour", key: "colHour" },
  { label: "Lead", key: "colLead" },
  { label: "Forecast", key: "colForecast" },
  { label: "P10", key: "colP10" },
  { label: "P90", key: "colP90" },
  { label: "Bias-adj.", key: "colBiasAdj" },
  { label: "Actual", key: "colActual", hindsight: true },
  { label: "Error", key: "colError", hindsight: true },
];

function downloadCsv(c: Cockpit) {
  const header = "time_utc,uk_hour,lead_h,forecast_mw,p10_mw,p90_mw,bias_adjusted_mw,actual_mw";
  const rows = c.hours.map((h) =>
    [h.time_utc, h.label, h.lead_h, h.forecast, h.p10, h.p90, h.corrected, h.actual].map((v) => v ?? "").join(","),
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wind-forecast_${c.delivery_date}_${c.gate.id}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function CockpitPage() {
  const { deliveryDate, gate } = useControls();
  const { data, error, isPending } = useCockpit(deliveryDate, gate);
  const [hindsight, setHindsight] = useState(true);

  return (
    <Page
      title="Decision cockpit"
      lead="The wind forecast your desk would have had at auction gate closure, with an uncertainty range learned from recent forecast errors and a bias-adjusted view."
      controls={
        <>
          <DeliveryDatePicker />
          <GatePicker />
        </>
      }
    >
      {error && <ErrorBox error={error} />}
      {isPending && <Loading />}
      {data && <CockpitBody c={data} hindsight={hindsight} setHindsight={setHindsight} />}
    </Page>
  );
}

function CockpitBody({
  c,
  hindsight,
  setHindsight,
}: {
  c: Cockpit;
  hindsight: boolean;
  setHindsight: (v: boolean) => void;
}) {
  const decisionDay = addDays(c.delivery_date, -1);
  const chartData = c.hours.map((h) => ({
    label: h.label,
    forecast: h.forecast,
    band: h.p10 != null && h.p90 != null ? [h.p10, h.p90] : null,
    corrected: h.corrected,
    actual: hindsight ? h.actual : null,
  }));
  const nextRunAfterGate = c.run.next_run_utc ? ukTime(c.run.next_run_utc) : null;
  const k = c.kpis;
  const o = c.outcome;
  const bias = c.bias_applied_mw;
  const decisionInfo = explain(
    "decision",
    `The ${ukTime(c.run.publish_time_utc, true)} run was ${c.gate.closed ? "the latest" : "the latest so far"} before the ${c.gate.time_local} gate. It forecasts this day ${c.run.lead_h_min}–${c.run.lead_h_max} hours ahead.`,
  );

  return (
    <>
      {c.gate.closed ? (
        <Callout info={decisionInfo} infoLabel="Decision summary">
          <strong className="font-semibold">Decision:</strong> {c.gate.label} closes {c.gate.time_local} on{" "}
          {longDate(decisionDay)} for delivery {longDate(c.delivery_date)} (23:00–23:00 UK).{" "}
          <strong className="font-semibold">Latest forecast available:</strong> the {c.run.publish_time_local} run,{" "}
          {c.run.age_minutes_at_gate} min old at the gate, covering {c.run.lead_h_min}–{c.run.lead_h_max} h ahead.
          {nextRunAfterGate && <> The next run ({nextRunAfterGate}) lands after the gate.</>}
        </Callout>
      ) : (
        <Callout tone="warn" info={decisionInfo} infoLabel="Decision summary">
          <strong className="font-semibold">Gate still open:</strong> {c.gate.label} closes {c.gate.time_local} on{" "}
          {longDate(decisionDay)} for delivery {longDate(c.delivery_date)} (23:00–23:00 UK).{" "}
          <strong className="font-semibold">Latest forecast so far:</strong> the {ukTime(c.run.publish_time_utc, true)} run,
          covering {c.run.lead_h_min}–{c.run.lead_h_max} h ahead. Runs published before the gate will replace it — use
          Refresh to pick them up.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Forecast wind energy"
          tone="forecast"
          value={gwh(c.kpis.forecast_mwh)}
          hint={`Peak ${gw(c.kpis.peak_mw)} at ${c.kpis.peak_label}`}
          info={explain(
            "forecastEnergy",
            `The forecast expects ${gwh(k.forecast_mwh)} over ${longDate(c.delivery_date)}. Output is strongest at ${k.peak_label} (${gw(k.peak_mw)}) and weakest at ${k.min_label} (${gw(k.min_mw)}).`,
          )}
        />
        <Kpi
          label="Bias-adjusted"
          tone="corrected"
          value={gwh(c.kpis.corrected_mwh)}
          hint={`Recent forecasts ran ${signedGw(c.bias_applied_mw, 1)} high (7-day avg)`}
          info={explain(
            "biasAdjusted",
            bias == null
              ? "Not enough recent history to estimate the bias."
              : `Over the 7 days before the gate, forecasts were on average ${gw(Math.abs(bias), 2)} ${lean(bias)}, so every hour is ${bias >= 0 ? "lowered" : "raised"} by that amount: ${gwh(k.forecast_mwh)} becomes ${gwh(k.corrected_mwh)}.`,
          )}
        />
        <Kpi
          label="Likely range (P10–P90)"
          value={`${Math.round((c.kpis.p10_mwh ?? 0) / 1000)}–${gwh(c.kpis.p90_mwh)}`}
          hint="80% of outcomes in recent history"
          info={explain(
            "likelyRange",
            `Based on the last 30 days of errors, the day's total should land between ${gwh(k.p10_mwh)} and ${gwh(k.p90_mwh)} about 8 times in 10.${
              k.forecast_mwh != null && k.p90_mwh != null && k.forecast_mwh > k.p90_mwh * 0.97
                ? " The forecast sits near the top of the range: recent history says reality usually comes in lower."
                : ""
            }`,
          )}
        />
        <Kpi
          label="Riskiest hour"
          tone="risk"
          value={c.kpis.riskiest_label}
          hint={`Widest range: ${gw(c.kpis.riskiest_range_mw)}`}
          info={explain(
            "riskiestHour",
            `At ${k.riskiest_label} the low and high cases are ${gw(k.riskiest_range_mw)} apart, the widest of the day.`,
          )}
        />
      </div>

      <Panel
        title="Hourly wind outlook for the delivery day"
        subtitle="GW, national transmission-metered wind. Shaded band = P10–P90 from the last 30 days of errors at the same lead time."
        info={explain(
          "cockpitChart",
          o
            ? `The forecast said ${gwh(k.forecast_mwh)}; ${gwh(o.actual_mwh)} was actually delivered, so it was ${gw(Math.abs(o.bias ?? 0), 2)} per hour ${lean(o.bias)} on average.`
            : `No actual output yet for ${longDate(c.delivery_date)}. The forecast peaks at ${k.peak_label}; the band is widest at ${k.riskiest_label}.`,
        )}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={hindsight} onChange={(e) => setHindsight(e.target.checked)} />
              Show actual outturn (hindsight)
            </label>
            <button
              type="button"
              onClick={() => downloadCsv(c)}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>
        }
      >
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={1} />
              <YAxis {...axisProps} tickFormatter={axisGw} unit=" GW" width={60} />
              <Tooltip content={<GwTooltip labelPrefix="Hour starting " />} />
              <Area dataKey="band" name="P10–P90" stroke="none" fill={COLORS.forecast} fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line dataKey="corrected" name="Bias-adjusted" stroke={COLORS.corrected} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              {hindsight && (
                <Line dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <Legend
            items={[
              { color: COLORS.forecast, label: "Elexon forecast at gate" },
              { color: COLORS.forecast, label: "P10–P90 range", band: true },
              { color: COLORS.corrected, label: "Bias-adjusted forecast", dashed: true },
              ...(hindsight ? [{ color: COLORS.actual, label: "Actual (known after delivery)" }] : []),
            ]}
          />
        </div>
      </Panel>

      {hindsight && c.outcome && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Actual wind energy"
            tone="actual"
            value={gwh(c.outcome.actual_mwh)}
            hint="What was delivered"
            info={explain(
              "actualEnergy",
              `${gwh(c.outcome.actual_mwh)} was delivered against ${gwh(k.forecast_mwh)} forecast, a difference of ${gwh(Math.abs((k.forecast_mwh ?? 0) - (c.outcome.actual_mwh ?? 0)))}.`,
            )}
          />
          <Kpi
            label="Forecast error (MAE)"
            value={gw(c.outcome.mae, 2)}
            hint="Mean absolute hourly error"
            info={explain("dayMae", `On this day the forecast missed by ${gw(c.outcome.mae, 2)} per hour on average.`)}
          />
          <Kpi
            label="Bias that day"
            value={signedGw(c.outcome.bias)}
            hint="+ means forecast promised too much wind"
            info={explain(
              "dayBias",
              `On average the forecast was ${gw(Math.abs(c.outcome.bias ?? 0), 2)} per hour ${lean(c.outcome.bias)}${
                (c.outcome.bias ?? 0) > 0 ? ", so a buyer who trusted it would have been short of wind." : "."
              }`,
            )}
          />
          <Kpi
            label="Bias-adjusted MAE"
            tone="corrected"
            value={gw(c.outcome.corrected_mae, 2)}
            info={explain(
              "dayCorrectedMae",
              `${gw(c.outcome.corrected_mae, 2)} for the adjusted forecast vs ${gw(c.outcome.mae, 2)} for the raw one.`,
            )}
            hint={
              c.outcome.corrected_mae != null && c.outcome.mae != null
                ? c.outcome.corrected_mae < c.outcome.mae
                  ? "Adjustment helped this day"
                  : "Adjustment did not help this day"
                : undefined
            }
          />
        </div>
      )}

      <Panel
        title="Hourly detail"
        subtitle="UK local hour starting. Lead time = hours between forecast publication and the target hour."
        info={explain("hourlyDetail", `${c.hours.length} hours in this delivery day (${c.hours[0]?.label} to ${c.hours.at(-1)?.label}).`)}
      >
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr>
                {COLUMNS.filter((col) => hindsight || !col.hindsight).map((col) => (
                  <Th key={col.label} info={explain(col.key)} className="px-2 py-2 first:text-left">
                    {col.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.hours.map((h) => {
                const err = h.forecast != null && h.actual != null ? h.forecast - h.actual : null;
                return (
                  <tr key={h.time_utc} className="border-t border-slate-800/70">
                    <td className="px-2 py-1.5 text-left text-slate-300">{h.label}</td>
                    <td className="px-2 py-1.5 text-slate-500">{h.lead_h} h</td>
                    <td className="px-2 py-1.5 text-forecast">{gw(h.forecast, 2)}</td>
                    <td className="px-2 py-1.5 text-slate-400">{gw(h.p10, 2)}</td>
                    <td className="px-2 py-1.5 text-slate-400">{gw(h.p90, 2)}</td>
                    <td className="px-2 py-1.5 text-corrected">{gw(h.corrected, 2)}</td>
                    {hindsight && (
                      <>
                        <td className="px-2 py-1.5 text-actual">{gw(h.actual, 2)}</td>
                        <td className={`px-2 py-1.5 ${err != null && err > 0 ? "text-risk" : "text-slate-300"}`}>{signedGw(err)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
