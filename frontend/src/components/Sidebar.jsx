import React, { useId } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  CalendarClock,
  BarChart3,
  Activity,
  Wallet,
  PhoneOutgoing,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import sankalpLogo from '../assets/sankalp-logo.png';
import sankalpMark from '../assets/sankalp-mark.png';

export const CLIENT_NAME = 'Sankalp';
const LOGO_RATIO = 485 / 125; // width / height of sankalp-logo.png

export const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { path: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { path: '/leads', label: 'Leads', icon: Users },
      { path: '/calls', label: 'Calls & Transcripts', icon: PhoneCall },
      { path: '/callbacks', label: 'Callbacks', icon: CalendarClock }
    ]
  },
  {
    label: 'Insights',
    items: [
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/costing', label: 'Usage & Costs', icon: Wallet }
    ]
  },
  {
    label: 'System',
    items: [
      { path: '/test-call', label: 'Live Call Studio', icon: PhoneOutgoing },
      { path: '/settings', label: 'System Health', icon: Activity }
    ]
  }
];

/**
 * Sankalp's logo (from sankalpcs.com), painted with the theme gradient via a CSS mask
 * so it matches the dashboard instead of looking pasted in.
 */
export function ClientLogo({ height = 30 }) {
  const width = Math.round(height * LOGO_RATIO);
  const mask = `url(${sankalpLogo}) center / contain no-repeat`;
  // Glow sits on the wrapper: a filter on the masked element itself would be clipped away.
  return (
    <div style={{ width, height, filter: 'drop-shadow(0 6px 16px rgba(139,124,246,0.3))' }}>
      <div
        role="img"
        aria-label={`${CLIENT_NAME} logo`}
        title={CLIENT_NAME}
        style={{
          width,
          height,
          WebkitMask: mask,
          mask,
          background: 'linear-gradient(100deg, #ffffff 0%, #e4dfff 45%, #c9bfff 70%, #e8c47c 100%)'
        }}
      />
    </div>
  );
}

/** Sankalp's symbol on a dark tile, used as the client admin's avatar. */
export function ClientMark({ size = 38 }) {
  const inner = Math.round(size * 0.62);
  const mask = `url(${sankalpMark}) center / contain no-repeat`;
  return (
    <span
      className="flex items-center justify-center shrink-0"
      title={CLIENT_NAME}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: 'linear-gradient(145deg, #1d1a33, #12111d)',
        border: '1px solid rgba(139,124,246,0.35)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 20px -10px rgba(139,124,246,0.6)'
      }}
    >
      <span
        role="img"
        aria-label={`${CLIENT_NAME} logo`}
        style={{
          width: inner,
          height: inner,
          WebkitMask: mask,
          mask,
          background: 'linear-gradient(140deg, #ffffff 0%, #d9d2ff 55%, #e8c47c 100%)'
        }}
      />
    </span>
  );
}

/**
 * Orbit mark: a planet ring in the theme gradient on a dark glass tile.
 * The gold orbit passes behind the planet at the top and in front at the bottom.
 */
export function BrandMark({ size = 38 }) {
  const uid = useId().replace(/:/g, '');
  const planet = `orbit-planet-${uid}`;
  const ring = `orbit-ring-${uid}`;
  const back = `orbit-back-${uid}`;
  const front = `orbit-front-${uid}`;
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: 'radial-gradient(120% 120% at 30% 20%, #26214a 0%, #15131f 55%, #0e0d16 100%)',
        border: '1px solid rgba(139,124,246,0.35)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 24px -12px rgba(139,124,246,0.75)'
      }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.72} height={size * 0.72} fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={planet} x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#b9aeff" />
          </linearGradient>
          <linearGradient id={ring} x1="3" y1="16" x2="29" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#c9a052" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#f3d99b" />
            <stop offset="1" stopColor="#e8c47c" />
          </linearGradient>
          <clipPath id={back} clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="32" height="16" /></clipPath>
          <clipPath id={front} clipPathUnits="userSpaceOnUse"><rect x="0" y="16" width="32" height="16" /></clipPath>
        </defs>

        {/* Back half of the orbit (behind the planet) */}
        <g transform="rotate(-24 16 16)">
          <ellipse cx="16" cy="16" rx="13" ry="4.6" stroke={`url(#${ring})`} strokeWidth="1.5" strokeOpacity="0.6" clipPath={`url(#${back})`} />
        </g>

        {/* Planet */}
        <circle cx="16" cy="16" r="7.4" fill="#15131f" stroke={`url(#${planet})`} strokeWidth="2.2" />
        <circle cx="16" cy="16" r="2.6" fill="#ffffff" />

        {/* Front half of the orbit + satellite */}
        <g transform="rotate(-24 16 16)">
          <ellipse cx="16" cy="16" rx="13" ry="4.6" stroke={`url(#${ring})`} strokeWidth="1.7" clipPath={`url(#${front})`} />
          <circle cx="25.96" cy="18.96" r="1.7" fill="#f3d99b" />
        </g>
      </svg>
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const { connected } = useSocket();
  // Placeholder dev user names are shown as the client admin.
  const rawName = user?.name || '';
  const name = !rawName || /dev admin/i.test(rawName) ? `${CLIENT_NAME} Admin` : rawName;

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[264px] shrink-0 flex flex-col transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'linear-gradient(180deg, rgba(14,16,23,0.92), rgba(9,10,15,0.96))',
          borderRight: '1px solid var(--border)',
          backdropFilter: 'blur(20px)',
          transitionTimingFunction: 'var(--ease)'
        }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 h-[72px]">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="leading-tight">
              <div className="font-bold text-[16px] tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                Orbit
              </div>
              <div className="text-[11.5px] faint">
                by <span className="font-semibold" style={{ color: 'var(--gold)' }}>Logicawork</span>
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-7 scroll-thin">
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              <div className="eyebrow px-3 mb-2.5">{section.label}</div>
              <div className="space-y-1">
                {section.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* System + profile */}
        <div className="p-4 space-y-3">
          <div className="rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[12.5px] muted">
                <span className={`live-dot ${connected ? '' : 'live-dot-warning'}`} />
                {connected ? 'All systems live' : 'Reconnecting…'}
              </span>
              <span className="text-[11px] faint">Realtime</span>
            </div>
          </div>

          <div className="flex items-center gap-3 px-1.5">
            <ClientMark size={38} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</div>
              <div className="text-[11.5px] faint truncate">{CLIENT_NAME} · Admin</div>
            </div>
          </div>

          <div className="text-center text-[10.5px] faint pt-1" style={{ letterSpacing: '0.04em' }}>
            Crafted by <span className="font-semibold" style={{ color: 'var(--text-2)' }}>Logicawork</span>
          </div>
        </div>
      </aside>
    </>
  );
}
