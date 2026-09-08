import React from 'react';

export default function StatCard({ title, value, subtext, icon: Icon, trend, color = 'cyan' }) {
  const colorMap = {
    cyan: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
    purple: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-400',
    rose: 'from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-400'
  };

  return (
    <div className={`p-5 rounded-2xl glass-card border bg-gradient-to-br transition-all hover:scale-[1.02] duration-200 ${colorMap[color] || colorMap.cyan}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="text-2xl font-extrabold text-white tracking-tight font-mono mb-1">
        {value}
      </div>
      {subtext && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          {subtext}
        </p>
      )}
    </div>
  );
}
