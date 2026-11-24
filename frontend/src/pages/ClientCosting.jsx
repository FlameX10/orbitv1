import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  DollarSign,
  Copy,
  Check,
  Phone,
  Bot,
  Server,
  Globe,
  Zap,
  Info,
  TrendingUp,
  RefreshCw,
  User,
  MessageSquare,
  Timer,
  Search
} from 'lucide-react';
import api from '../services/api';

const RANGE_OPTIONS = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' }
];

// Used by the calculator only until real billed minutes exist for a region.
const FALLBACK_TELEPHONY_PER_MIN = { in: 0.02, us: 0.0115 };
const LEAD_PAGE_SIZE = 25;

const usd = (value, digits = 2) => `$${Number(value || 0).toFixed(digits)}`;
const num = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function StatTile({ label, value, accent = false }) {
  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
      <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">{label}</span>
      <div className={`text-xl font-black font-mono mt-1 ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="glass-card p-5 rounded-2xl border border-slate-800">
      <span className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
        <Icon className="w-4 h-4 text-cyan-400" /> {label}
      </span>
      <div className="text-2xl font-black text-white font-mono mt-2">{value}</div>
    </div>
  );
}

export default function ClientCosting() {
  // Actual cost data
  const [range, setRange] = useState('30');
  const [actual, setActual] = useState(null);
  const [actualLoading, setActualLoading] = useState(true);
  const [actualError, setActualError] = useState(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadLimit, setLeadLimit] = useState(LEAD_PAGE_SIZE);
  const [copied, setCopied] = useState(false);

  // Calculator state
  const [monthlyCalls, setMonthlyCalls] = useState(500);
  const [avgDurationMins, setAvgDurationMins] = useState(3);
  const [region, setRegion] = useState('in'); // 'in' | 'us'
  const [telephonyOverride, setTelephonyOverride] = useState('');
  const [aiOverride, setAiOverride] = useState('');
  const [hostingMonthlyFixed, setHostingMonthlyFixed] = useState(20);

  const loadActual = async () => {
    setActualLoading(true);
    setActualError(null);
    try {
      const params = {};
      if (range !== 'all') {
        const from = new Date(Date.now() - parseInt(range, 10) * 24 * 60 * 60 * 1000);
        params.from = toIsoDate(from);
        params.to = toIsoDate(new Date());
      }
      const res = await api.get('/analytics/costs', { params });
      if (res.success) setActual(res.data);
      else setActualError(res.error || 'Could not load cost data');
    } catch (err) {
      setActualError(err.message || 'Could not load cost data');
    } finally {
      setActualLoading(false);
    }
  };

  useEffect(() => {
    loadActual();
    setLeadLimit(LEAD_PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const totals = actual?.totals;
  const rangeLabel = RANGE_OPTIONS.find(o => o.id === range)?.label || '';

  const filteredLeads = useMemo(() => {
    const leads = actual?.byLead || [];
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(l =>
      [l.name, l.phone, l.company].some(v => v && String(v).toLowerCase().includes(q))
    );
  }, [actual, leadSearch]);

  // Real per-minute rates derived from billed calls, per region.
  const actualRates = useMemo(() => {
    const regionData = actual?.byRegion?.[region.toUpperCase()];
    const telephony = regionData && regionData.billedMinutes > 0
      ? regionData.telephonyCost / regionData.billedMinutes
      : null;
    const ai = actual?.aiCostPerMin?.[region.toUpperCase()] ?? 0;
    return { telephony, ai };
  }, [actual, region]);

  const telephonyPerMin = telephonyOverride !== ''
    ? Number(telephonyOverride) || 0
    : (actualRates.telephony ?? FALLBACK_TELEPHONY_PER_MIN[region]);
  const aiPerMin = aiOverride !== '' ? Number(aiOverride) || 0 : actualRates.ai;
  const telephonySource = telephonyOverride !== ''
    ? 'manual'
    : (actualRates.telephony !== null ? 'from your real calls' : 'Plivo list estimate');

  // Calculator math (cost only, no margin or client pricing)
  const totalMinutes = monthlyCalls * avgDurationMins;
  const totalTelephonyMonthly = totalMinutes * telephonyPerMin;
  const totalAiMonthly = totalMinutes * aiPerMin;
  const hosting = Number(hostingMonthlyFixed) || 0;
  const totalRawMonthlyCost = totalTelephonyMonthly + totalAiMonthly + hosting;
  const rawCostPerCall = monthlyCalls > 0 ? totalRawMonthlyCost / monthlyCalls : 0;
  const rawCostPerMin = totalMinutes > 0 ? totalRawMonthlyCost / totalMinutes : 0;
  const pct = (part) => (totalRawMonthlyCost > 0 ? ((part / totalRawMonthlyCost) * 100).toFixed(0) : '0');

  const generateUsageSummary = () => {
    if (!totals) return 'No usage data loaded.';
    const lines = [
      '========================================================',
      `VENTA AI VOICE AGENT - USAGE SUMMARY (${rangeLabel})`,
      '========================================================',
      `Total calls: ${num(totals.calls)}`,
      `Total minutes: ${num(totals.callMinutes, 2)}`,
      `Billed minutes: ${num(totals.billedMinutes, 2)}`,
      `Telephony cost: ${usd(totals.telephonyCost, 4)}`,
      `AI agent cost: ${usd(totals.aiCost, 4)}`,
      `Total cost: ${usd(totals.totalCost, 4)}`,
      `Average minutes / call: ${num(totals.avgMinutesPerCall, 2)}`,
      `Average cost / billed call: ${usd(totals.avgCostPerBilledCall, 4)}`,
      `Billing coverage: ${totals.billingCoverage}%`,
      '',
      'Top leads by cost:',
      ...(actual.byLead || []).slice(0, 10).map(l =>
        `- ${l.name} (${l.phone || 'no phone'}): ${l.calls} calls, ${num(l.callMinutes, 2)} min, ${usd(l.totalCost, 4)}`
      ),
      '========================================================'
    ];
    return lines.join('\n');
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(generateUsageSummary());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> REAL USAGE & COSTS
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Call Costing & Usage
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Real usage totals from completed calls and Plivo billing data.
            </p>
          </div>
          <button
            onClick={handleCopySummary}
            disabled={!totals}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20 shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Summary Copied!' : 'Copy Usage Summary'}</span>
          </button>
        </div>
      </div>

      {/* Overall costing */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Overall System Costing
            </h2>
            <p className="text-sm text-slate-400 mt-1">Actual totals across every call in the selected period (USD).</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {RANGE_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setRange(option.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  range === option.id
                    ? 'border-cyan-500 bg-cyan-950/40 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={loadActual}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${actualLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {actualError && <div className="text-sm text-rose-400">{actualError}</div>}
        {!actualError && !totals && actualLoading && <div className="text-sm text-slate-500">Loading cost data...</div>}

        {!actualError && totals && (
          <>
            <div className="flex justify-end">
              <span className="text-xs font-mono text-slate-400">{totals.billingCoverage}% billing coverage</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatTile label="Total Calls" value={num(totals.calls)} />
              <StatTile label="Total Minutes" value={num(totals.callMinutes, 2)} />
              <StatTile label="Billed Minutes" value={num(totals.billedMinutes, 2)} />
              <StatTile label="Telephony Cost" value={usd(totals.telephonyCost, 4)} />
              <StatTile label="AI Agent Cost" value={usd(totals.aiCost, 4)} />
              <StatTile label="Total Cost" value={usd(totals.totalCost, 4)} accent />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {['IN', 'US'].map(code => {
                const r = actual.byRegion[code];
                return (
                  <div key={code} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{code === 'IN' ? 'India (+91)' : 'US / Other'}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {r.calls} calls · {num(r.billedMinutes, 2)} billed min
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-white">{usd(r.totalCost, 4)}</div>
                      <div className="text-[11px] text-slate-500">{usd(r.avgCostPerMinute, 4)} / min</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(totals.costPending > 0 || totals.costUnavailable > 0 || (actual.aiCostPerMin.IN === 0 && actual.aiCostPerMin.US === 0)) && (
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <Info className="w-4 h-4 shrink-0 text-blue-400" />
                <span>
                  {totals.costPending > 0 && `${totals.costPending} call(s) still waiting for Plivo billing data. `}
                  {totals.costUnavailable > 0 && `${totals.costUnavailable} call(s) have no Plivo billing record. `}
                  {actual.aiCostPerMin.IN === 0 && actual.aiCostPerMin.US === 0 &&
                    'AI agent rate is not configured yet, so AI agent cost shows $0.'}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lead-wise usage */}
      {!actualError && totals && (
        <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Lead-wise Usage
              </h2>
              <p className="text-sm text-slate-400 mt-1">Calls, minutes and costs grouped by lead.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={leadSearch}
                  onChange={(e) => { setLeadSearch(e.target.value); setLeadLimit(LEAD_PAGE_SIZE); }}
                  placeholder="Search name, phone, company"
                  className="pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white w-56"
                />
              </div>
              <span className="text-xs font-mono text-slate-400 whitespace-nowrap">{filteredLeads.length} leads</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b border-slate-800 bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left font-semibold px-6 py-3">Lead</th>
                  <th className="text-right font-semibold px-4 py-3">Calls</th>
                  <th className="text-right font-semibold px-4 py-3">Minutes</th>
                  <th className="text-right font-semibold px-4 py-3">Billed Min</th>
                  <th className="text-right font-semibold px-4 py-3">Telephony</th>
                  <th className="text-right font-semibold px-4 py-3">AI Agent</th>
                  <th className="text-right font-semibold px-6 py-3">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      No call usage recorded for this period.
                    </td>
                  </tr>
                )}
                {filteredLeads.slice(0, leadLimit).map(l => (
                  <tr key={l.leadId || l.name} className="hover:bg-slate-800/30">
                    <td className="px-6 py-3">
                      <div className="font-semibold text-white">{l.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {l.phone || '—'}{l.company ? ` · ${l.company}` : ''} · {l.region}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{l.calls}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{num(l.callMinutes, 2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{num(l.billedMinutes, 2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{usd(l.telephonyCost, 4)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{usd(l.aiCost, 4)}</td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-emerald-300">{usd(l.totalCost, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLeads.length > leadLimit && (
            <div className="p-4 text-center border-t border-slate-800">
              <button
                onClick={() => setLeadLimit(limit => limit + LEAD_PAGE_SIZE)}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Show more ({filteredLeads.length - leadLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {!actualError && totals && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard icon={MessageSquare} label="Calls With Billing Data" value={num(totals.callsWithBilling)} />
          <SummaryCard icon={Timer} label="Average Minutes / Call" value={num(totals.avgMinutesPerCall, 2)} />
          <SummaryCard icon={DollarSign} label="Spend / Billed Call" value={usd(totals.avgCostPerBilledCall, 4)} />
        </div>
      )}

      {/* Cost estimator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Calculator className="w-5 h-5 text-cyan-400" />
              Cost Estimator
            </h2>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium">Estimated Monthly Leads / Calls</label>
                <span className="font-mono font-bold text-cyan-400 text-base">{monthlyCalls.toLocaleString()} calls</span>
              </div>
              <input
                type="range" min="50" max="10000" step="50" value={monthlyCalls}
                onChange={(e) => setMonthlyCalls(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium">Average Call Duration</label>
                <span className="font-mono font-bold text-emerald-400 text-base">{avgDurationMins} minutes</span>
              </div>
              <input
                type="range" min="1" max="10" step="1" value={avgDurationMins}
                onChange={(e) => setAvgDurationMins(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-slate-300 font-medium text-sm flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-400" /> Destination Calling Region
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'in', label: 'India (+91)' }, { id: 'us', label: 'US / Other' }].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setRegion(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      region === item.id
                        ? 'border-cyan-500 bg-cyan-950/40 text-white shadow-md shadow-cyan-500/10'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white">{item.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-slate-300 text-xs font-medium block">Telephony $/min</span>
                <input
                  type="number" min="0" step="0.0001"
                  value={telephonyOverride !== '' ? telephonyOverride : Number(telephonyPerMin.toFixed(4))}
                  onChange={(e) => setTelephonyOverride(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
                <span className="text-[11px] text-slate-500 block">{telephonySource}</span>
              </label>
              <label className="space-y-1">
                <span className="text-slate-300 text-xs font-medium block">AI agent $/min</span>
                <input
                  type="number" min="0" step="0.0001"
                  value={aiOverride !== '' ? aiOverride : aiPerMin}
                  onChange={(e) => setAiOverride(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
                <span className="text-[11px] text-slate-500 block">{aiOverride !== '' ? 'manual' : 'configured rate'}</span>
              </label>
              <label className="space-y-1">
                <span className="text-slate-300 text-xs font-medium block">Hosting $/month</span>
                <input
                  type="number" min="0" step="1"
                  value={hostingMonthlyFixed}
                  onChange={(e) => setHostingMonthlyFixed(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
                <span className="text-[11px] text-slate-500 block">Render + database</span>
              </label>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/80">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Estimated Cost / Call</span>
              <div className="text-2xl font-black text-white font-mono mt-1">{usd(rawCostPerCall, 4)}</div>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/80">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Estimated Cost / Min</span>
              <div className="text-2xl font-black text-white font-mono mt-1">{usd(rawCostPerMin, 4)}</div>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/20">
              <span className="text-cyan-400 text-xs font-medium uppercase tracking-wider block">Estimated Monthly Cost</span>
              <div className="text-2xl font-black text-cyan-300 font-mono mt-1">{usd(totalRawMonthlyCost)}</div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">{totalMinutes.toLocaleString()} voice mins</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Estimated Monthly Breakdown
              </h3>
              <span className="text-xs font-mono text-slate-400">Monthly Expense</span>
            </div>
            <div className="divide-y divide-slate-800 text-sm">
              {[
                { icon: Phone, iconClass: 'bg-red-500/10 border-red-500/20 text-red-400', title: 'Plivo Telephony', sub: `Outbound voice (${usd(telephonyPerMin, 4)}/min, ${telephonySource})`, value: totalTelephonyMonthly },
                { icon: Bot, iconClass: 'bg-purple-500/10 border-purple-500/20 text-purple-400', title: 'AI Voice Agent', sub: `Speech-to-text, LLM and text-to-speech (${usd(aiPerMin, 4)}/min)`, value: totalAiMonthly },
                { icon: Server, iconClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', title: 'Hosting', sub: 'Backend, queue worker and PostgreSQL (fixed monthly)', value: hosting }
              ].map(({ icon: Icon, iconClass, title, sub, value }) => (
                <div key={title} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${iconClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{title}</div>
                      <div className="text-xs text-slate-400">{sub}</div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="font-bold text-white">{usd(value)}</div>
                    <div className="text-[11px] text-slate-500">{pct(value)}% of total</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
