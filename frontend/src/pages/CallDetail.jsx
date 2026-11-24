import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Timer, Wallet, CalendarDays, PhoneOff, MessageSquareText, Cpu, Loader2, FileQuestion } from 'lucide-react';
import TranscriptViewer from '../components/TranscriptViewer';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Avatar, EmptyState, PageLoader, RegionChip, StatusPill, formatDateTime, formatDuration, humanize, realMessages } from '../components/ui';

function getProviderTracking(call) {
  if (call.plivoCallUuid) return 'Call UUID: ' + call.plivoCallUuid;
  if (call.plivoTriggerApiId) return 'Trigger API ID: ' + call.plivoTriggerApiId;
  if (call.plivoFlowRunUuid) return 'Flow Run UUID: ' + call.plivoFlowRunUuid;
  if (call.plivoConversationId) return 'Conversation ID: ' + call.plivoConversationId;
  if (call.twilioCallSid) return 'Twilio SID: ' + call.twilioCallSid;
  return 'Provider ID: Unavailable';
}

function formatCallCost(call) {
  if (call.costStatus === 'FETCHED') return `$${Number(call.plivoTotalAmount || 0).toFixed(4)}`;
  if (call.costStatus === 'NOT_BILLED') return 'Not billed';
  if (call.costStatus === 'UNAVAILABLE') return 'Unavailable';
  return 'Pending';
}

function Metric({ icon: Icon, label, value, title }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--fill-03)', border: '1px solid var(--border)' }} title={title}>
      <div className="flex items-center gap-2 eyebrow">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="num text-[18px] font-bold mt-1.5" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

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

  const [ending, setEnding] = useState(false);

  const handleEndCall = async () => {
    try {
      setEnding(true);
      const res = await api.post(`/calls/${id}/end`);
      if (res.success && res.data) {
        setCall(res.data);
      }
    } catch (err) {
      console.error('Failed to end call:', err);
    } finally {
      setEnding(false);
    }
  };

  if (loading) return <PageLoader label="Loading call" />;
  if (!call) {
    return (
      <div className="card">
        <EmptyState
          icon={FileQuestion}
          title="Call not found"
          text="This call record may have been removed."
          action={<Link to="/calls" className="btn btn-secondary btn-sm">Back to calls</Link>}
        />
      </div>
    );
  }

  const isActive = ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'].includes(call.status);
  const name = `${call.lead?.firstName || ''} ${call.lead?.lastName || ''}`.trim() || 'Unknown lead';

  return (
    <div className="space-y-6">
      <Link to="/calls" className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft className="w-4 h-4" /> All calls
      </Link>

      {/* Header */}
      <section className="card card-glow overflow-hidden p-6 md:p-7">
        <div className="orb" style={{ width: 260, height: 260, top: -130, right: -40, background: 'rgba(139,124,246,0.28)' }} />
        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar name={name} size={52} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[24px] font-bold tracking-tight">{name}</h1>
                <StatusPill status={call.status} />
                {call.plivoRegion && <RegionChip region={call.plivoRegion} />}
                <span className="chip">Attempt #{call.attemptNumber}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12.5px] muted">
                <span className="mono">{call.lead?.phone}</span>
                {call.lead?.id && (
                  <Link to={`/leads/${call.lead.id}`} className="hover:underline" style={{ color: 'var(--iris-text)' }}>View lead profile</Link>
                )}
              </div>
              <div className="mono faint mt-1.5 truncate" title={getProviderTracking(call)}>{getProviderTracking(call)}</div>
            </div>
          </div>

          {isActive && (
            <button onClick={handleEndCall} disabled={ending} className="btn btn-danger shrink-0">
              {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
              {ending ? 'Ending call…' : 'End call'}
            </button>
          )}
        </div>

        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <Metric icon={Timer} label="Duration" value={formatDuration(call.duration)} />
          <Metric
            icon={Wallet}
            label="Call cost"
            value={formatCallCost(call)}
            title={call.plivoTotalRate != null ? `Rate: $${call.plivoTotalRate}/min, billed ${call.plivoBilledDuration || 0}s` : undefined}
          />
          <Metric icon={CalendarDays} label="Started" value={formatDateTime(call.createdAt)} />
          <Metric icon={MessageSquareText} label="Messages" value={realMessages(call.messages).length} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="card xl:col-span-2 overflow-hidden">
          <div className="card-header">
            <div>
              <div className="card-title">Conversation</div>
              <div className="card-subtitle">Full transcript between the AI agent and the lead</div>
            </div>
            {isActive && <span className="pill tone-warning"><span className="soundwave"><span /><span /><span /><span /></span> Live</span>}
          </div>
          <div className="p-5 md:p-6">
            <TranscriptViewer messages={call.messages || []} />
          </div>
        </section>

        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Sparkles className="w-4 h-4" /></span>
                AI summary
              </div>
            </div>
            <p className="p-6 text-[13.5px] leading-relaxed muted m-0">
              {call.summary || call.qualificationResult?.summary || 'The summary is generated shortly after the call ends.'}
            </p>
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Cpu className="w-4 h-4" /></span>
                Call details
              </div>
            </div>
            <dl className="p-6 space-y-3.5 text-[13px] m-0">
              {[
                ['Agent', 'VENTA-AGENT'],
                ['Trigger', call.reason?.startsWith('callback_') ? 'Scheduled callback' : humanize(call.reason)],
                ['Messages', realMessages(call.messages).length]
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt className="faint">{k}</dt>
                  <dd className="m-0 font-medium text-right truncate" style={{ color: 'var(--text)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
