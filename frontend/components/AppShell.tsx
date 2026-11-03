'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Sun, BatteryCharging, Gauge, BrainCircuit, History, Settings as SettingsIcon,
  Menu, Moon, SunMedium, RefreshCw, ChevronLeft, ChevronRight, Zap, MoreHorizontal,
} from 'lucide-react';
import { useLatest, useSettings } from './Providers';
import { FreshnessBadge } from './LiveStatus';
import { fmtTime } from '@/lib/format';

export const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, rgb: '255, 176, 32' },
  { href: '/solar', label: 'Solar Panel', icon: Sun, rgb: '255, 176, 32' },
  { href: '/battery', label: 'Battery', icon: BatteryCharging, rgb: '46, 211, 162' },
  { href: '/efficiency', label: 'MPPT & Efficiency', icon: Gauge, rgb: '25, 199, 217' },
  { href: '/forecast', label: 'AI Forecast', icon: BrainCircuit, rgb: '139, 124, 255' },
  { href: '/history', label: 'History & Reports', icon: History, rgb: '79, 141, 255' },
  { href: '/settings', label: 'System Settings', icon: SettingsIcon, rgb: '169, 184, 212' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { settings, update } = useSettings();
  const L = useLatest();
  const current = NAV.find((n) => (n.href === '/' ? pathname === '/' : pathname.startsWith(n.href))) ?? NAV[0];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chName = L.wire?.channel?.name ?? 'MPPT SOLAR PANEL';

  return (
    <div className="shell">
      <div className="aurora" aria-hidden />
      <aside className={`sidebar ${open ? 'expanded' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-logo" aria-hidden><div><Zap size={20} strokeWidth={2.4} /></div></div>
          <div className="brand-text"><b>MPPT SOLAR</b><span>Intelligent Monitor</span></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => {
            const active = n === current;
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}
                style={{ ['--nav-rgb' as any]: n.rgb }} title={n.label}>
                <Icon size={20} />
                <span className="nav-label">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <button className="icon-btn collapse-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}>
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
        <div className="sidebar-foot">
          <div>Channel <b>{chName}</b></div>
          <div className="mono">ID 3534436 · field1–4</div>
        </div>
      </aside>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation menu"><Menu size={18} /></button>
          <div className="topbar-title">
            <b>MPPT Solar · {current.label}</b>
            <span>Last update: {L.latest ? fmtTime(L.latest.t, settings.timeZone, true) : L.loading ? 'loading…' : '—'}</span>
          </div>
          <div className="topbar-right">
            <FreshnessBadge />
            <button className="icon-btn" onClick={L.refresh} aria-label="Refresh data now" title="Refresh now">
              <RefreshCw size={17} className={L.loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              aria-label={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
              {settings.theme === 'dark' ? <SunMedium size={17} /> : <Moon size={17} />}
            </button>
            <Link className="icon-btn hide-mobile" href="/settings" aria-label="Settings" title="Settings"><SettingsIcon size={17} /></Link>
          </div>
        </header>
        <main className="content" id="content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {NAV.slice(0, 5).map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={n === current ? 'active' : ''} aria-current={n === current ? 'page' : undefined}>
              <Icon size={19} /><span>{n.label.split(' ')[0]}</span>
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} aria-label="More pages"><MoreHorizontal size={19} /><span>More</span></button>
      </nav>
    </div>
  );
}
