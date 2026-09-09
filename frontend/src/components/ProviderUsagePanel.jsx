import React from 'react';
import { Coins, DollarSign, Gauge, MessageSquare, Timer } from 'lucide-react';

function displayValue(value, suffix = '') {
  return value === null || value === undefined || value === '' ? 'Not available' : `${value}${suffix}`;
}

function UsageMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="w-3.5 h-3.5 text-cyan-400" />
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold text-slate-200 break-words">{value}</div>
    </div>
  );
}

export default function ProviderUsagePanel({ call }) {
  const provider = call?.elevenLabsMetadata || {};
  const metadata = provider.metadata || {};
  const charging = provider.charging || metadata.charging || {};
  const analysis = provider.analysis || {};
  const summary = call?.summary || analysis.transcript_summary || analysis.summary;
  const credits = metadata.cost ?? metadata.credits;
  const llmCredits = charging.llm_charge ?? metadata.llm_charge ?? metadata.llm_credits;
  const llmCost = charging.llm_price ?? metadata.llm_price;
  const totalCost = metadata.cost_fiat ?? metadata.cost_usd ?? metadata.total_cost_usd;
  const duration = metadata.call_duration_secs ?? call?.duration;
  const terminationReason = provider.terminationReason || metadata.termination_reason || metadata.terminationReason;

  return (
    <div className="glass-card p-6 rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">ElevenLabs Usage</h3>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Provider data</span>
      </div>
      {summary && (
        <p className="mb-4 text-xs text-slate-300 leading-relaxed">{summary}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <UsageMetric icon={Coins} label="Credits" value={displayValue(credits)} />
        <UsageMetric icon={Coins} label="LLM credits" value={displayValue(llmCredits)} />
        <UsageMetric icon={DollarSign} label="LLM cost" value={displayValue(llmCost, llmCost !== undefined ? ' USD' : '')} />
        <UsageMetric icon={DollarSign} label="Total cost" value={displayValue(totalCost, totalCost !== undefined ? ' USD' : '')} />
        <UsageMetric icon={Timer} label="Provider duration" value={displayValue(duration, 's')} />
        <UsageMetric icon={MessageSquare} label="Messages" value={call?.messages?.length || 0} />
        <UsageMetric icon={Gauge} label="End reason" value={displayValue(terminationReason)} />
      </div>
    </div>
  );
}
