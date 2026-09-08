import React, { useEffect, useState } from 'react';
import { 
  Users, 
  PhoneCall, 
  CheckCircle2, 
  CalendarClock, 
  Percent, 
  Clock, 
  Flame, 
  ChevronRight,
  Zap,
  Phone
} from 'lucide-react';
import StatCard from '../components/StatCard';
import QualificationBadge from '../components/QualificationBadge';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const { lastEvent } = useSocket();

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
    return (
      <div className="flex items-center justify-center h-64 text-cyan-400 font-mono">
        Loading Voice Agent Operational Telemetry...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Autonomous Voice Lead Qualification
          </h1>
          <p className="text-sm text-slate-400">
            Real-time telemetry, concurrent call queue, and BANT qualification engine
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg glass-panel border border-slate-800 text-slate-400">
          <Zap className="w-4 h-4 text-cyan-400 fill-current" />
          <span>Max Concurrent Calls: <strong className="text-white">10</strong></span>
        </div>
      </div>

      {/* Overview Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Leads Ingested"
          value={overview?.totalLeads || 0}
          subtext="Automatic website lead detection"
          icon={Users}
          color="cyan"
        />
        <StatCard
          title="Qualified Customers"
          value={overview?.qualifiedLeads || 0}
          subtext={`Conversion Rate: ${overview?.conversionRate || 0}%`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Scheduled Callbacks"
          value={overview?.callbacksCount || 0}
          subtext="PostgreSQL Job Queue Scheduled"
          icon={CalendarClock}
          color="amber"
        />
        <StatCard
          title="Avg Call Duration"
          value={`${overview?.avgDuration || 0}s`}
          subtext={`Connection Rate: ${overview?.connectionRate || 0}%`}
          icon={Clock}
          color="purple"
        />
      </div>

      {/* Active Calls Live Feed Banner */}
      <div className="glass-panel rounded-2xl border border-cyan-500/30 p-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Active Call Telemetry ({activeCalls.length})
            </h2>
          </div>
          <span className="text-xs font-mono text-cyan-400">Streaming Live WebSockets</span>
        </div>

        {activeCalls.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
            No calls currently active. Use "Simulate Website Lead" in top right to trigger a live call job.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCalls.map((call) => (
              <div key={call.id} className="glass-card p-4 rounded-xl border border-cyan-500/40 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-cyan-300 font-bold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 animate-bounce" />
                    {call.lead?.phone}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700 text-cyan-300">
                    {call.status}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white mb-1">
                  {call.lead?.firstName} {call.lead?.lastName} ({call.lead?.company || 'Lead'})
                </div>
                <p className="text-xs text-slate-400 italic line-clamp-2">
                  "{call.messages[0]?.content || 'Conversing with ElevenLabs AI Agent...'}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Leads Ingested Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Website Leads</h2>
            <p className="text-xs text-slate-400">Latest form submissions processed by Postgres job queue</p>
          </div>
          <Link
            to="/leads"
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            View All CRM Leads <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="p-3">Lead Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Company</th>
                <th className="p-3">Status</th>
                <th className="p-3">Score</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recentLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 font-semibold text-white">
                    {lead.firstName} {lead.lastName}
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-300">{lead.phone}</td>
                  <td className="p-3 text-slate-400">{lead.company || '--'}</td>
                  <td className="p-3">
                    <QualificationBadge status={lead.status} />
                  </td>
                  <td className="p-3 font-mono font-bold text-cyan-400">
                    {lead.qualificationScore || 0}/100
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/leads/${lead.id}`}
                      className="text-xs font-semibold text-cyan-400 hover:underline"
                    >
                      View Details & Transcript
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
