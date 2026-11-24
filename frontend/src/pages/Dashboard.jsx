import React, { useEffect, useState } from 'react';
import {
  Users,
  CheckCircle2,
  CalendarClock,
  Clock,
  ArrowUpRight,
  PhoneCall,
  Radio,
  Sparkles,
  Gauge
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import QualificationBadge from '../components/QualificationBadge';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Avatar, CountUp, EmptyState, PageLoader, StatusPill, formatDuration, timeAgo } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function MetricBar({ label, value, hint }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[13px] muted">{label}</span>
        <span className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
          <CountUp value={pct} decimals={1} suffix="%" />
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      {hint && <div className="text-[11.5px] faint mt-1.5">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const { lastEvent } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      const [overviewRes, activeRes, leadsRes] = await Promise.all([
        api.get('/analytics/overview'),
        api.get('/calls/active'),
        api.get('/leads?limit=6')
      ]);

      if (overviewRes.success) setOverview(overviewRes.data);
      if (activeRes.success) setActiveCalls(activeRes.data);
      if (leadsRes.success) setRecentLeads(leadsRes.leads);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Real-time update trigger when Socket.IO receives events
  useEffect(() => {
    if (lastEvent) {
      fetchDashboardData();
    }
  }, [lastEvent]);

  if (loading && !overview) {
    return <PageLoader label="Loading overview" />;
  }

  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="space-y-7">
      {/* Hero */}
      <section className="card card-glow overflow-hidden px-7 py-7 md:px-9 md:py-8">
        <div className="orb" style={{ width: 340, height: 340, top: -140, right: -60, background: 'rgba(139,124,246,0.35)' }} />
        <div className="orb" style={{ width: 260, height: 260, bottom: -150, right: 260, background: 'rgba(45,212,191,0.16)', animationDelay: '-6s' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-7">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="pill tone-iris"><Sparkles className="w-3.5 h-3.5" /> AI Voice Agent</span>
              <span className="pill tone-neutral">
                <span className={`live-dot ${activeCalls.length ? 'live-dot-iris' : ''}`} style={{ width: 6, height: 6 }} />
                {activeCalls.length ? `${activeCalls.length} live now` : 'Standing by'}
              </span>
            </div>
            <h1 className="text-[30px] md:text-[36px] font-bold tracking-tight leading-[1.1]">
              <span className="text-gradient">{greeting()}{firstName ? `, ${firstName}` : ''}.</span>
            </h1>
            <p className="page-subtitle text-[15px]">
              Your AI agent is qualifying website leads around the clock — calling within seconds, speaking English and Hindi, and handing your sales team ready-to-close conversations.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0 w-full lg:w-auto">
            {[
              { label: 'Calls placed', value: overview?.totalCalls || 0 },
              { label: 'Connected', value: overview?.connectedCalls || 0 },
              { label: 'Live now', value: overview?.activeCallsCount || 0 }
            ].map(item => (
              <div key={item.label} className="rounded-2xl px-3 sm:px-4 py-3.5 min-w-0 sm:min-w-[104px]" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid var(--border)' }}>
                <div className="text-[22px] sm:text-[24px] font-bold" style={{ color: 'var(--text)' }}><CountUp value={item.value} /></div>
                <div className="text-[11px] sm:text-[11.5px] faint mt-0.5 truncate">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 stagger">
        <StatCard
          style={{ '--i': 0 }}
          title="Leads captured"
          value={overview?.totalLeads || 0}
          subtext="Website enquiries received"
          icon={Users}
          color="iris"
        />
        <StatCard
          style={{ '--i': 1 }}
          title="Qualified"
          value={overview?.qualifiedLeads || 0}
          subtext={`${overview?.conversionRate || 0}% conversion rate`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          style={{ '--i': 2 }}
          title="Callbacks scheduled"
          value={overview?.callbacksCount || 0}
          subtext="Follow-ups queued by the agent"
          icon={CalendarClock}
          color="amber"
        />
        <StatCard
          style={{ '--i': 3 }}
          title="Avg. call duration"
          value={formatDuration(overview?.avgDuration || 0)}
          subtext={`${overview?.connectionRate || 0}% connection rate`}
          icon={Clock}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Live calls */}
        <section className="card xl:col-span-2 overflow-hidden">
          <div className="card-header">
            <div>
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Radio className="w-4 h-4" /></span>
                Live conversations
              </div>
              <div className="card-subtitle">Calls happening right now, updated in real time</div>
            </div>
            <span className="pill tone-iris num">{activeCalls.length} active</span>
          </div>

          {activeCalls.length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              title="No live calls right now"
              text="When a new lead arrives, the agent dials within seconds and the conversation appears here."
              action={<Link to="/test-call" className="btn btn-secondary btn-sm">Start a test call</Link>}
            />
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
              {activeCalls.map((call, index) => {
                const name = `${call.lead?.firstName || ''} ${call.lead?.lastName || ''}`.trim() || 'Lead';
                return (
                  <button
                    key={call.id}
                    onClick={() => navigate(`/calls/${call.id}`)}
                    className="card card-hover text-left p-4"
                    style={{ '--i': index, background: 'rgba(139,124,246,0.06)', borderColor: 'rgba(139,124,246,0.22)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={name} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</div>
                          <div className="mono faint truncate">{call.lead?.phone}</div>
                        </div>
                      </div>
                      <StatusPill status={call.status} />
                    </div>
                    <p className="text-[12.5px] muted mt-3 line-clamp-2 italic">
                      “{call.messages[0]?.content || 'Conversation in progress…'}”
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Performance */}
        <section className="card overflow-hidden">
          <div className="card-header">
            <div>
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Gauge className="w-4 h-4" /></span>
                Performance
              </div>
              <div className="card-subtitle">How calls are converting</div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <MetricBar
              label="Connection rate"
              value={overview?.connectionRate}
              hint={`${overview?.connectedCalls || 0} of ${overview?.totalCalls || 0} calls connected`}
            />
            <MetricBar
              label="Qualification rate"
              value={overview?.conversionRate}
              hint={`${overview?.qualifiedLeads || 0} of ${overview?.totalLeads || 0} leads qualified`}
            />
            <div className="divider" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="eyebrow">Not qualified</div>
                <div className="text-[22px] font-bold mt-1" style={{ color: 'var(--text)' }}><CountUp value={overview?.notQualifiedLeads || 0} /></div>
              </div>
              <div>
                <div className="eyebrow">Unreached</div>
                <div className="text-[22px] font-bold mt-1" style={{ color: 'var(--text)' }}><CountUp value={overview?.failedCalls || 0} /></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Recent leads */}
      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <div className="card-title">Recent leads</div>
            <div className="card-subtitle">Latest website enquiries and where each one stands</div>
          </div>
          <Link to="/leads" className="btn btn-ghost btn-sm">
            View all <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentLeads.length === 0 ? (
          <EmptyState icon={Users} title="No leads yet" text="New website enquiries will appear here the moment they arrive." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Phone</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => {
                  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
                  return (
                    <tr key={lead.id} className="row-link" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div>
                            <div className="cell-strong">{name}</div>
                            <div className="text-[12px] faint">{lead.email || 'No email'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{lead.phone}</td>
                      <td>{lead.company || '—'}</td>
                      <td><QualificationBadge status={lead.status} score={lead.qualificationScore} /></td>
                      <td className="text-[12.5px] faint whitespace-nowrap">{timeAgo(lead.createdAt)}</td>
                      <td className="text-right">
                        <Link to={`/leads/${lead.id}`} onClick={e => e.stopPropagation()} className="btn btn-ghost btn-sm">
                          Open <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
