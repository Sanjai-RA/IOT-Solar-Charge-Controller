import type { Settings } from './types';

/**
 * Default dashboard configuration. Every value is editable on the Settings page.
 * Defaults are deliberately generous; review them against your real hardware ratings
 * (panel ~9.88 W nameplate, your battery chemistry/voltage, sensor ranges).
 */
export const DEFAULT_SETTINGS: Settings = {
  refreshSeconds: 30,
  theme: 'dark',
  motion: 'system',
  defaultRange: '6h',
  timeZone: 'local',
  liveSeconds: 90,
  staleSeconds: 600,
  gapMinutes: 5,
  polarity: 'positive_charging',
  chargingThresholdA: 0.02,
  minInputPowerW: 0.3,
  effTolerancePct: 5,
  panelRatedW: 9.88,
  batteryType: 'not_configured',
  batteryNominalV: 12,
  limits: {
    solarVoltage: [0, 25],
    solarCurrent: [-0.05, 1.5],
    batteryVoltage: [0, 15],
    batteryCurrent: [-3, 3],
  },
  forecastMaxAgeMin: 30,
};

export const SETTINGS_STORAGE_KEY = 'mppt-dashboard-settings-v1';

export const FIELD_MAP = [
  { field: 'field1', name: 'solar_panel_voltage', unit: 'V', key: 'sv' },
  { field: 'field2', name: 'solar_panel_current', unit: 'A', key: 'si' },
  { field: 'field3', name: 'battery_voltage', unit: 'V', key: 'bv' },
  { field: 'field4', name: 'battery_current', unit: 'A', key: 'bi' },
] as const;

export const RANGE_LABELS: Record<string, string> = {
  '1h': '1 hour',
  '6h': '6 hours',
  '24h': '24 hours',
  '7d': '7 days',
  custom: 'Custom',
};

export const BATTERY_TYPES: Record<string, { label: string; nominal: number }> = {
  not_configured: { label: 'Not configured', nominal: 12 },
  lead_acid_12v: { label: 'Lead-acid 12 V (SLA/AGM)', nominal: 12 },
  lifepo4_4s: { label: 'LiFePO4 4S (12.8 V)', nominal: 12.8 },
  liion_3s: { label: 'Li-ion 3S (11.1 V)', nominal: 11.1 },
  liion_1s: { label: 'Li-ion 1S (3.7 V)', nominal: 3.7 },
};
