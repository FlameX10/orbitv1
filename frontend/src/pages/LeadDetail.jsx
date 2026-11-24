import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Building2, Mail, MessageSquareText, Target, Wallet, UserCheck, CalendarRange, Sparkles, History, FileQuestion, Loader2, ClipboardList } from 'lucide-react';
import QualificationBadge from '../components/QualificationBadge';
import TranscriptViewer from '../components/TranscriptViewer';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, PageLoader, StatusPill, formatDateTime, formatDuration, humanize } from '../components/ui';

// Answers the AI agent saved during the call (lead.metadata), shown when present.
const ANSWER_FIELDS = [
  ['business_status', 'Business status'],
  ['current_platform', 'Current platform'],
  ['products_services', 'Products / services'],
  ['target_market', 'Target market'],
  ['launch_timeline', 'Launch timeline'],
  ['compensation_plan', 'Compensation plan'],
  ['additional_notes', 'Notes for consultant'],
  ['callback_day', 'Preferred contact day'],
  ['callback_time', 'Preferred contact time']
];

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [callLoading, setCallLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function loadLead() {
      try {
        const res = await api.get(`/leads/${id}`);
        if (res.success) {
          setLead(res.data);
          if (res.data.callAttempts && res.data.callAttempts.length > 0) {
            setSelectedAttempt(res.data.callAttempts[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load lead:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLead();
  }, [id]);

  useEffect(() => {
    if (!selectedAttempt?.id) {
      setSelectedCall(null);
      return undefined;
    }

    let cancelled = false;
    setCallLoading(true);
    api.get(`/calls/${selectedAttempt.id}`)
      .then((res) => {
        if (!cancelled && res.success) setSelectedCall(res.data);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load call conversation:', err);
      })
      .finally(() => {
        if (!cancelled) setCallLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAttempt?.id]);

  const triggerCall = async () => {
    setTriggering(true);
    try {
      await api.post('/calls/trigger', { leadId: lead.id });
      toast({ type: 'success', title: 'Call started', message: 'The AI agent is dialing this lead now.' });
    } catch (err) {
      toast({ type: 'error', title: 'Could not start the call', message: err.message });
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading lead" />;
  }

  if (!lead) {
    return (
      <div className="card">
        <EmptyState
          icon={FileQuestion}
          title="Lead not found"
          text="This lead may have been removed."
          action={<Link to="/leads" className="btn btn-secondary btn-sm">Back to leads</Link>}
        />
      </div>
    );
  }

  const qual = lead.qualificationResult;
  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
  const answers = ANSWER_FIELDS.filter(([key]) => {
    const v = lead.metadata?.[key];
    return v !== undefined && v !== null && String(v).trim() !== '' && !String(v).startsWith('{{');
  });
  const selectedDuration = selectedCall?.duration ?? selectedAttempt?.duration;

  return (
    <div className="space-y-6">
      <Link to="/leads" className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft className="w-4 h-4" /> All leads
      </Link>

      {/* Profile header */}
      <section className="card card-glow overflow-hidden p-6 md:p-7">
        <div className="orb" style={{ width: 280, height: 280, top: -140, right: -60, background: 'rgba(139,124,246,0.28)' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar name={name} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[26px] font-bold tracking-tight">{name}</h1>
                <QualificationBadge status={lead.status} score={lead.qualificationScore} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-[13px] muted">
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 faint" /> <span className="mono">{lead.phone}</span></span>
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 faint" /> {lead.email || 'No email'}</span>
                <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 faint" /> {lead.company || 'No company'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={triggerCall}
            disabled={lead.status === 'DO_NOT_CALL' || triggering}
            className="btn btn-primary btn-lg shrink-0"
            title={lead.status === 'DO_NOT_CALL' ? 'This lead asked not to be called' : undefined}
          >
            {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            Call with AI agent
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {answers.length > 0 && (
            <section className="card overflow-hidden">
              <div className="card-header">
                <div className="card-title">
                  <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><ClipboardList className="w-4 h-4" /></span>
                  Captured on the call
                </div>
              </div>
              <dl className="p-5 space-y-3 m-0">
                {answers.map(([key, label]) => (
                  <div key={key} className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--text)' }}>{String(lead.metadata[key])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="card overflow-hidden">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><Sparkles className="w-4 h-4" /></span>
                Qualification
              </div>
            </div>

            {qual ? (
              <div className="p-5 space-y-3">
                {[
                  { icon: Target, label: 'Need', value: qual.need },
                  { icon: Wallet, label: 'Budget', value: qual.budget },
                  { icon: UserCheck, label: 'Decision maker', value: qual.authority },
                  { icon: CalendarRange, label: 'Timeline', value: qual.timeline }
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--iris)' }} />
                    <div className="min-w-0">
                      <div className="eyebrow">{label}</div>
                      <div className="text-[13.5px] mt-0.5" style={{ color: value ? 'var(--text)' : 'var(--text-3)' }}>{value || 'Not captured'}</div>
                    </div>
                  </div>
                ))}
                {qual.summary && (
                  <div className="rounded-xl px-4 py-3.5" style={{ background: 'var(--iris-soft)', border: '1px solid rgba(139,124,246,0.22)' }}>
                    <div className="eyebrow" style={{ color: '#b3a9ff' }}>AI summary</div>
                    <p className="text-[13.5px] leading-relaxed mt-1 m-0" style={{ color: 'var(--text)' }}>{qual.summary}</p>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={Sparkles} title="Not evaluated yet" text="The AI evaluation appears shortly after a call is completed." />
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><History className="w-4 h-4" /></span>
                Call history
              </div>
              <span className="pill tone-neutral num">{lead.callAttempts?.length || 0}</span>
            </div>
            <div className="p-4 space-y-2">
              {(lead.callAttempts || []).length === 0 && (
                <div className="text-[13px] faint text-center py-6">No calls yet.</div>
              )}
              {lead.callAttempts?.map((attempt) => {
                const active = selectedAttempt?.id === attempt.id;
                return (
                  <button
                    key={attempt.id}
                    onClick={() => setSelectedAttempt(attempt)}
                    className="w-full text-left rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-all"
                    style={{
                      background: active ? 'var(--iris-soft)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${active ? 'rgba(139,124,246,0.35)' : 'var(--border)'}`,
                      boxShadow: active ? '0 8px 24px -14px var(--iris-glow)' : 'none'
                    }}
                  >
                    <div>
                      <div className="font-semibold text-[13.5px]" style={{ color: 'var(--text)' }}>Attempt #{attempt.attemptNumber}</div>
                      <div className="text-[12px] faint">{formatDateTime(attempt.createdAt)}</div>
                    </div>
                    <StatusPill status={attempt.status} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Transcript */}
        <section className="card xl:col-span-2 overflow-hidden">
          <div className="card-header">
            <div className="min-w-0">
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><MessageSquareText className="w-4 h-4" /></span>
                Conversation
              </div>
              <div className="card-subtitle">
                {selectedAttempt ? `Attempt #${selectedAttempt.attemptNumber} · ${humanize(selectedAttempt.status)}` : 'Select a call to view its transcript'}
              </div>
            </div>
            {selectedAttempt && (
              <div className="text-right shrink-0">
                <div className="eyebrow">Duration</div>
                <div className="num font-bold text-[15px]" style={{ color: 'var(--text)' }}>
                  {selectedDuration != null ? formatDuration(selectedDuration) : '—'}
                </div>
              </div>
            )}
          </div>

          <div className="p-5 md:p-6">
            {callLoading ? (
              <div className="space-y-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`flex ${i % 2 ? 'justify-end' : ''}`}>
                    <div className="skeleton h-14" style={{ width: `${50 + (i % 3) * 12}%`, borderRadius: 16 }} />
                  </div>
                ))}
              </div>
            ) : (
              <TranscriptViewer messages={selectedCall?.messages || []} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
