import React from 'react';
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
import { Avatar } from './ui';

export const CLIENT_NAME = 'Sankalp';

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

export function BrandMark({ size = 38 }) {
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: 'linear-gradient(140deg, #a99dff 0%, #6f5cf2 50%, #2e2373 100%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.35) inset, 0 10px 26px -10px rgba(139,124,246,0.8)'
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" stroke="#fff" strokeOpacity="0.95" strokeWidth="2" />
        <ellipse cx="12" cy="12" rx="10.5" ry="3.6" stroke="#e8c47c" strokeWidth="1.6" transform="rotate(-28 12 12)" />
        <circle cx="12" cy="12" r="2.4" fill="#fff" />
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

        {/* Client workspace */}
        <div className="px-4 pb-4">
          <div
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{ background: 'linear-gradient(135deg, rgba(139,124,246,0.12), rgba(232,196,124,0.05))', border: '1px solid rgba(139,124,246,0.2)' }}
          >
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0"
              style={{ fontFamily: 'var(--font-display)', color: '#1a1406', background: 'linear-gradient(140deg, #f3d99b, #c9a052)' }}
            >
              S
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{CLIENT_NAME}</div>
              <div className="text-[11px] faint">Client workspace</div>
            </div>
          </div>
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
            <Avatar name={name} size={36} />
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
