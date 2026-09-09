import React, { useEffect, useState } from 'react';
import { Check, Copy, DollarSign, MessageSquare, Timer, TrendingUp, UserRound, Zap } from 'lucide-react';
import api from '../services/api';

const money = (value) => `$${Number(value || 0).toFixed(4)}`;

export default function ClientCosting() {
  const [actual, setActual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/analytics/costing/actual')
      .then((response) => {
        if (response.success) setActual(response.data);
      })
      .catch((error) => console.error('Failed to load actual costing:', error))
      .finally(() => setLoading(false));
  }, []);

  const copySummary = () => {
    navigator.clipboard.writeText(
      `Vedron Voice actual usage: ${actual?.calls || 0} calls, ${actual?.minutes || 0} minutes, ${actual?.elevenLabsCredits || 0} ElevenLabs credits, ${money(actual?.providerCost)} provider cost.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-semibold font-mono">
              <Zap className="w-3 h-3" /> LIVE CLIENT USAGE & COSTING
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">API Costing & Client Unit Economics</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">Real usage totals from completed CRM calls and ElevenLabs billing metadata.</p>
          </div>
          <button onClick={copySummary} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 shrink-0">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Usage Copied' : 'Copy Usage Summary'}
          </button>
        </div>
      </div>

      <section className="glass-panel p-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm"><TrendingUp className="w-4 h-4" /> Overall System Costing</div>
            <p className="text-xs text-slate-400 mt-1">Actual totals across every call with recorded duration.</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{loading ? 'Loading...' : `${actual?.dataCoverage || 0}% billing coverage`}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Total calls" value={actual?.calls || 0} />
          <Metric label="Total minutes" value={actual?.minutes || 0} />
          <Metric label="ElevenLabs credits" value={actual?.elevenLabsCredits || 0} />
          <Metric label="ElevenLabs cost" value={money(actual?.elevenLabsCost)} />
          <Metric label="LLM cost" value={money(actual?.llmCost)} />
          <Metric label="Total provider cost" value={money(actual?.providerCost)} accent />
        </div>
      </section>

      <section className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><UserRound className="w-5 h-5 text-cyan-400" /> User-wise Usage</h2>
            <p className="text-xs text-slate-400 mt-1">Calls, minutes, credits, and provider costs grouped by CRM user.</p>
          </div>
          <span className="text-xs font-mono text-slate-500">{actual?.users?.length || 0} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3.5 min-w-64">User</th><th className="px-4 py-3.5 whitespace-nowrap">Calls</th><th className="px-4 py-3.5 whitespace-nowrap">Minutes</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Credits</th><th className="px-4 py-3.5 whitespace-nowrap">LLM cost</th><th className="px-6 py-3.5 text-right whitespace-nowrap">Total provider cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(actual?.users || []).map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-3.5"><div className="font-semibold text-white truncate max-w-64">{user.name || 'Unnamed user'}</div><div className="text-[11px] text-slate-500 truncate max-w-64">{user.company || user.email || user.id}</div></td>
                  <td className="px-4 py-3.5 font-mono text-slate-200">{user.calls}</td>
                  <td className="px-4 py-3.5 font-mono text-slate-200">{user.minutes}</td>
                  <td className="px-4 py-3.5 font-mono text-cyan-300">{user.elevenLabsCredits}</td>
                  <td className="px-4 py-3.5 font-mono text-slate-200">{money(user.llmCost)}</td>
                  <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-300">{money(user.providerCost)}</td>
                </tr>
              ))}
              {!loading && !(actual?.users || []).length && <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500">No completed call usage recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Calls with billing data" value={actual?.configuredCostCalls || 0} icon={MessageSquare} />
        <Metric label="Average minutes / call" value={actual?.calls ? (actual.minutes / actual.calls).toFixed(2) : '0.00'} icon={Timer} />
        <Metric label="Provider spend / call" value={actual?.calls ? money(actual.providerCost / actual.calls) : '$0.0000'} icon={DollarSign} accent />
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, accent = false }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">{Icon && <Icon className="w-3.5 h-3.5 text-cyan-400" />}{label}</div><div className={`mt-1 text-lg font-black font-mono ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div></div>;
}