'use client';
import { Sun, Cpu, BatteryCharging } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import type { Freshness, Reading } from '@/lib/types';

/** Solar input → controller → battery output. Width/brightness follow measured power; no flow when stale/invalid. */
export default function PowerFlow({ r, freshness, ratedW }: { r: Reading | null; freshness: Freshness; ratedW: number }) {
  const valid = !!r && freshness === 'live' && r.solarPower != null;
  const inRatio = valid && r!.solarPower! > 0 ? Math.min(1, r!.solarPower! / ratedW) : 0;
  const outRatio = valid && r!.outputPower != null && r!.outputPower > 0 ? Math.min(1, r!.outputPower / ratedW) : 0;
  const flowIn = valid && inRatio > 0.01;
  const flowOut = valid && outRatio > 0.01;
  const reason = !r ? 'No data yet' : freshness !== 'live' ? `Flow hidden — data ${freshness}` : r.solarPower == null ? 'PV reading missing' : null;

  return (
    <div>
      <div className={`pflow ${valid ? '' : 'off'}`}>
        <Node c="var(--amber)" icon={<Sun size={24} />} label="Solar input" value={r?.solarPower} unit="W" />
        <Pipe on={flowIn} ratio={inRatio} c1="var(--amber)" />
        <Node c="var(--cyan)" icon={<Cpu size={24} />} label="Conv. eff." value={r?.effStatus === 'ok' ? r.conversionEfficiencyPercent : null} unit="%" digits={1} />
        <Pipe on={flowOut} ratio={outRatio} c1="var(--mint)" />
        <Node c="var(--mint)" icon={<BatteryCharging size={24} />} label="Battery input" value={r?.outputPower ?? (r && r.batteryState !== 'charging' ? 0 : null)} unit="W" />
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        {reason ?? (r?.batteryState === 'charging' ? 'Energy is flowing into the battery.' : `Battery state: ${r?.batteryState}.`)} Pipe thickness ∝ measured power ÷ {ratedW} W panel rating.
      </p>
    </div>
  );
}

function Node({ c, icon, label, value, unit, digits = 2 }: { c: string; icon: React.ReactNode; label: string; value: number | null | undefined; unit: string; digits?: number }) {
  return (
    <div className="pnode" style={{ ['--c' as any]: c }}>
      <div className="ic">{icon}</div>
      <b><AnimatedNumber value={value ?? null} digits={digits} className="" /> <small style={{ color: c, fontSize: 13 }}>{unit}</small></b>
      <span>{label}</span>
    </div>
  );
}

function Pipe({ on, ratio, c1 }: { on: boolean; ratio: number; c1: string }) {
  const h = 4 + ratio * 12;
  return (
    <div className="pipe" aria-hidden>
      <div className="pipe-track" style={{ height: h, opacity: on ? 0.6 + ratio * 0.4 : 0.35 }}>
        {on && <div className="pipe-fill" style={{ ['--c1' as any]: c1, background: `repeating-linear-gradient(90deg, ${c1} 0 10px, transparent 10px 22px)` }} />}
      </div>
    </div>
  );
}
