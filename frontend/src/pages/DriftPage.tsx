import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDrift, useMeta } from "../api/client";
import type { Drift, GateId } from "../api/types";
import { COLORS, axisProps } from "../components/chart";
import { DeliveryDatePicker, GatePicker } from "../components/ControlsBar";
import { Page } from "../components/Layout";
import { Callout, ErrorBox, Legend, Loading, Panel } from "../components/ui";
import { axisGw, gw, gwh, pct } from "../lib/format";
import { explain } from "../lib/glossary";
import { useControls } from "../state/controls";

/** Older runs fade towards slate, newer runs are brighter sky blue. */
function runColor(i: number, n: number) {
  const t = n <= 1 ? 1 : i / (n - 1);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(71, 56)}, ${mix(85, 189)}, ${mix(105, 248)})`;
}

export function DriftPage() {
  const { deliveryDate, gate } = useControls();
  const { data, error, isPending } = useDrift(deliveryDate);
  return (
    <Page
      title="Forecast drift"
      lead="Every Elexon forecast run that covered this delivery day, from two days out until delivery. See how the outlook moved, and where your gate's run sat."
      controls={
        <>
          <DeliveryDatePicker />
          <GatePicker />
        </>
      }
    >
      {error && <ErrorBox error={error} />}
      {isPending && <Loading />}
      {data && <DriftBody d={data} gate={gate} />}
    </Page>
  );
}

function DriftBody({ d, gate }: { d: Drift; gate: GateId }) {
  const { data: meta } = useMeta();
  const gateRun = d.gate_runs[gate];
  const gateLabel = meta?.gates.find((g) => g.id === gate)?.label ?? gate;

  const chartData = useMemo(
    () =>
      d.hours.map((h, i) => {
        const row: Record<string, number | string | null> = { label: h.label, actual: d.actual[i] };
        d.runs.forEach((r, j) => (row[`r${j}`] = r.values[i]));
        return row;
      }),
    [d],
  );

  const deliveryStart = new Date(d.hours[0].time_utc).getTime();
  const isIntraday = (r: { publish_time_utc: string }) => new Date(r.publish_time_utc).getTime() >= deliveryStart;
  const scoredRuns = d.runs.filter((r) => r.mae != null);
  const preDeliveryRuns = scoredRuns.filter((r) => !isIntraday(r));
  const gateRunData = d.runs.find((r) => r.publish_time_utc === gateRun);
  const first = preDeliveryRuns[0];
  const lastPre = preDeliveryRuns.at(-1);

  return (
    <>
      {gateRunData && first && lastPre && (
        <Callout
          infoLabel="Drift summary"
          info={explain(
            "driftSummary",
            d.actual_mwh != null && gateRunData.energy_mwh != null
              ? `The gate run forecast ${gwh(gateRunData.energy_mwh)}; ${gwh(d.actual_mwh)} arrived — ${gwh(Math.abs(gateRunData.energy_mwh - d.actual_mwh))} ${gateRunData.energy_mwh > d.actual_mwh ? "too much" : "too little"}.`
              : undefined,
          )}
        >
          {d.runs.length} runs covered this day ({preDeliveryRuns.length} published before delivery started). The run
          available at the {gateLabel} gate ({gateRunData.label}) predicted {gwh(gateRunData.energy_mwh)} with an hourly
          MAE of {gw(gateRunData.mae, 2)}. The earliest run ({first.label}) had MAE {gw(first.mae, 2)}; the last run
          before delivery ({lastPre.label}) had {gw(lastPre.mae, 2)}. Actual delivered: {gwh(d.actual_mwh)}.
        </Callout>
      )}

      <Panel
        title="All runs for the delivery day"
        subtitle="Each line is one forecast run (older = darker). Gate run highlighted in amber; actual outturn in green."
        info={explain(
          "driftRuns",
          `${d.runs.length} runs shown.${gateRunData ? ` The amber run (${gateRunData.label}) forecast ${gwh(gateRunData.energy_mwh)} for the day.` : ""} ${
            d.actual_mwh != null ? `${gwh(d.actual_mwh)} was actually delivered.` : "Actual output is not known yet."
          }`,
        )}
      >
        <div className="h-96">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={1} />
              <YAxis {...axisProps} tickFormatter={axisGw} unit=" GW" width={60} domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, label }) => {
                  if (!active) return null;
                  const row = chartData.find((r) => r.label === label);
                  if (!row) return null;
                  return (
                    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
                      <div className="mb-1 font-medium text-slate-200">Hour starting {label}</div>
                      <div className="mb-1 flex justify-between gap-4 text-actual">
                        <span>Actual</span>
                        <span className="tabular-nums">{gw(row.actual as number | null, 2)}</span>
                      </div>
                      {d.runs.map((r, j) =>
                        row[`r${j}`] == null ? null : (
                          <div
                            key={r.publish_time_utc}
                            className={`flex justify-between gap-4 ${r.publish_time_utc === gateRun ? "text-corrected" : "text-slate-400"}`}
                          >
                            <span>{r.label}</span>
                            <span className="tabular-nums">{gw(row[`r${j}`] as number, 2)}</span>
                          </div>
                        ),
                      )}
                    </div>
                  );
                }}
              />
              {d.runs.map((r, j) =>
                r.publish_time_utc === gateRun ? null : (
                  <Line
                    key={r.publish_time_utc}
                    dataKey={`r${j}`}
                    stroke={runColor(j, d.runs.length)}
                    strokeWidth={1.2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ),
              )}
              {d.runs.map((r, j) =>
                r.publish_time_utc === gateRun ? (
                  <Line key="gate" dataKey={`r${j}`} stroke={COLORS.corrected} strokeWidth={3} dot={false} isAnimationActive={false} />
                ) : null,
              )}
              <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <Legend
            items={[
              { color: runColor(0, 2), label: "Older runs" },
              { color: runColor(1, 2), label: "Newer runs" },
              { color: COLORS.corrected, label: `Run used at ${gateLabel} gate` },
              { color: COLORS.actual, label: "Actual" },
            ]}
          />
        </div>
      </Panel>

      <Panel
        title="Does waiting help? Error of each run for this day"
        subtitle="Hourly MAE against actual over the hours each run covered, by publication time (UK)."
        info={explain(
          "driftWaiting",
          first && lastPre && first.mae != null && lastPre.mae != null
            ? `Earliest run: MAE ${gw(first.mae, 2)}; last run before delivery: ${gw(lastPre.mae, 2)}. Waiting ${
                lastPre.mae < first.mae
                  ? `cut the error by ${pct(1 - lastPre.mae / first.mae)}`
                  : "did not reduce the error"
              } for this day.`
            : "No runs can be scored yet: actual output for this day is not known.",
        )}
      >
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={scoredRuns} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis {...axisProps} tickFormatter={(v: number) => (v / 1000).toFixed(1)} unit=" GW" width={60} />
              <Tooltip
                cursor={{ fill: "#ffffff08" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs">
                      <div className="font-medium text-slate-200">Run {payload[0].payload.label}</div>
                      <div className="text-slate-400">
                        MAE {gw(payload[0].payload.mae, 2)} · {payload[0].payload.hours_before_delivery} h before delivery start ·{" "}
                        {payload[0].payload.coverage} h covered
                      </div>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="mae" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {scoredRuns.map((r) => (
                  <Cell
                    key={r.publish_time_utc}
                    fill={r.publish_time_utc === gateRun ? COLORS.corrected : isIntraday(r) ? COLORS.muted : COLORS.forecast}
                    fillOpacity={r.publish_time_utc === gateRun ? 1 : 0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Grey bars: runs published during the delivery day. They only cover the remaining hours, so their MAE is over
          fewer, nearer-term hours and is not directly comparable.
        </p>
      </Panel>
    </>
  );
}
