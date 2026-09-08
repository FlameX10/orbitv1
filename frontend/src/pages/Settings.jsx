import React, { useEffect, useState } from 'react';
import { ShieldCheck, Server, Database, Phone, Bot, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await api.get('/health');
        setHealth(res);
      } catch (err) {
        console.error('Health check error:', err);
      } finally {
        setLoading(false);
      }
    }
    checkHealth();
  }, []);

  if (loading) return <div className="p-8 text-cyan-400 font-mono">Running System Telemetry Health Check...</div>;

  const services = health?.services || {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          System Health & Architecture Status
        </h1>
        <p className="text-sm text-slate-400">PostgreSQL queue status, Twilio, ElevenLabs, and LLM Provider configuration inspect</p>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <span className="text-sm font-semibold text-slate-300">Overall System Status:</span>
          <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
            health?.status === 'UP' ? 'bg-emerald-950 border border-emerald-700 text-emerald-300' : 'bg-amber-950 border border-amber-700 text-amber-300'
          }`}>
            {health?.status || 'ONLINE'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
          {/* Database */}
          <div className="p-4 glass-card rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between font-bold text-white mb-2">
              <span className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400" /> PostgreSQL Database</span>
              <span className="text-emerald-400 font-mono">{services.database?.status}</span>
            </div>
            <p className="text-slate-400">Primary persistence store & transactional queue backing.</p>
          </div>

          {/* Queue */}
          <div className="p-4 glass-card rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between font-bold text-white mb-2">
              <span className="flex items-center gap-2"><Server className="w-4 h-4 text-purple-400" /> Job Queue (No Redis)</span>
              <span className="text-emerald-400 font-mono">{services.queue?.status}</span>
            </div>
            <p className="text-slate-400">{services.queue?.provider}</p>
          </div>

          {/* Twilio */}
          <div className="p-4 glass-card rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between font-bold text-white mb-2">
              <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-rose-400" /> Twilio Telephony</span>
              <span className="text-cyan-400 font-mono">{services.twilio?.isMock ? 'MOCK / DEV' : 'LIVE API'}</span>
            </div>
            <p className="text-slate-400">Handles call initiation, SID tracking, and status webhooks.</p>
          </div>

          {/* ElevenLabs */}
          <div className="p-4 glass-card rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between font-bold text-white mb-2">
              <span className="flex items-center gap-2"><Bot className="w-4 h-4 text-amber-400" /> ElevenLabs Voice AI</span>
              <span className="text-cyan-400 font-mono">{services.elevenlabs?.isMock ? 'MOCK / DEV' : 'LIVE API'}</span>
            </div>
            <p className="text-slate-400">Natural voice synthesis & agent session management.</p>
          </div>

          {/* LLM Provider */}
          <div className="p-4 glass-card rounded-xl border border-slate-800 space-y-1 md:col-span-2">
            <div className="flex items-center justify-between font-bold text-white mb-2">
              <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-400" /> LLM Reasoning Provider</span>
              <span className="text-cyan-400 font-mono uppercase">{services.llm?.provider} ({services.llm?.isMock ? 'MOCK' : 'LIVE'})</span>
            </div>
            <p className="text-slate-400">Handles intent classification, dynamic qualification extraction, and callback time resolution.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
