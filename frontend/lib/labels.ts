export function stateLabel(s?: string) {
  switch (s) {
    case 'charging': return 'Charging';
    case 'discharging': return 'Discharging';
    case 'idle': return 'Idle';
    case 'uncalibrated': return 'Direction not calibrated';
    default: return 'Unknown';
  }
}
export function effReason(s?: string) {
  switch (s) {
    case 'low_input': return 'Low solar input';
    case 'not_charging': return 'Not charging';
    case 'implausible': return 'Flagged — review';
    case 'uncalibrated': return 'Polarity not set';
    case 'missing': return 'Inputs missing';
    default: return 'Unavailable';
  }
}
