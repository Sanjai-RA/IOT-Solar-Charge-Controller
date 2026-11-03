'use client';
import { motion } from 'framer-motion';
import { useSettings } from './Providers';

/**
 * Animated solar → controller → battery scene.
 * Brightness follows MEASURED PV power ÷ panel rating. The sun is decorative and is NOT an irradiance sensor.
 * Energy flow animates only when data is live AND measured PV power is above the minimum threshold.
 */
export default function SolarScene({
  powerW, ratedW, live, charging, solarV, batteryV, compact = false,
}: {
  powerW: number | null; ratedW: number; live: boolean; charging: boolean; solarV: number | null; batteryV: number | null; compact?: boolean;
}) {
  const { reducedMotion, settings } = useSettings();
  const ratio = powerW != null && ratedW > 0 ? Math.max(0, Math.min(1, powerW / ratedW)) : 0;
  const k = powerW == null ? 0.15 : 0.15 + 0.85 * ratio; // scene light level
  const flowing = live && powerW != null && powerW >= settings.minInputPowerW;
  const wire = 'M 548 214 C 590 214, 600 222, 636 222';
  const wire2 = 'M 716 222 C 740 222, 746 230, 772 230';
  const panels = [0, 1, 2];

  return (
    <div style={{ width: '100%', height: '100%', background: mix('#071027', '#1d4b8f', k), display: 'flex' }}>
    <svg className="scene-svg" viewBox="30 -40 840 380" preserveAspectRatio="xMidYMax meet" role="img"
      aria-label={`Solar scene. Measured PV power ${powerW == null ? 'unavailable' : powerW.toFixed(2) + ' W'}; energy flow ${flowing ? 'active' : 'not shown'}.`}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.12" stopColor={mix('#071027', '#1d4b8f', k)} />
          <stop offset="0.65" stopColor={mix('#0c1a38', '#ff9f43', k * 0.55)} />
          <stop offset="1" stopColor={mix('#101e3c', '#ffd27a', k * 0.5)} />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0" stopColor="#fff3c4" stopOpacity={0.9 * k + 0.1} />
          <stop offset="0.35" stopColor="#ffb020" stopOpacity={0.55 * k + 0.05} />
          <stop offset="1" stopColor="#ffb020" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sunCore">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.6" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#ff9a1f" />
        </radialGradient>
        <linearGradient id="panelFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b3f7a" />
          <stop offset="0.5" stopColor="#123064" />
          <stop offset="1" stopColor="#0a1d40" />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.35 * k + 0.05} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd27a" stopOpacity={0.35 * k} />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix('#0d2a2a', '#1f6b55', k)} />
          <stop offset="1" stopColor="#081620" />
        </linearGradient>
        <linearGradient id="flowGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#ffb020" />
          <stop offset="1" stopColor="#2ed3a2" />
        </linearGradient>
        <clipPath id="panelClip">
          {panels.map((i) => <path key={i} d={panelPath(i)} />)}
        </clipPath>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      <rect x="0" y="-60" width="900" height="400" fill="url(#sky)" />

      {/* stars fade out as measured power rises */}
      <g opacity={Math.max(0, 1 - k * 1.6)}>
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#dfe9ff" className={reducedMotion ? '' : 'twinkle'} style={{ animationDelay: `${(i % 7) * 0.6}s` }} />
        ))}
      </g>

      {/* sun */}
      <g transform={`translate(150 ${110 - 30 * k})`}>
        <circle r="120" fill="url(#sunGlow)" />
        <g className={reducedMotion ? '' : 'sun-rays'} opacity={0.25 + 0.6 * k}>
          {Array.from({ length: 16 }).map((_, i) => (
            <rect key={i} x="-2.5" y="-92" width="5" height={i % 2 ? 26 : 38} rx="2.5" fill="#ffd27a" transform={`rotate(${i * 22.5})`} />
          ))}
        </g>
        <circle r="40" fill="url(#sunCore)" className={reducedMotion ? '' : 'sun-core'} opacity={0.45 + 0.55 * k} />
      </g>

      {/* light beams toward panels */}
      <path d="M 180 120 L 520 168 L 300 250 Z" fill="url(#beam)" />

      {/* hills */}
      <path d="M0 262 C 120 236, 220 250, 330 246 C 460 240, 560 232, 680 246 C 780 256, 840 250, 900 244 L900 330 L0 330 Z" fill="url(#ground)" />
      <path d="M0 290 C 160 276, 300 284, 450 280 C 620 276, 760 290, 900 284 L900 330 L0 330 Z" fill="#06121c" opacity="0.6" />

      {/* panel array (gentle tilt on entry, then stable) */}
      <motion.g
        initial={{ opacity: 0, y: 24, rotate: -3 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '420px 240px' }}
      >
        {panels.map((i) => (
          <g key={i}>
            <line x1={300 + i * 86} y1={238} x2={300 + i * 86} y2={268} stroke="#5b6b85" strokeWidth="4" />
          </g>
        ))}
        {panels.map((i) => (
          <g key={`p${i}`}>
            <path d={panelPath(i)} fill="url(#panelFace)" stroke="#8fb4ff" strokeOpacity="0.55" strokeWidth="1.5" />
            {gridLines(i).map((d, j) => <path key={j} d={d} stroke="#7fa6ff" strokeOpacity="0.28" strokeWidth="1" fill="none" />)}
          </g>
        ))}
        <g clipPath="url(#panelClip)">
          <rect x="140" y="150" width="130" height="120" fill="url(#shine)" className={reducedMotion ? '' : 'shimmer'} transform="skewX(-20)" />
          <rect x="150" y="150" width="600" height="120" fill="#ffd27a" opacity={0.12 * k} />
        </g>
      </motion.g>

      {/* wires */}
      <path d={wire} stroke="#3a4a66" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={wire2} stroke="#3a4a66" strokeWidth="6" fill="none" strokeLinecap="round" />
      {flowing && (
        <>
          <path d={wire} stroke="url(#flowGrad)" strokeWidth="4" fill="none" strokeLinecap="round" className={reducedMotion ? '' : 'flow-line'} />
          <path d={wire2} stroke="#2ed3a2" strokeWidth="4" fill="none" strokeLinecap="round" className={reducedMotion ? '' : 'flow-line'} />
          {!reducedMotion && [0, 0.6, 1.2].map((b) => (
            <circle key={b} r="4" fill="#fff6d6" filter="url(#soft)">
              <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${b}s`} path={`${wire} L 716 222 ${wire2.replace('M 716 222', '')}`} />
            </circle>
          ))}
        </>
      )}

      {/* MPPT controller */}
      <g transform="translate(636 192)">
        <rect width="80" height="60" rx="12" fill="#101c33" stroke={flowing ? '#19c7d9' : '#3a4a66'} strokeWidth="2" />
        <text x="40" y="27" textAnchor="middle" fill="#bfe9ff" fontSize="14" fontWeight="700" fontFamily="var(--font)">MPPT</text>
        <rect x="14" y="38" width="52" height="10" rx="5" fill="#0b1220" />
        <circle cx="22" cy="43" r="3.5" fill={live ? '#2ed3a2' : '#ff6b6b'} className={live && !reducedMotion ? 'led' : ''} />
        <text x="58" y="46" textAnchor="end" fill="#7487a8" fontSize="8" fontFamily="var(--mono)">{live ? 'LIVE' : 'NO LINK'}</text>
      </g>

      {/* battery (no fill level: SoC is not measured) */}
      <g transform="translate(772 186)">
        <rect x="18" y="-8" width="14" height="10" rx="2" fill="#5b6b85" />
        <rect x="46" y="-8" width="14" height="10" rx="2" fill="#5b6b85" />
         <rect width="78" height="88" rx="12" fill="#0f2233" stroke={charging && flowing ? '#2ed3a2' : '#3a4a66'} strokeWidth="2.5" />
        {charging && flowing ? (
          <path d="M44 18 L28 48 L40 48 L34 72 L54 38 L42 38 L48 18 Z" fill="#2ed3a2" />
        ) : (
          <text x="39" y="50" textAnchor="middle" fill="#7487a8" fontSize="12" fontFamily="var(--font)">BATT</text>
        )}
      </g>

      {/* labels */}
      {!compact && (
        <g fontFamily="var(--mono)" fontSize="13" fontWeight="600">
          <g transform="translate(330 140)">
            <rect x="-6" y="-17" width={124} height="24" rx="8" fill="rgba(11,18,32,0.7)" stroke="rgba(255,176,32,0.5)" />
            <text x="56" y="0" textAnchor="middle" fill="#ffcf70">{solarV == null ? '— V' : `${solarV.toFixed(2)} V`} · PV</text>
          </g>
          <g transform="translate(762 302)">
            <rect x="-8" y="-17" width={110} height="24" rx="8" fill="rgba(11,18,32,0.7)" stroke="rgba(46,211,162,0.5)" />
            <text x="47" y="0" textAnchor="middle" fill="#7ff0cc">{batteryV == null ? '— V' : `${batteryV.toFixed(2)} V`}</text>
          </g>
        </g>
      )}
      {!flowing && (
        <text x="676" y="176" textAnchor="middle" fill="#ff9b9b" fontSize="11" fontFamily="var(--font)">
          {live ? 'PV input below threshold' : 'Data not live — flow hidden'}
        </text>
      )}
    </svg>
    </div>
  );
}

function panelPath(i: number) {
  const x = 250 + i * 86;
  return `M ${x} 236 L ${x + 82} 236 L ${x + 108} 176 L ${x + 30} 176 Z`;
}
function gridLines(i: number) {
  const x = 250 + i * 86;
  const out: string[] = [];
  for (let c = 1; c < 4; c++) {
    const bx = x + (82 * c) / 4, tx = x + 30 + (78 * c) / 4;
    out.push(`M ${bx} 236 L ${tx} 176`);
  }
  for (let r = 1; r < 3; r++) {
    const f = r / 3, y = 236 - 60 * f, lx = x + 30 * f, rx = x + 82 + 26 * f;
    out.push(`M ${lx} ${y} L ${rx} ${y}`);
  }
  return out;
}
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * Math.max(0, Math.min(1, t)));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
const STARS: [number, number, number][] = [
  [40, 30, 1.2], [90, 70, 1], [230, 40, 1.4], [300, 90, 1], [380, 30, 1.3], [450, 70, 1], [520, 40, 1.5], [600, 20, 1],
  [660, 80, 1.2], [720, 40, 1], [800, 60, 1.4], [860, 25, 1], [560, 110, 0.9], [410, 120, 0.8], [760, 120, 1],
];
