import { createContext, useContext, useState, type ReactNode } from "react";
import type { DataSource, GateId } from "../api/types";

interface Controls {
  deliveryDate: string;
  gate: GateId;
  source: DataSource;
  setDeliveryDate: (d: string) => void;
  setGate: (g: GateId) => void;
  setSource: (s: DataSource) => void;
}

const ControlsContext = createContext<Controls | null>(null);

const GATE_IDS: GateId[] = ["epex_60", "n2ex", "epex_30"];
const SOURCES: DataSource[] = ["snapshot", "live"];
export const DEFAULT_DATE = "2026-01-23";
const SOURCE_KEY = "winddesk.source";

function storedSource(): string | null {
  try {
    return localStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

function initial() {
  const p = new URLSearchParams(window.location.search);
  const d = p.get("date");
  const g = p.get("gate") as GateId | null;
  const s = (p.get("source") ?? storedSource()) as DataSource | null;
  return {
    date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : DEFAULT_DATE,
    gate: g && GATE_IDS.includes(g) ? g : "epex_60",
    source: s && SOURCES.includes(s) ? s : "snapshot",
  };
}

export function ControlsProvider({ children }: { children: ReactNode }) {
  const [deliveryDate, setDeliveryDate] = useState(() => initial().date);
  const [gate, setGate] = useState<GateId>(() => initial().gate);
  const [source, setSourceState] = useState<DataSource>(() => initial().source);
  const setSource = (s: DataSource) => {
    setSourceState(s);
    try {
      localStorage.setItem(SOURCE_KEY, s);
    } catch {
      /* storage unavailable (private mode): keep in-memory choice only */
    }
  };
  return (
    <ControlsContext.Provider value={{ deliveryDate, gate, source, setDeliveryDate, setGate, setSource }}>
      {children}
    </ControlsContext.Provider>
  );
}

export function useControls() {
  const ctx = useContext(ControlsContext);
  if (!ctx) throw new Error("useControls must be used inside ControlsProvider");
  return ctx;
}
