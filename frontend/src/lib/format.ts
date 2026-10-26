const nf = (digits: number) =>
  new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const gw = (mw: number | null | undefined, digits = 1) =>
  mw == null ? "–" : `${nf(digits).format(mw / 1000)} GW`;

export const gwh = (mwh: number | null | undefined, digits = 0) =>
  mwh == null ? "–" : `${nf(digits).format(mwh / 1000)} GWh`;

export const signedGw = (mw: number | null | undefined, digits = 2) =>
  mw == null ? "–" : `${mw > 0 ? "+" : ""}${nf(digits).format(mw / 1000)} GW`;

export const pct = (share: number | null | undefined, digits = 0) =>
  share == null ? "–" : `${nf(digits).format(share * 100)}%`;

const axisNf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
export const axisGw = (mw: number) => axisNf.format(mw / 1000);

/** "2026-01-10" -> "Sat 10 Jan 2026" */
export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const ukTime = (isoUtc: string, withDay = false) =>
  new Date(isoUtc).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
  });

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
