import type { Freshness, Reading, Settings } from './types';
import { fmtAge } from './format';

export interface Alert {
  id: string;
  level: 'critical' | 'warning' | 'info' | 'ok';
  title: string;
  detail: string;
}

/** Build data-quality alerts. Thresholds come from Settings, so there are no hard-coded fake alarms. */
export function buildAlerts(args: {
  latest: Reading | null;
  freshness: Freshness;
  ageSec: number | null;
  fetchError: string | null;
  recent: Reading[];
  settings: Settings;
}): Alert[] {
  const { latest, freshness, ageSec, fetchError, recent, settings: s } = args;
  const out: Alert[] = [];

  if (fetchError) out.push({ id: 'fetch', level: 'critical', title: 'Cannot refresh from ThingSpeak', detail: `${fetchError} Last known values are shown and marked stale.` });
  if (!latest) {
    if (!fetchError) out.push({ id: 'empty', level: 'warning', title: 'No readings on the channel yet', detail: 'Waiting for the ESP32 to upload its first entry to ThingSpeak.' });
    return out;
  }
  if (freshness === 'stale') out.push({ id: 'stale', level: 'critical', title: 'Stale feed', detail: `Latest ThingSpeak entry is ${fmtAge(ageSec)} (stale threshold ${Math.round(s.staleSeconds / 60)} min). Power flow is hidden.` });
  else if (freshness === 'delayed') out.push({ id: 'delayed', level: 'warning', title: 'Data delayed', detail: `Latest entry ${fmtAge(ageSec)} — slower than the live threshold of ${s.liveSeconds}s.` });

  const missing: string[] = [];
  if (latest.solarVoltage == null) missing.push('PV voltage (field1)');
  if (latest.solarCurrent == null) missing.push('PV current (field2)');
  if (latest.batteryVoltage == null) missing.push('battery voltage (field3)');
  if (latest.batteryCurrent == null) missing.push('battery current (field4)');
  if (missing.length) out.push({ id: 'missing', level: 'warning', title: 'Missing field(s) in latest entry', detail: `${missing.join(', ')} unavailable. Other metrics are still shown.` });

  if (latest.quality === 'out_of_range') {
    out.push({ id: 'oor', level: 'warning', title: 'Sensor value outside configured range', detail: latest.issues.filter((i) => i.startsWith('Out of range')).join('; ') + '. Review limits in Settings against real hardware ratings.' });
  }
  if (latest.solarCurrent != null && latest.solarCurrent < -0.02) {
    out.push({ id: 'negpv', level: 'warning', title: 'Negative PV current', detail: `PV current reads ${latest.solarCurrent.toFixed(3)} A — check sensor orientation/offset.` });
  }
  if (latest.solarPower != null && latest.solarPower < s.minInputPowerW) {
    out.push({ id: 'lowpv', level: 'info', title: 'Low solar input', detail: `PV power ${latest.solarPower.toFixed(2)} W is below the ${s.minInputPowerW} W minimum — efficiency is not calculated.` });
  }
  if (latest.batteryState === 'discharging') out.push({ id: 'dis', level: 'info', title: 'Battery discharging', detail: 'Battery current direction indicates discharge (per configured polarity).' });
  if (s.polarity === 'not_calibrated') out.push({ id: 'pol', level: 'info', title: 'Current direction not calibrated', detail: 'Set battery current polarity in Settings to enable charging state and efficiency.' });

  // Persistent polarity issue: lots of solar input but battery current consistently "discharging"
  const sunny = recent.filter((r) => r.solarPower != null && r.solarPower > s.minInputPowerW * 2 && r.batteryCurrent != null);
  if (s.polarity !== 'not_calibrated' && sunny.length >= 10) {
    const neg = sunny.filter((r) => r.batteryState === 'discharging').length / sunny.length;
    if (neg > 0.8) out.push({ id: 'polsus', level: 'warning', title: 'Possible current-polarity issue', detail: `${Math.round(neg * 100)}% of readings with good solar input show battery discharge. Check field4 sign / polarity setting.` });
  }
  const implausible = recent.filter((r) => r.effStatus === 'implausible').length;
  if (implausible) out.push({ id: 'imp', level: 'warning', title: 'Implausible efficiency readings', detail: `${implausible} reading(s) in range gave efficiency <0% or >${100 + s.effTolerancePct}%. Flagged on the Efficiency page for review (not clamped).` });

  if (latest.effStatus !== 'ok' && latest.effStatus !== 'low_input' && latest.effStatus !== 'uncalibrated') {
    const why: Record<string, string> = {
      missing: 'one or more inputs missing',
      not_charging: 'battery is not charging',
      implausible: 'value outside plausible range',
    };
    out.push({ id: 'effna', level: 'info', title: 'Efficiency calculation unavailable', detail: `Latest reading: ${why[latest.effStatus] ?? latest.effStatus}.` });
  }

  if (!out.some((a) => a.level === 'critical' || a.level === 'warning')) {
    out.unshift({ id: 'ok', level: 'ok', title: 'All checks passed', detail: 'Latest readings are fresh and within configured limits.' });
  }
  return out;
}
