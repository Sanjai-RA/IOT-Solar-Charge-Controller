// Shared types for the MPPT Solar dashboard.

export type RangeKey = 'latest' | '1h' | '6h' | '24h' | '7d' | 'custom';

/** One raw reading as delivered by the server (ThingSpeak field1..field4). Null = missing, never zero. */
export interface WireReading {
  t: number; // epoch ms (UTC)
  id: number; // ThingSpeak entry_id (or index when averaged)
  sv: number | null; // field1 solar_panel_voltage (V)
  si: number | null; // field2 solar_panel_current (A)
  bv: number | null; // field3 battery_voltage (V)
  bi: number | null; // field4 battery_current (A)
}

export interface ChannelMeta {
  id: number | null;
  name: string | null;
  fields: Record<string, string>;
  lastEntryId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface TelemetryWire {
  ok: boolean;
  range: { key: RangeKey; start: string | null; end: string | null };
  channel: ChannelMeta | null;
  cols: {
    t: number[];
    id: number[];
    sv: (number | null)[];
    si: (number | null)[];
    bv: (number | null)[];
    bi: (number | null)[];
  };
  count: number;
  truncated: boolean;
  aggregated: string | null; // e.g. "10-minute averages (ThingSpeak)"
  fetchedAt: string;
  cached: boolean;
  access: 'private-key' | 'public';
  error?: string;
}

export type BatteryState = 'charging' | 'discharging' | 'idle' | 'uncalibrated' | 'unknown';
export type EffStatus = 'ok' | 'low_input' | 'not_charging' | 'implausible' | 'missing' | 'uncalibrated';
export type Quality = 'valid' | 'incomplete' | 'out_of_range';

export interface Reading {
  t: number;
  id: number;
  solarVoltage: number | null;
  solarCurrent: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  solarPower: number | null;
  /** Battery power with configured polarity applied: + = into battery (charging). */
  batteryPower: number | null;
  /** Power delivered into the battery (only when charging is confirmed). */
  outputPower: number | null;
  conversionEfficiencyPercent: number | null;
  estimatedPowerLossW: number | null;
  batteryState: BatteryState;
  effStatus: EffStatus;
  quality: Quality;
  issues: string[];
}

export type Polarity = 'positive_charging' | 'negative_charging' | 'not_calibrated';
export type BatteryType = 'not_configured' | 'lead_acid_12v' | 'lifepo4_4s' | 'liion_3s' | 'liion_1s';

export interface Limits {
  solarVoltage: [number, number];
  solarCurrent: [number, number];
  batteryVoltage: [number, number];
  batteryCurrent: [number, number];
}

export interface Settings {
  refreshSeconds: number;
  theme: 'dark' | 'light';
  motion: 'system' | 'reduce' | 'full';
  defaultRange: Exclude<RangeKey, 'latest' | 'custom'>;
  timeZone: 'local' | 'utc';
  liveSeconds: number;
  staleSeconds: number;
  gapMinutes: number;
  polarity: Polarity;
  chargingThresholdA: number;
  minInputPowerW: number;
  effTolerancePct: number;
  panelRatedW: number;
  batteryType: BatteryType;
  batteryNominalV: number;
  limits: Limits;
  forecastMaxAgeMin: number;
}

export type Freshness = 'live' | 'delayed' | 'stale' | 'none';

export type ForecastMetric = 'solarVoltage' | 'solarCurrent' | 'solarPower' | 'batteryVoltage' | 'batteryPower';

export interface ForecastModelScore {
  id: string;
  name: string;
  learned: boolean;
  mae: number | null;
  rmse: number | null;
  evalPoints: number;
  skillVsPersistence: number | null; // 1 - MAE/MAE_persistence
}

export interface ForecastResult {
  status: 'ok' | 'stale' | 'insufficient' | 'horizon_unavailable' | 'error';
  message: string;
  metric: ForecastMetric;
  unit: string;
  horizonMin: number;
  stepMin: number;
  generatedAt: string;
  samplesUsed: number;
  bucketsUsed: number;
  lastObservedAt: string | null;
  train: { start: string; end: string; buckets: number } | null;
  test: { start: string; end: string; origins: number } | null;
  selected: { id: string; name: string; version: string; learned: boolean; params: string } | null;
  models: ForecastModelScore[];
  intervalLevel: number;
  history: { t: number; v: number | null }[];
  forecast: { t: number; v: number; lo: number; hi: number }[];
  backtest: { t: number; actual: number; predicted: number }[];
  availableHorizons: number[];
  notes: string[];
}
