import React, { useEffect, useRef, useState } from 'react';

/* ---------- Status ---------- */

const STATUS_TONES = {
  // Lead statuses
  NEW: 'iris',
  QUEUED: 'info',
  CALLING: 'warning',
  CONNECTED: 'info',
  QUALIFYING: 'info',
  QUALIFIED: 'success',
  NOT_QUALIFIED: 'danger',
  CALLBACK_REQUESTED: 'gold',
  CALLBACK_SCHEDULED: 'gold',
  DO_NOT_CALL: 'neutral',
  // Call statuses
  INITIATING: 'info',
  RINGING: 'warning',
  ANSWERED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  NO_ANSWER: 'neutral',
  BUSY: 'neutral',
  FAILED: 'danger',
  CANCELED: 'neutral',
  // Callback statuses
  SCHEDULED: 'gold',
  PROCESSING: 'info'
};

const LIVE_STATUSES = ['CALLING', 'INITIATING', 'RINGING', 'IN_PROGRESS', 'PROCESSING'];

export function humanize(value) {
  if (!value) return '—';
  return String(value)
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusPill({ status, className = '' }) {
  const tone = STATUS_TONES[status] || 'neutral';
  const live = LIVE_STATUSES.includes(status);
  return (
    <span className={`pill tone-${tone} ${className}`}>
      {live ? <span className="soundwave" aria-hidden="true"><span /><span /><span /><span /></span> : <span className="pill-dot" />}
      {humanize(status)}
    </span>
  );
}

export function RegionChip({ region }) {
  const code = region || 'US';
  return (
    <span className={`pill ${code === 'IN' ? 'tone-gold' : 'tone-info'}`} title={code === 'IN' ? 'India (+91)' : 'United States / other'}>
      {code === 'IN' ? '🇮🇳' : '🌐'} {code}
    </span>
  );
}

/* ---------- Identity ---------- */

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #8b7cf6, #5b46e6)',
  'linear-gradient(135deg, #2dd4bf, #0f766e)',
  'linear-gradient(135deg, #e8c47c, #b7791f)',
  'linear-gradient(135deg, #60a5fa, #2563eb)',
  'linear-gradient(135deg, #f472b6, #be185d)',
  'linear-gradient(135deg, #34d399, #047857)'
];

export function Avatar({ name = '', size = 34 }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '?';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length], fontSize: size * 0.37 }}
    >
      {initials}
    </span>
  );
}

/* ---------- Layout ---------- */

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-2xl blur-xl" style={{ background: 'var(--iris-glow)', opacity: 0.35 }} />
          <div className="relative icon-tile" style={{ width: 52, height: 52, borderRadius: 16 }}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      )}
      <div className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>{title}</div>
      {text && <p className="text-[13px] mt-1.5 max-w-sm faint">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 5 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }).map((__, c) => (
        <td key={c}>
          <div className="skeleton h-3.5" style={{ width: `${c === 0 ? 70 : 40 + ((r + c) % 4) * 12}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="space-y-6 animate-fade" aria-busy="true" aria-label={label}>
      <div className="skeleton h-8 w-72" />
      <div className="skeleton h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-32" style={{ borderRadius: 20 }} />)}
      </div>
      <div className="skeleton h-72" style={{ borderRadius: 20 }} />
    </div>
  );
}

/* ---------- Numbers ---------- */

export function CountUp({ value = 0, decimals = 0, prefix = '', suffix = '', duration = 900 }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(target);
      fromRef.current = target;
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return <span className="num">{prefix}{formatted}{suffix}</span>;
}

/* ---------- Transcript helpers ---------- */

// The backend logs a legacy default greeting ("Hi, this is Jordan calling from
// Vedron Dev Co…") when a call starts. It is never spoken on Plivo calls, so the
// UI hides it.
export function isPlaceholderGreeting(msg) {
  const content = typeof msg?.content === 'string' ? msg.content : '';
  return msg?.role === 'AI' && !/^\s*\[/.test(content) && /vedron dev co|this is jordan calling/i.test(content);
}

export function realMessages(messages = []) {
  return (messages || []).filter(m => !isPlaceholderGreeting(m));
}

/* ---------- Formatting ---------- */

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${String(rem).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
