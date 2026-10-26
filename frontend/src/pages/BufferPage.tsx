import { useDeferredValue, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBuffer, useScope } from "../api/client";
import type { Buffer } from "../api/types";
import { COLORS, GwTooltip, axisProps } from "../components/chart";
import { DeliveryDatePicker, GatePicker } from "../components/ControlsBar";
import { Page } from "../components/Layout";
import { InfoTip } from "../components/InfoTip";
import { Callout, ErrorBox, Kpi, Labelled, Legend, Loading, Panel } from "../components/ui";
import { axisGw, gw, gwh, longDate, pct } from "../lib/format";
import { explain } from "../lib/glossary";
import { useControls } from "../state/controls";

export function BufferPage() {
  const { deliveryDate, gate } = useControls();
  const [confidence, setConfidence] = useState(0.9);
  const deferred = useDeferredValue(confidence);
  const { data, error, isPending } = useBuffer(deliveryDate, gate, deferred);

  return (
    <Page
      title="Procurement buffer"
      lead="Turn forecast uncertainty into a purchasing number: how much wind can you rely on at your chosen confidence level, and how much extra energy should you secure to cover the shortfall risk?"
      controls={
        <>
          <DeliveryDatePicker />
          <GatePicker />
        </>
      }
    >
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex items-start gap-1.5 md:w-64">
            <label htmlFor="conf" className="text-sm text-slate-300">
              Confidence that wind delivers at least the firm level:{" "}
              <span className="font-semibold text-sky-300 tabular-nums">{pct(confidence)}</span>
            </label>
            <span className="mt-0.5">
              <InfoTip
                label="Confidence level"
                info={explain(
                  "confidence",
                  `At ${pct(confidence)}, the firm level is set so that wind met or beat it in about ${pct(confidence)} of comparable past hours — you accept being short in about ${pct(1 - confidence)} of hours.`,
                )}
              />
            </span>
          </div>
          <input
            id="conf"
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="flex-1"
          />
          <div className="flex gap-1">
            {[0.5, 0.8, 0.9, 0.95].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConfidence(c)}
                className={`rounded-md border px-2 py-1 text-xs ${c === confidence ? "border-sky-500 text-sky-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
              >
                {pct(c)}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {error && <ErrorBox error={error} />}
      {isPending && <Loading />}
      {data && <BufferBody b={data} />}
    </Page>
  );
}

function BufferBody({ b }: { b: Buffer }) {
  const conf = pct(b.confidence);
  const bt = b.backtest;
  const scope = useScope();
  const data = b.hours.map((h) => ({
    label: h.label,
    forecast: h.forecast,
    firm: h.firm,
    gap: h.firm != null && h.forecast != null ? [h.firm, h.forecast] : null,
    actual: h.actual,
  }));
  const peak = b.hours.reduce((m, h) => ((h.buffer ?? 0) > (m.buffer ?? 0) ? h : m), b.hours[0]);
  const t = b.totals;
  const known = b.hours.filter((h) => h.actual != null && h.firm != null);
  const shortHours = known.length ? known.filter((h) => h.actual! < h.firm!).length : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Forecast wind"
          tone="forecast"
          value={gwh(b.totals.forecast_mwh)}
          hint="Raw Elexon forecast at gate"
          info={explain("forecastWind", `The forecast available at the gate expects ${gwh(t.forecast_mwh)} for ${longDate(b.delivery_date)}.`)}
        />
        <Kpi
          label={`Firm wind @ ${conf}`}
          tone="actual"
          value={gwh(b.totals.firm_mwh)}
          hint="Plan on this much"
          info={explain(
            "firmWind",
            `Plan on ${gwh(t.firm_mwh)}: in the last 30 days (${b.history_hours} hourly observations), forecasts over-shot by more than this margin only about ${pct(1 - b.confidence)} of the time.`,
          )}
        />
        <Kpi
          label="Buffer to secure"
          tone="corrected"
          value={gwh(b.totals.buffer_mwh)}
          hint="Extra energy vs. raw forecast"
          info={explain(
            "bufferToSecure",
            `${gwh(t.forecast_mwh)} − ${gwh(t.firm_mwh)} = ${gwh(t.buffer_mwh)} to arrange from other sources.${
              t.actual_mwh != null && t.forecast_mwh != null
                ? ` In hindsight ${gwh(t.actual_mwh)} arrived, so the real gap was ${gwh(Math.max(0, t.forecast_mwh - t.actual_mwh))}.`
                : ""
            }`,
          )}
        />
        <Kpi
          label="Peak buffer hour"
          tone="risk"
          value={peak?.label ?? "–"}
          hint={gw(b.totals.peak_buffer_mw)}
          info={explain("peakBuffer", peak && `At ${peak.label}, plan for ${gw(t.peak_buffer_mw)} less wind than forecast — the largest hourly buffer of the day.`)}
        />
      </div>

      <Panel
        title="Forecast vs firm wind, by hour"
        subtitle={`Firm level = forecast minus the ${conf} quantile of recent errors at the same lead time (last 30 days, ${b.history_hours} hourly observations).`}
        info={explain(
          "bufferChart",
          shortHours == null
            ? `No actual output yet for ${longDate(b.delivery_date)}, so the plan cannot be checked.`
            : `Actual wind fell below the firm level in ${shortHours} of ${b.hours.length} hours on this day.`,
        )}
      >
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={1} />
              <YAxis {...axisProps} tickFormatter={axisGw} unit=" GW" width={60} />
              <Tooltip content={<GwTooltip labelPrefix="Hour starting " />} />
              <Area dataKey="gap" name="Buffer (firm → forecast)" stroke="none" fill={COLORS.corrected} fillOpacity={0.25} isAnimationActive={false} />
              <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line dataKey="firm" name={`Firm @ ${conf}`} stroke={COLORS.corrected} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <Legend
            items={[
              { color: COLORS.forecast, label: "Forecast at gate" },
              { color: COLORS.corrected, label: `Firm wind @ ${conf}` },
              { color: COLORS.corrected, label: "Buffer", band: true },
              { color: COLORS.actual, label: "Actual (hindsight)", dashed: true },
            ]}
          />
        </div>
      </Panel>

      {bt.n > 0 && (
        <Panel
          title="Would this have worked?"
          subtitle={`Walk-forward backtest over every delivery day with known outturn (${scope?.label ?? "…"}) at this gate.`}
          info={explain("backtest", `${bt.n.toLocaleString("en-GB")} past hours were replayed (${scope?.label ?? "selected period"}).`)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                <Labelled
                  label="Plan on raw forecast"
                  info={explain(
                    "rawPlan",
                    `Trusting the forecast, you would have had less wind than planned in ${pct(bt.raw_shortfall_share)} of hours, missing ${gwh(bt.raw_shortfall_mwh)} in total.`,
                  )}
                />
              </div>
              <div className="mt-1 text-2xl font-semibold text-risk">{pct(bt.raw_shortfall_share)} of hours short</div>
              <div className="mt-1 text-sm text-slate-400">Total wind shortfall {gwh(bt.raw_shortfall_mwh)}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                <Labelled
                  label={`Plan on firm wind @ ${conf}`}
                  info={explain(
                    "firmPlan",
                    `Short in ${pct(bt.firm_shortfall_share)} of hours (target about ${pct(1 - b.confidence)}), missing ${gwh(bt.firm_shortfall_mwh)} — at the cost of about ${gw(bt.mean_buffer_mw)} extra backup each hour.`,
                  )}
                />
              </div>
              <div className="mt-1 text-2xl font-semibold text-actual">{pct(bt.firm_shortfall_share)} of hours short</div>
              <div className="mt-1 text-sm text-slate-400">
                Total shortfall {gwh(bt.firm_shortfall_mwh)} · average buffer {gw(bt.mean_buffer_mw)}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Callout>
              The target was to be short in about {pct(1 - b.confidence)} of hours; the backtest delivered{" "}
              {pct(bt.firm_shortfall_share)}. The trade-off is buying an average of {gw(bt.mean_buffer_mw)} more firm power
              every hour, so pick the confidence level that balances imbalance-price risk against procurement cost.
            </Callout>
          </div>
        </Panel>
      )}
    </>
  );
}
