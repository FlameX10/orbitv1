import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle2, Coins, DollarSign, Gauge, MessageSquare, Timer } from 'lucide-react';
import TranscriptViewer from '../components/TranscriptViewer';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

export default function CallDetail() {
  const { id } = useParams();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const { lastEvent } = useSocket();

  useEffect(() => {
    async function loadCall() {
      try {
        const res = await api.get(`/calls/${id}`);
        if (res.success) {
          setCall(res.data);
        }
      } catch (err) {
        console.error('Failed to load call detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCall();
  }, [id]);

  useEffect(() => {
    if (!lastEvent || !['transcript_update', 'call_status_change'].includes(lastEvent.name)) return;
    if (lastEvent.data?.callAttemptId && lastEvent.data.callAttemptId !== id) return;

    api.get(`/calls/${id}`)
      .then((res) => {
        if (res.success) setCall(res.data);
      })
      .catch((err) => console.error('Failed to refresh call detail:', err));
  }, [id, lastEvent]);

  if (loading) return <div className="p-8 text-cyan-400 font-mono">Loading call record...</div>;
  if (!call) return <div className="p-8 text-rose-400">Call record not found.</div>;

  const provider = call.elevenLabsMetadata || {};
  const providerMetadata = provider.metadata || {};
  const providerAnalysis = provider.analysis || {};
  const charging = provider.charging || providerMetadata.charging || {};
  const providerSummary = call.summary || providerAnalysis.transcript_summary || providerAnalysis.summary;
  const credits = providerMetadata.cost ?? providerMetadata.credits;
  const llmCredits = charging.llm_charge ?? providerMetadata.llm_charge ?? providerMetadata.llm_credits;
  const llmCost = charging.llm_price ?? providerMetadata.llm_price;
  const totalCost = providerMetadata.cost_fiat ?? providerMetadata.cost_usd ?? providerMetadata.total_cost_usd;
  const providerDuration = providerMetadata.call_duration_secs ?? call.duration;
  const terminationReason = provider.terminationReason || providerMetadata.termination_reason || providerMetadata.terminationReason;

  const formatValue = (value, suffix = '') => value === null || value === undefined || value === '' ? 'Not available' : `${value}${suffix}`;

  return (
    <div className="space-y-6">
      <Link to="/calls" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400">
        <ArrowLeft className="w-4 h-4" /> Back to Call Logs
      </Link>

      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-3">
            Call Attempt #{call.attemptNumber}
            <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-cyan-950 border border-cyan-800 text-cyan-300">
              {call.status}
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Lead: {call.lead?.firstName} {call.lead?.lastName} ({call.lead?.phone}) | SID: {call.twilioCallSid || 'CA_MOCK'}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
          <div>Duration: <strong className="text-white">{call.duration || 0}s</strong></div>
          <div>Started: <strong className="text-white">{new Date(call.createdAt).toLocaleString()}</strong></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800">
          <h2 className="text-lg font-bold text-white mb-4">Complete Call Transcript</h2>
          <TranscriptViewer messages={call.messages || []} />
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              AI Call Summary
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {providerSummary || call.qualificationResult?.summary || 'No summary generated yet.'}
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">ElevenLabs Usage</h3>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Provider data</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <UsageMetric icon={Coins} label="Credits" value={formatValue(credits)} />
              <UsageMetric icon={Coins} label="LLM credits" value={formatValue(llmCredits)} />
              <UsageMetric icon={DollarSign} label="LLM cost" value={formatValue(llmCost, llmCost !== undefined ? ' USD' : '')} />
              <UsageMetric icon={DollarSign} label="Total cost" value={formatValue(totalCost, totalCost !== undefined ? ' USD' : '')} />
              <UsageMetric icon={Timer} label="Provider duration" value={formatValue(providerDuration, 's')} />
              <UsageMetric icon={MessageSquare} label="Messages" value={call.messages?.length || 0} />
              <UsageMetric icon={Gauge} label="End reason" value={formatValue(terminationReason)} />
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 text-xs space-y-2">
            <h3 className="text-sm font-bold text-white mb-2">Technical Telemetry</h3>
            <div className="flex justify-between border-b border-slate-800/80 py-1">
              <span className="text-slate-400">Agent Persona:</span>
              <span className="text-slate-200 font-semibold">{call.agent?.name || 'Default Rep'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 py-1">
              <span className="text-slate-400">Trigger Reason:</span>
              <span className="text-cyan-400 font-mono">{call.reason}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Messages Exchanged:</span>
              <span className="text-white font-bold">{call.messages?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
