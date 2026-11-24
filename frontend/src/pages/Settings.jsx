import React, { useEffect, useState } from 'react';
import { ShieldCheck, Server, Database, Phone, Cpu, Mic, AudioLines, Globe2, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { PageHeader, PageLoader, formatDateTime } from '../components/ui';

function statusTone(value) {
  const v = String(value || '').toUpperCase();
  if (['HEALTHY', 'UP', 'LIVE'].includes(v)) return 'success';
  if (['UNHEALTHY', 'DOWN'].includes(v)) return 'danger';
  if (!v || v === 'UNKNOWN') return 'neutral';
  return 'warning';
}

function ServiceCard({ icon: Icon, title, description, status, tone, style }) {
  return (
    <div className="card card-hover p-5" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="icon-tile"><Icon className="w-[18px] h-[18px]" /></span>
          <div className="font-semibold text-[14.5px]" style={{ color: 'var(--text)' }}>{title}</div>
        </div>
        {status && (
          <span className={`pill tone-${tone || statusTone(status)}`}>
            <span className="pill-dot" /> {status}
          </span>
        )}
      </div>
      <p className="text-[13px] muted mt-3 mb-0 leading-relaxed">{description}</p>
    </div>
  );
}

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await api.get('/health');
      setHealth(res);
    } catch (err) {
      console.error('Health check error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  if (loading && !health) return <PageLoader label="Checking system health" />;

  const services = health?.services || {};
  const overall = health?.status || 'UNKNOWN';
  const healthy = overall === 'UP';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="System"
        title="System Health"
        subtitle="Live status of the platform and the services that power every call."
        actions={
          <button onClick={checkHealth} className="btn btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-check
          </button>
        }
      />

      {/* Overall */}
      <section className="card card-glow overflow-hidden p-6 md:p-7">
        <div className="orb" style={{ width: 280, height: 280, top: -150, right: -60, background: healthy ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)' }} />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: healthy ? 'var(--success-soft)' : 'var(--warning-soft)', border: `1px solid ${healthy ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}` }}
            >
              <ShieldCheck className="w-7 h-7" style={{ color: healthy ? 'var(--success)' : 'var(--warning)' }} />
            </div>
            <div>
              <div className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                {healthy ? 'All systems operational' : 'Some services need attention'}
              </div>
              <div className="text-[13px] faint mt-0.5">
                Last checked {formatDateTime(health?.timestamp)}{health?.environment ? ` · ${health.environment}` : ''}
              </div>
            </div>
          </div>
          <span className={`pill tone-${statusTone(overall)}`} style={{ height: 30, padding: '0 14px', fontSize: 12.5 }}>
            <span className="live-dot" style={{ width: 7, height: 7, background: 'currentColor' }} /> {overall}
          </span>
        </div>
      </section>

      <div>
        <div className="eyebrow mb-3">Platform</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger">
          <ServiceCard
            style={{ '--i': 0 }}
            icon={Database}
            title="Database"
            status={services.database?.status}
            description="PostgreSQL — stores leads, calls, transcripts and results."
          />
          <ServiceCard
            style={{ '--i': 1 }}
            icon={Server}
            title="Job queue"
            status={services.queue?.status}
            description={`${services.queue?.provider || 'PostgreSQL pg-boss'} — runs calls, callbacks and post-call processing.`}
          />
          <ServiceCard
            style={{ '--i': 2 }}
            icon={Cpu}
            title="Post-call AI scoring"
            status={services.llm ? (services.llm.isMock ? 'Not configured' : 'Live') : undefined}
            tone={services.llm ? (services.llm.isMock ? 'warning' : 'success') : undefined}
            description={`Summarises and scores each call${services.llm?.provider ? ` using ${String(services.llm.provider).toUpperCase()}` : ''}.`}
          />
        </div>
      </div>

      <div>
        <div className="eyebrow mb-3">Voice stack</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 stagger">
          <ServiceCard style={{ '--i': 0 }} icon={Phone} title="Plivo AI Agent" description="Places outbound calls and runs the qualification conversation flow." />
          <ServiceCard style={{ '--i': 1 }} icon={Globe2} title="Regional routing" description="India (+91) numbers use the India agent; all others use the US agent." />
          <ServiceCard style={{ '--i': 2 }} icon={Mic} title="Speech recognition" description="Sarvam speech-to-text, tuned for English and Hindi callers." />
          <ServiceCard style={{ '--i': 3 }} icon={AudioLines} title="Natural voice" description="ElevenLabs text-to-speech for a warm, natural agent voice." />
        </div>
        <p className="text-[12px] faint mt-3">Voice stack services are configured in the Plivo agent and checked on each call.</p>
      </div>
    </div>
  );
}
