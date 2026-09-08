import React from 'react';

export default function QualificationBadge({ status, score }) {
  const badgeStyles = {
    QUALIFIED: 'bg-emerald-950/80 border-emerald-700/60 text-emerald-400',
    NOT_QUALIFIED: 'bg-rose-950/80 border-rose-700/60 text-rose-400',
    CALLBACK_REQUESTED: 'bg-amber-950/80 border-amber-700/60 text-amber-400',
    CALLBACK_SCHEDULED: 'bg-amber-950/80 border-amber-700/60 text-amber-400',
    DO_NOT_CALL: 'bg-slate-900 border-slate-700 text-slate-400',
    NEW: 'bg-cyan-950/80 border-cyan-700/60 text-cyan-400',
    CALLING: 'bg-blue-950/80 border-blue-700/60 text-blue-400 animate-pulse'
  };

  const currentStyle = badgeStyles[status] || 'bg-slate-800 border-slate-700 text-slate-300';

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${currentStyle}`}>
        {status?.replace(/_/g, ' ')}
      </span>
      {score !== undefined && score !== null && score > 0 && (
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
          Score: {score}
        </span>
      )}
    </div>
  );
}
