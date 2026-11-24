import React from 'react';
import { CountUp } from './ui';

const ACCENTS = {
  cyan: { color: 'var(--iris)', glow: 'rgba(139,124,246,0.22)' },
  iris: { color: 'var(--iris)', glow: 'rgba(139,124,246,0.22)' },
  emerald: { color: 'var(--success)', glow: 'rgba(52,211,153,0.18)' },
  amber: { color: 'var(--gold)', glow: 'rgba(232,196,124,0.18)' },
  purple: { color: 'var(--aqua)', glow: 'rgba(45,212,191,0.18)' },
  rose: { color: 'var(--danger)', glow: 'rgba(248,113,113,0.18)' }
};

/**
 * KPI tile. `value` may be a number (animated count-up) or a preformatted string.
 */
export default function StatCard({ title, value, subtext, icon: Icon, color = 'iris', suffix = '', decimals = 0, style }) {
  const accent = ACCENTS[color] || ACCENTS.iris;
  const isNumber = typeof value === 'number';

  return (
    <div className="card card-hover overflow-hidden p-5" style={style}>
      <div
        className="absolute -top-16 -right-16 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent.glow}, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between">
        <span className="eyebrow">{title}</span>
        {Icon && (
          <span
            className="icon-tile"
            style={{ color: accent.color, background: accent.glow, borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
      </div>
      <div className="relative mt-3 text-[32px] font-bold leading-none" style={{ color: 'var(--text)' }}>
        {isNumber ? <CountUp value={value} decimals={decimals} suffix={suffix} /> : <span className="num">{value}</span>}
      </div>
      {subtext && <p className="relative text-[12.5px] faint mt-3">{subtext}</p>}
    </div>
  );
}
