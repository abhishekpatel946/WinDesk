import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { addDays } from "../lib/format";
import { useControls } from "../state/controls";
import type { Accuracy, Buffer, Cockpit, DataSource, Drift, Explorer, GateId, Meta } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`/api${path}${qs.size ? `?${qs}` : ""}`, { method });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : res.statusText;
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const getJson = <T,>(path: string, params: Record<string, string | number>) => request<T>("GET", path, params);

/**
 * Snapshot data never changes; live data is cached server-side, so re-check after a few minutes.
 * Previous data is kept while new inputs load, but never across a data-source switch (query keys
 * start with the source), so January figures are not shown under "Live".
 */
const cacheFor = (source: DataSource) => ({
  staleTime: source === "live" ? 5 * 60_000 : Infinity,
  placeholderData: <T,>(prev: T | undefined, prevQuery?: { queryKey: QueryKey }) =>
    prevQuery?.queryKey[0] === source ? prev : undefined,
});

export const useMeta = () => {
  const { source } = useControls();
  return useQuery({ queryKey: [source, "meta"], queryFn: () => getJson<Meta>("/meta", { source }), ...cacheFor(source) });
};

/**
 * Date range of the dataset actually served for the selected source (live may fall back to the
 * snapshot). ``null`` until that source's metadata has loaded.
 */
export function useScope() {
  const { data, isPlaceholderData } = useMeta();
  if (!data || isPlaceholderData) return null;
  return { ...data.delivery_range, served: data.source.served, label: data.scope_label };
}

const within = (scope: ReturnType<typeof useScope>, from: string, to: string, slackDays = 0) =>
  scope != null && from >= addDays(scope.first, -slackDays) && to <= scope.last;

/** Force the backend to re-fetch from Elexon, then refetch every live query. */
export const useRefreshLive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<Meta>("POST", "/live/refresh"),
    onSuccess: (meta) => {
      qc.setQueryData(["live", "meta"], meta);
      return qc.invalidateQueries({ queryKey: ["live"] });
    },
  });
};

export const useCockpit = (deliveryDate: string, gate: GateId) => {
  const { source } = useControls();
  const scope = useScope();
  return useQuery({
    queryKey: [source, "cockpit", deliveryDate, gate],
    queryFn: () => getJson<Cockpit>("/cockpit", { delivery_date: deliveryDate, gate, source }),
    enabled: within(scope, deliveryDate, deliveryDate),
    ...cacheFor(source),
  });
};

export const useAccuracy = (gate: GateId, from: string, to: string) => {
  const { source } = useControls();
  const scope = useScope();
  return useQuery({
    queryKey: [source, "accuracy", gate, from, to],
    queryFn: () => getJson<Accuracy>("/accuracy", { gate, from, to, source }),
    enabled: within(scope, from, to),
    ...cacheFor(source),
  });
};

export const useDrift = (deliveryDate: string) => {
  const { source } = useControls();
  const scope = useScope();
  return useQuery({
    queryKey: [source, "drift", deliveryDate],
    queryFn: () => getJson<Drift>("/drift", { delivery_date: deliveryDate, source }),
    enabled: within(scope, deliveryDate, deliveryDate),
    ...cacheFor(source),
  });
};

export const useBuffer = (deliveryDate: string, gate: GateId, confidence: number) => {
  const { source } = useControls();
  const scope = useScope();
  return useQuery({
    queryKey: [source, "buffer", deliveryDate, gate, confidence],
    queryFn: () => getJson<Buffer>("/buffer", { delivery_date: deliveryDate, gate, confidence, source }),
    enabled: within(scope, deliveryDate, deliveryDate),
    ...cacheFor(source),
  });
};

export const useExplorer = (from: string, to: string, horizonH: number) => {
  const { source } = useControls();
  const scope = useScope();
  return useQuery({
    queryKey: [source, "explorer", from, to, horizonH],
    queryFn: () => getJson<Explorer>("/explorer", { from, to, horizon_h: horizonH, source }),
    enabled: within(scope, from, to, 1),
    ...cacheFor(source),
  });
};
