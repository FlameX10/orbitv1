import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  PhoneCall, 
  PhoneForwarded, 
  CalendarClock, 
  BarChart3, 
  Settings, 
  ShieldCheck,
  Zap,
  Calculator,
  PhoneIncoming
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/test-call', label: 'Test Instant Call', icon: PhoneIncoming },
  { path: '/leads', label: 'Lead CRM', icon: Users },
  { path: '/calls', label: 'Call Log & Transcripts', icon: PhoneCall },
  { path: '/callbacks', label: 'Scheduled Callbacks', icon: CalendarClock },
  { path: '/analytics', label: 'AI Analytics', icon: BarChart3 },
  { path: '/costing', label: 'Client API Costing', icon: Calculator },
  { path: '/settings', label: 'System Health', icon: Settings }
];

export default function Sidebar() {
  return (
    <aside className="w-64 glass-panel border-r border-slate-800 flex flex-col h-screen sticky top-0 z-30">
      {/* Brand Header */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-800/80">
        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-cyan-500/20">
          <Zap className="w-6 h-6 fill-current" />
        </div>
        <div>
          <h1 className="font-extrabold text-lg text-white tracking-tight flex items-center gap-1.5">
            Vedron <span className="text-cyan-400 text-xs px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 font-mono">VOICE</span>
          </h1>
          <p className="text-xs text-slate-400">AI Lead Qualification</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Core Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-linear-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* System Status Footprint */}
      <div className="p-4 m-4 rounded-xl glass-card border border-emerald-500/20 bg-emerald-950/20">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            PostgreSQL Queue
          </span>
          <span className="text-emerald-400 font-mono font-semibold">ONLINE</span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">No Redis Dependency</div>
      </div>
    </aside>
  );
}
