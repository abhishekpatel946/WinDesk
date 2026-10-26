import type { ReactNode } from "react";
import type { Info } from "../components/InfoTip";

/**
 * Plain-English definitions shown in the ⓘ popovers. Pages add a "now" sentence built from the
 * numbers on screen via `explain(key, now)`.
 */
const GLOSSARY = {
  // Controls
  deliveryDay: {
    what: "The day the electricity is actually used. The purchase decision is made the day before (D-1). In the GB market a 'day' runs 23:00 to 23:00 UK time.",
    read: "Use the arrows or the calendar to pick another day. Only days covered by the selected data source can be picked.",
  },
  auction: {
    what: "The day-ahead auction you buy in. Each closes ('gate closure') at a fixed UK time on the day before delivery: EPEX 60-min 09:20, N2EX 09:50, EPEX 30-min 15:30.",
    read: "Only forecasts published strictly before the gate time can be used, so a later auction can use a fresher forecast.",
  },
  dataSource: {
    what: "Snapshot is a bundled copy of Elexon data for January 2026 purchase decisions. Live Elexon downloads forecasts and actuals from Elexon now, covering the last 60 delivery days up to tomorrow.",
    read: "Live data is cached for 15 minutes; Refresh downloads it again immediately. If Elexon cannot be reached the app falls back to the snapshot.",
  },
  deliveriesRange: {
    what: "The delivery days included in every number on this page.",
    read: "Narrow it to study a particular week or period.",
  },

  // Cockpit
  decision: {
    what: "Which forecast the buyer had when the auction closed. Elexon publishes a new wind forecast (a 'run') about 8 times a day; the latest one published before the gate is the one that could be used.",
    read: "'Lead' is how many hours ahead the forecast was made. A run published exactly at the gate is too late.",
  },
  forecastEnergy: {
    what: "Total wind energy the official Elexon forecast expects over the whole delivery day.",
    read: "GWh is an amount of energy (1 GWh ≈ what 100,000 UK homes use in a day). GW is the rate of production at a moment.",
  },
  biasAdjusted: {
    what: "Our corrected forecast: the official forecast minus its average error over the previous 7 days.",
    read: "If the forecast has recently been too high, the adjusted value is lower. Only errors known before the gate are used.",
  },
  likelyRange: {
    what: "A realistic range for the day's total wind energy, from the low case (P10) to the high case (P90).",
    read: "P10 means only a 1-in-10 chance of less; P90 means only a 1-in-10 chance of more. So about 8 in 10 similar days land inside the range. It is learned from the last 30 days of forecast errors.",
  },
  riskiestHour: {
    what: "The hour with the widest gap between the low (P10) and high (P90) case.",
    read: "This is the least predictable hour of the day, so the one most worth hedging or watching.",
  },
  actualEnergy: {
    what: "Wind energy that was actually generated on the delivery day (measured, from Elexon FUELHH).",
    read: "Only shown once the day is over. Compare it with the forecast energy above.",
  },
  dayMae: {
    what: "Mean absolute error for this day: the average size of the hourly miss, ignoring whether it was too high or too low.",
    read: "Lower is better. 1 GW is roughly the output of a large power station.",
  },
  dayBias: {
    what: "The average signed error for this day (forecast − actual).",
    read: "Positive (+) means the forecast promised more wind than came, so a buyer who trusted it was short.",
  },
  dayCorrectedMae: {
    what: "The average hourly miss of the bias-adjusted forecast for this day.",
    read: "If it is lower than the forecast error, the adjustment helped on this day.",
  },
  cockpitChart: {
    what: "Hour-by-hour wind output for the delivery day: the official forecast (blue), the likely range P10–P90 (shaded), the bias-adjusted forecast (orange dashed) and, once known, the actual output (green).",
    read: "A wider band means more uncertainty. If the blue line sits near the top of the band, recent history suggests reality will come in lower than forecast.",
  },
  hourlyDetail: {
    what: "The same numbers as the chart, one row per hour of the delivery day (UK local time, starting 23:00).",
    read: "Export CSV downloads this table. Clock-change days have 23 or 25 rows.",
  },
  colHour: { what: "The hour starting at this UK local time." },
  colLead: {
    what: "Lead time: hours between when the forecast was published and the start of this hour.",
    read: "Longer lead times are usually less accurate.",
  },
  colForecast: { what: "The official Elexon forecast for this hour, in GW." },
  colP10: { what: "Low case: only a 1-in-10 chance that actual wind is below this." },
  colP90: { what: "High case: only a 1-in-10 chance that actual wind is above this." },
  colBiasAdj: { what: "Forecast minus the average error of the last 7 days." },
  colActual: { what: "Measured wind output for this hour (average of the two half-hours). Blank until the hour has passed." },
  colError: {
    what: "Forecast − actual for this hour.",
    read: "Positive (red) means the forecast was too high.",
  },

  // Accuracy
  mae: {
    what: "Mean absolute error: the average size of the hourly miss, ignoring whether the forecast was too high or too low.",
    read: "Lower is better. It answers 'typically, how far off is the forecast each hour?'",
  },
  rmse: {
    what: "Root mean square error: another average miss, but big misses count extra.",
    read: "Always at least the MAE. A much bigger RMSE than MAE means there are occasional large misses.",
  },
  bias: {
    what: "The average signed error (forecast − actual).",
    read: "Positive (+) means the forecast is systematically too high; negative means too low; near zero means no consistent lean.",
  },
  p90Abs: {
    what: "The 90th percentile of the hourly miss size — a 'bad hour' measure.",
    read: "9 out of 10 hours had a smaller miss than this; the worst 1 in 10 were bigger.",
  },
  overForecast: {
    what: "Share of hours where the forecast was higher than the actual output.",
    read: "An unbiased forecast would be near 50%. Well above 50% means it is consistently too optimistic.",
  },
  correctedMae: {
    what: "The average hourly miss of the bias-adjusted forecast (official forecast minus its last-7-day average error).",
    read: "Lower than the MAE means the simple correction makes the forecast more accurate.",
  },
  keyFinding: {
    what: "The main takeaway from the numbers on this page, in plain words.",
    read: "'Under-procure' = buy less electricity than needed because the wind forecast was too optimistic. 'Curtailed' = wind farms told to switch off when the grid cannot carry their power; the meters see this, the forecast may not.",
  },
  gateComparison: {
    what: "Average hourly miss (MAE) of the forecast available at each auction's closing time, over the same days.",
    read: "Shorter bar = more accurate. The highlighted bar is the auction you selected.",
  },
  leadCurve: {
    what: "Average miss (MAE, solid) and bias (dashed) of every Elexon forecast, grouped by how far ahead it was made.",
    read: "Left = made shortly before the hour; right = made up to two days ahead. A rising line means forecasting earlier costs accuracy.",
  },
  dailyEnergy: {
    what: "For each delivery day: forecast energy (blue bar) vs actual energy (green bar), plus that day's average hourly miss (yellow line, right axis).",
    read: "Blue taller than green means the forecast over-promised that day. Yellow spikes are the bad days.",
  },
  byHour: {
    what: "Average miss (bars) and bias (red line) for each hour of the delivery day, across all selected days.",
    read: "Shows whether some times of day are harder to forecast. 23:00 is the first hour of the GB delivery day.",
  },
  histogram: {
    what: "How often each size of error happened. Each bar counts hours whose error (forecast − actual) fell in a 0.5 GW bucket.",
    read: "The dashed line is zero (perfect). Blue bars: forecast too low; red bars: too high. A fair forecast makes a hill centred on zero.",
  },
  byWindLevel: {
    what: "Forecast errors grouped by how windy it actually was.",
    read: "Windier hours usually have bigger misses in GW terms, partly because the numbers themselves are bigger.",
  },
  colWindLevel: { what: "Range of actual wind output in that hour." },
  colHours: { what: "How many hours fell into this group." },
  calibration: {
    what: "A check of the cockpit's P10–P90 range: did reality land inside it as often as it claims?",
    read: "Ideally about 80% inside, 10% below P10 and 10% above P90. Each day's range uses only errors known before that day's gate, so this is an honest test.",
  },
  insideRange: {
    what: "Share of hours where the actual output landed between P10 and P90.",
    read: "Target ≈ 80%. Much lower means the range is too narrow (over-confident); much higher means too wide.",
  },
  belowP10: {
    what: "Share of hours where the actual output was below the low case (P10).",
    read: "Target ≈ 10%. Higher means there was less wind than even the pessimistic case more often than promised.",
  },
  aboveP90: {
    what: "Share of hours where the actual output was above the high case (P90).",
    read: "Target ≈ 10%.",
  },

  // Drift
  driftRuns: {
    what: "Every forecast run that predicted this delivery day, from two days before until the day itself. Grey = older runs, blue = newer, amber = the run used at the selected auction, green = actual output.",
    read: "Lines bunched together mean the forecasts agreed. The gap between the bunch and the green line is the error.",
  },
  driftWaiting: {
    what: "Average hourly miss (MAE) of each run for this day, in publication order.",
    read: "Shorter = better. Blue bars were published before delivery started; amber is the run used at the auction; grey bars were published during the day and only cover the remaining hours, so they are not directly comparable.",
  },
  driftSummary: {
    what: "Summary of all forecast runs for this delivery day and how accurate they were.",
    read: "'Gate' is the auction closing time; MAE is the average hourly miss; GWh is the day's total energy.",
  },

  // Buffer
  confidence: {
    what: "How sure you want to be that wind delivers at least the 'firm' amount you plan on.",
    read: "Higher confidence → lower firm level and a bigger buffer: safer, but you buy more backup power.",
  },
  forecastWind: {
    what: "Total wind energy in the raw Elexon forecast available at the auction gate.",
  },
  firmWind: {
    what: "The wind energy you can count on at the chosen confidence level: forecast minus the size of recent over-forecasts at that confidence.",
    read: "Plan your purchases as if only this much wind arrives.",
  },
  bufferToSecure: {
    what: "Forecast minus firm wind: the extra energy to secure from other sources in case the wind under-delivers.",
  },
  peakBuffer: {
    what: "The hour needing the most backup, and how much.",
  },
  bufferChart: {
    what: "Hour by hour: the raw forecast (blue), the firm level you plan on (yellow), the buffer between them (shaded) and, once known, the actual output (green dashed).",
    read: "If the green line stays above yellow, the plan covered the shortfall in that hour.",
  },
  backtest: {
    what: "A replay of every past delivery day in the period: how often would you have had less wind than planned, if you planned on the raw forecast vs on the firm level?",
    read: "Each day's firm level uses only errors known before its gate.",
  },
  rawPlan: {
    what: "Planning as if the raw forecast is exactly right.",
    read: "'Hours short' = share of hours where actual wind was below the plan. Shortfall = total missing energy you would have to buy at short notice.",
  },
  firmPlan: {
    what: "Planning on the firm wind level at the chosen confidence.",
    read: "Average buffer = how much extra backup power you would have bought each hour on average.",
  },

  // Explorer
  horizon: {
    what: "Forecast horizon (lead time): for each hour, use the latest forecast published at least this many hours earlier.",
    read: "0 h = freshest forecast available; 24 h = a day ahead; 48 h = two days ahead.",
  },
  targetDates: {
    what: "The hours (UK calendar days) compared on this page, up to 31 days.",
  },
  explorerChart: {
    what: "For every hour: the forecast made at least N hours earlier (blue) vs what actually happened (green).",
    read: "Where blue is above green the forecast was too high. Move the slider to see whether forecasting later helps.",
  },
} satisfies Record<string, Info>;

export type GlossaryKey = keyof typeof GLOSSARY;

export const explain = (key: GlossaryKey, now?: ReactNode): Info => ({ ...GLOSSARY[key], now });

/** "too high" / "too low" for a signed error in MW. */
export const lean = (mw: number | null | undefined) => (mw == null ? "" : mw >= 0 ? "too high" : "too low");
