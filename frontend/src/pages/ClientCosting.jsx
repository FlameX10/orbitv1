import React, { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Copy,
  Check,
  Info,
  TrendingUp,
  RefreshCw,
  Users,
  MessageSquare,
  Timer,
  Search,
  Phone,
  Bot,
  Wallet
} from 'lucide-react';
import api from '../services/api';
import { Avatar, CountUp, EmptyState, PageHeader, RegionChip } from '../components/ui';

const RANGE_OPTIONS = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' }
];

const LEAD_PAGE_SIZE = 25;

const usd = (value, digits = 2) => `$${Number(value || 0).toFixed(digits)}`;
const num = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function StatTile({ label, value, decimals = 0, prefix = '', accent = false, icon: Icon }) {
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: accent ? 'linear-gradient(140deg, rgba(139,124,246,0.16), rgba(232,196,124,0.06))' : 'var(--fill-03)',
        border: `1px solid ${accent ? 'rgba(139,124,246,0.3)' : 'var(--border)'}`
      }}
    >
      <div className="flex items-center gap-1.5 eyebrow">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</div>
      <div className="text-[22px] font-bold mt-1.5" style={{ color: accent ? 'var(--text-strong)' : 'var(--text)' }}>
        <CountUp value={value} decimals={decimals} prefix={prefix} />
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, decimals = 0, prefix = '', hint }) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="icon-tile" style={{ width: 32, height: 32, borderRadius: 10 }}><Icon className="w-4 h-4" /></span>
      </div>
      <div className="text-[28px] font-bold mt-2" style={{ color: 'var(--text)' }}>
        <CountUp value={value} decimals={decimals} prefix={prefix} />
      </div>
      {hint && <div className="text-[12px] faint mt-1">{hint}</div>}
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

  const generateUsageSummary = () => {
    if (!totals) return 'No usage data loaded.';
    const lines = [
      '========================================================',
      `ORBIT AI VOICE AGENT · SANKALP — USAGE SUMMARY (${rangeLabel})`,
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

  const coverage = Number(totals?.billingCoverage || 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Insights"
        title="Usage & Costs"
        subtitle="Real usage from completed calls, billed by Plivo — per call, per lead and in total."
        actions={
          <>
            <div className="segmented" role="tablist" aria-label="Date range">
              {RANGE_OPTIONS.map(option => (
                <button key={option.id} type="button" data-active={range === option.id} onClick={() => setRange(option.id)}>
                  {option.label}
                </button>
              ))}
            </div>
            <button onClick={loadActual} className="btn btn-secondary btn-icon" title="Refresh" aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${actualLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleCopySummary} disabled={!totals} className="btn btn-primary">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy summary'}
            </button>
          </>
        }
      />

      {actualError && (
        <div className="card p-5 flex items-center gap-3" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
          <Info className="w-5 h-5" style={{ color: 'var(--danger)' }} />
          <span className="text-[13.5px]" style={{ color: 'var(--text)' }}>{actualError}</span>
        </div>
      )}

      {!actualError && !totals && actualLoading && (
        <div className="space-y-5">
          <div className="skeleton h-52" style={{ borderRadius: 20 }} />
          <div className="skeleton h-80" style={{ borderRadius: 20 }} />
        </div>
      )}

      {!actualError && totals && (
        <>
          {/* Overall */}
          <section className="card card-glow overflow-hidden">
            <div className="orb" style={{ width: 320, height: 320, top: -170, right: -80, background: 'rgba(232,196,124,0.14)' }} />
            <div className="card-header relative">
              <div>
                <div className="card-title">
                  <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><TrendingUp className="w-4 h-4" /></span>
                  Overall usage
                </div>
                <div className="card-subtitle">{rangeLabel} · all amounts in USD</div>
              </div>
              <div className="text-right min-w-[150px]">
                <div className="flex items-center justify-end gap-2 text-[12px] faint mb-1.5">
                  Billing coverage <span className="num font-semibold" style={{ color: 'var(--text)' }}>{coverage}%</span>
                </div>
                <div className="progress-track"><div className="progress-bar" style={{ width: `${coverage}%` }} /></div>
              </div>
            </div>

            <div className="relative p-5 md:p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatTile label="Total calls" value={totals.calls} icon={Phone} />
              <StatTile label="Total minutes" value={totals.callMinutes} decimals={2} icon={Timer} />
              <StatTile label="Billed minutes" value={totals.billedMinutes} decimals={2} icon={Timer} />
              <StatTile label="Telephony" value={totals.telephonyCost} decimals={4} prefix="$" icon={Phone} />
              <StatTile label="AI agent" value={totals.aiCost} decimals={4} prefix="$" icon={Bot} />
              <StatTile label="Total cost" value={totals.totalCost} decimals={4} prefix="$" icon={Wallet} accent />
            </div>

            <div className="relative px-5 md:px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {['IN', 'US'].map(code => {
                const r = actual.byRegion[code];
                return (
                  <div key={code} className="flex items-center justify-between rounded-2xl px-4 py-3.5" style={{ background: 'var(--fill-025)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <RegionChip region={code} />
                      <div>
                        <div className="font-semibold text-[13.5px]" style={{ color: 'var(--text)' }}>{code === 'IN' ? 'India' : 'US & other'}</div>
                        <div className="text-[12px] faint">{r.calls} calls · {num(r.billedMinutes, 2)} billed min</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num font-bold" style={{ color: 'var(--text)' }}>{usd(r.totalCost, 4)}</div>
                      <div className="text-[11.5px] faint">{usd(r.avgCostPerMinute, 4)} / min</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(totals.costPending > 0 || totals.costUnavailable > 0 || (actual.aiCostPerMin.IN === 0 && actual.aiCostPerMin.US === 0)) && (
              <div className="relative flex items-start gap-2.5 text-[12.5px] muted px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                <span>
                  {totals.costPending > 0 && `${totals.costPending} call(s) still waiting for Plivo billing data. `}
                  {totals.costUnavailable > 0 && `${totals.costUnavailable} call(s) have no Plivo billing record. `}
                  {actual.aiCostPerMin.IN === 0 && actual.aiCostPerMin.US === 0 &&
                    'AI agent rate is not configured yet, so AI agent cost shows $0.'}
                </span>
              </div>
            )}
          </section>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger">
            <div style={{ '--i': 0 }}><SummaryCard icon={MessageSquare} label="Calls with billing data" value={totals.callsWithBilling} hint={`of ${num(totals.calls)} calls`} /></div>
            <div style={{ '--i': 1 }}><SummaryCard icon={Timer} label="Average minutes / call" value={totals.avgMinutesPerCall} decimals={2} hint="Connected time per call" /></div>
            <div style={{ '--i': 2 }}><SummaryCard icon={DollarSign} label="Spend / billed call" value={totals.avgCostPerBilledCall} decimals={4} prefix="$" hint={`${usd(totals.avgCostPerMinute, 4)} per billed minute`} /></div>
          </div>

          {/* Lead-wise usage */}
          <section className="card overflow-hidden">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Users className="w-4 h-4" /></span>
                  Lead-wise usage
                </div>
                <div className="card-subtitle">Calls, minutes and costs for each lead</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative hidden sm:block">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                  <input
                    value={leadSearch}
                    onChange={(e) => { setLeadSearch(e.target.value); setLeadLimit(LEAD_PAGE_SIZE); }}
                    placeholder="Search name, phone, company"
                    className="input input-icon w-64"
                    style={{ height: 38 }}
                    aria-label="Search leads"
                  />
                </div>
                <span className="pill tone-neutral num">{filteredLeads.length} leads</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right">Minutes</th>
                    <th className="text-right">Billed min</th>
                    <th className="text-right">Telephony</th>
                    <th className="text-right">AI agent</th>
                    <th className="text-right">Total cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState icon={Users} title="No usage in this period" text="Calls made in the selected range will appear here." />
                      </td>
                    </tr>
                  )}
                  {filteredLeads.slice(0, leadLimit).map(l => (
                    <tr key={l.leadId || l.name}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={l.name} />
                          <div className="min-w-0">
                            <div className="cell-strong truncate">{l.name}</div>
                            <div className="text-[12px] faint truncate">
                              <span className="mono">{l.phone || '—'}</span>{l.company ? ` · ${l.company}` : ''}
                            </div>
                          </div>
                          <RegionChip region={l.region} />
                        </div>
                      </td>
                      <td className="text-right num" style={{ color: 'var(--text)' }}>{l.calls}</td>
                      <td className="text-right num">{num(l.callMinutes, 2)}</td>
                      <td className="text-right num">{num(l.billedMinutes, 2)}</td>
                      <td className="text-right num">{usd(l.telephonyCost, 4)}</td>
                      <td className="text-right num">{usd(l.aiCost, 4)}</td>
                      <td className="text-right num font-bold" style={{ color: 'var(--gold)' }}>{usd(l.totalCost, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLeads.length > leadLimit && (
              <div className="p-4 text-center" style={{ borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setLeadLimit(limit => limit + LEAD_PAGE_SIZE)} className="btn btn-ghost btn-sm">
                  Show more ({filteredLeads.length - leadLimit} remaining)
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
