import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  DollarSign,
  TrendingUp,
  Copy,
  Check,
  Phone,
  Bot,
  Server,
  Globe,
  ShieldCheck,
  Zap,
  Info,
  Activity,
  RefreshCw
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

const usd = (value, digits = 2) => `$${Number(value || 0).toFixed(digits)}`;

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function ClientCosting() {
  // Actual cost data
  const [range, setRange] = useState('30');
  const [actual, setActual] = useState(null);
  const [actualLoading, setActualLoading] = useState(true);
  const [actualError, setActualError] = useState(null);

  // Calculator state
  const [monthlyCalls, setMonthlyCalls] = useState(500);
  const [avgDurationMins, setAvgDurationMins] = useState(3);
  const [region, setRegion] = useState('in'); // 'in' | 'us'
  const [copied, setCopied] = useState(false);
  const [targetMargin, setTargetMargin] = useState(60);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

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

  // Calculator math
  const totalMinutes = monthlyCalls * avgDurationMins;
  const totalTelephonyMonthly = totalMinutes * telephonyPerMin;
  const totalAiMonthly = totalMinutes * aiPerMin;
  const hosting = Number(hostingMonthlyFixed) || 0;
  const totalRawMonthlyCost = totalTelephonyMonthly + totalAiMonthly + hosting;
  const rawCostPerCall = monthlyCalls > 0 ? totalRawMonthlyCost / monthlyCalls : 0;
  const rawCostPerMin = totalMinutes > 0 ? totalRawMonthlyCost / totalMinutes : 0;
  const clientPricePerCall = rawCostPerCall / (1 - targetMargin / 100);
  const totalClientBillMonthly = clientPricePerCall * monthlyCalls;
  const estimatedMonthlyProfit = totalClientBillMonthly - totalRawMonthlyCost;
  const pct = (part) => (totalRawMonthlyCost > 0 ? ((part / totalRawMonthlyCost) * 100).toFixed(0) : '0');
  const regionLabel = region === 'in' ? 'India (+91)' : 'US / Other';

  const generateProposalText = () => `========================================================
VENTA AI VOICE AGENT - CLIENT COSTING PROPOSAL
========================================================
Estimated Volume: ${monthlyCalls.toLocaleString()} calls / month
Average Call Duration: ${avgDurationMins} minutes (${totalMinutes.toLocaleString()} total voice minutes)
Target Region: ${regionLabel}

1. RAW COST BREAKDOWN (AT COST, USD)
--------------------------------------------------------
- Plivo Telephony: ${usd(totalTelephonyMonthly)}/mo (${usd(telephonyPerMin, 4)}/min)
- AI Voice Agent (speech-to-text, LLM, text-to-speech): ${usd(totalAiMonthly)}/mo (${usd(aiPerMin, 4)}/min)
- Hosting (Backend + PostgreSQL): ${usd(hosting)}/mo

TOTAL RAW OPERATIONAL EXPENSE: ${usd(totalRawMonthlyCost)} / month
TOTAL RAW COST PER CALL: ${usd(rawCostPerCall)} / call

2. RECOMMENDED CLIENT PRICING
--------------------------------------------------------
Option A: Pay-Per-Call (${usd(clientPricePerCall)} / call)
- Total Monthly Estimated Investment: ${usd(totalClientBillMonthly)}
- Net Profit Margin: ${targetMargin}% (${usd(estimatedMonthlyProfit)} monthly profit)

Option B: Monthly All-Inclusive Retainer
- ${usd(totalClientBillMonthly + 150, 0)} / month for ${monthlyCalls} calls (includes $150 management fee)
- Overage Rate: ${usd(clientPricePerCall * 1.1)} per call beyond package
========================================================`;

  const handleCopyProposal = () => {
    navigator.clipboard.writeText(generateProposalText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const totals = actual?.totals;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> REAL COSTS & CLIENT CALCULATOR
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Call Costing & Client Unit Economics
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Actual Plivo charges for every call, plus a calculator that uses your real per-minute rates to price client proposals.
            </p>
          </div>
          <button
            onClick={handleCopyProposal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Proposal Copied!' : 'Copy Client Pitch Proposal'}</span>
          </button>
        </div>
      </div>

      {/* Actual costs */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Actual Costs (USD)
          </h2>
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

        {actualError && (
          <div className="text-sm text-rose-400">{actualError}</div>
        )}

        {!actualError && totals && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
                <span className="text-emerald-400 text-xs font-medium uppercase tracking-wider block">Total Spend</span>
                <div className="text-2xl font-black text-emerald-300 font-mono mt-1">{usd(totals.totalCost)}</div>
                <span className="text-[11px] text-slate-400 font-mono">telephony + AI</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Plivo Telephony</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{usd(totals.telephonyCost)}</div>
                <span className="text-[11px] text-slate-500 font-mono">actual charges</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">AI Agent</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{usd(totals.aiCost)}</div>
                <span className="text-[11px] text-slate-500 font-mono">billed min x configured rate</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Avg / Billed Call</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{usd(totals.avgCostPerBilledCall, 4)}</div>
                <span className="text-[11px] text-slate-500 font-mono">{usd(totals.avgCostPerMinute, 4)} / min</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Calls</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{totals.calls.toLocaleString()}</div>
                <span className="text-[11px] text-slate-500 font-mono">{totals.billedCalls} billed · {totals.billedMinutes} min</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {['IN', 'US'].map(code => {
                const r = actual.byRegion[code];
                return (
                  <div key={code} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{code === 'IN' ? 'India (+91)' : 'US / Other'}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {r.calls} calls · {r.billedMinutes} billed min · AI rate {usd(actual.aiCostPerMin[code], 4)}/min
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-white">{usd(r.totalCost)}</div>
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
                    'AI agent rate is not set yet (AI_COST_PER_MIN_IN / AI_COST_PER_MIN_US), so AI cost shows $0.'}
                </span>
              </div>
            )}
          </>
        )}

        {!actualError && !totals && actualLoading && (
          <div className="text-sm text-slate-500">Loading cost data...</div>
        )}
      </div>

      {/* Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Calculator className="w-5 h-5 text-cyan-400" />
              Volume & Rate Inputs
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

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-purple-400" /> Client Profit Margin Markup
                </label>
                <span className="font-mono font-bold text-purple-400 text-base">{targetMargin}% Margin</span>
              </div>
              <input
                type="range" min="20" max="80" step="5" value={targetMargin}
                onChange={(e) => setTargetMargin(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/80">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Raw Cost / Call</span>
              <div className="text-2xl font-black text-white font-mono mt-1">{usd(rawCostPerCall)}</div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">{usd(rawCostPerMin, 3)} / min</span>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/20">
              <span className="text-cyan-400 text-xs font-medium uppercase tracking-wider block">Total Monthly Cost</span>
              <div className="text-2xl font-black text-cyan-300 font-mono mt-1">{usd(totalRawMonthlyCost)}</div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">{totalMinutes.toLocaleString()} voice mins</span>
            </div>
            <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
              <span className="text-emerald-400 text-xs font-medium uppercase tracking-wider block">Client Billing Quote</span>
              <div className="text-2xl font-black text-emerald-300 font-mono mt-1">{usd(clientPricePerCall)}</div>
              <span className="text-[11px] text-emerald-400/80 font-mono mt-1 block">
                {usd(estimatedMonthlyProfit, 0)} profit/mo ({targetMargin}%)
              </span>
            </div>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Line-Item Cost Breakdown
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

          <div className="glass-panel p-6 rounded-2xl border border-purple-500/20 bg-purple-950/10 space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              Recommended Client Pricing Options to Quote
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-2">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono font-bold">OPTION A: PAY-PER-CALL</span>
                <div className="text-xl font-extrabold text-white font-mono">
                  {usd(clientPricePerCall)} <span className="text-xs font-normal text-slate-400">/ call</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Charge your client per lead call, with a predictable {targetMargin}% margin.
                </p>
              </div>
              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono font-bold">OPTION B: MONTHLY RETAINER</span>
                <div className="text-xl font-extrabold text-white font-mono">
                  {usd(totalClientBillMonthly + 150, 0)} <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Includes {monthlyCalls.toLocaleString()} calls per month + $150 management fee. Overage charged at {usd(clientPricePerCall * 1.1)}/call.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
