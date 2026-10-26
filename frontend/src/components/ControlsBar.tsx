import { useMeta, useScope } from "../api/client";
import type { GateId } from "../api/types";
import { addDays, longDate } from "../lib/format";
import { explain } from "../lib/glossary";
import { useControls } from "../state/controls";
import { Labelled, Segmented } from "./ui";

export function DeliveryDatePicker() {
  const { deliveryDate, setDeliveryDate } = useControls();
  const scope = useScope();
  const first = scope?.first ?? deliveryDate;
  const last = scope?.last ?? deliveryDate;
  const step = (n: number) => {
    const next = addDays(deliveryDate, n);
    if (next >= first && next <= last) setDeliveryDate(next);
  };
  const btn =
    "rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        <Labelled
          label="Delivery day"
          info={explain(
            "deliveryDay",
            scope && `Showing ${longDate(deliveryDate)}; the purchase decision was on ${longDate(addDays(deliveryDate, -1))}. Available: ${longDate(scope.first)} to ${longDate(scope.last)}.`,
          )}
        />
      </span>
      <button type="button" className={btn} onClick={() => step(-1)} disabled={deliveryDate <= first} aria-label="Previous day">
        ‹
      </button>
      <input
        type="date"
        value={deliveryDate}
        min={first}
        max={last}
        onChange={(e) => e.target.value && setDeliveryDate(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
        aria-label="Delivery date"
      />
      <button type="button" className={btn} onClick={() => step(1)} disabled={deliveryDate >= last} aria-label="Next day">
        ›
      </button>
      <span className="hidden text-xs text-slate-400 lg:inline">{longDate(deliveryDate)}</span>
      {scope?.served === "live" && deliveryDate !== last && (
        <button type="button" className={btn} onClick={() => setDeliveryDate(last)} title="Jump to tomorrow's delivery (today's decision)">
          Tomorrow
        </button>
      )}
    </div>
  );
}

export function GatePicker() {
  const { gate, setGate } = useControls();
  const { data: meta } = useMeta();
  const selected = meta?.gates.find((g) => g.id === gate);
  const options =
    meta?.gates.map((g) => ({
      value: g.id,
      label: (
        <span title={g.market}>
          {g.label.replace(" auction", "")} <span className="text-slate-500">{g.local_time}</span>
        </span>
      ),
    })) ?? [];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        <Labelled label="Auction" info={explain("auction", selected && `${selected.label} (${selected.market}), closing ${selected.local_time} UK time on the day before delivery.`)} />
      </span>
      <Segmented<GateId> value={gate} options={options} onChange={setGate} />
    </div>
  );
}
