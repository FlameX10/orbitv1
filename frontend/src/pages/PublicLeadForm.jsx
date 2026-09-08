import React, { useEffect, useState } from 'react';
import { 
  Phone, 
  User, 
  Building2, 
  Mail, 
  Clock, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Volume2, 
  PhoneCall, 
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import api from '../services/api';

export default function PublicLeadForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    company: '',
    email: '',
    timing: 'immediate', // 'immediate' | 'scheduled'
    delayMins: 5
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(0); // 0: Idle, 1: Ingested, 2: Enqueued, 3: Dialing, 4: Connected
  const [leadResult, setLeadResult] = useState(null);

  useEffect(() => {
    if (!leadResult?.id) return undefined;

    let cancelled = false;
    const refreshCallStatus = async () => {
      try {
        const res = await api.get(`/leads/${leadResult.id}`);
        if (cancelled) return;

        const attempt = res.data?.callAttempts?.[0];
        const status = attempt?.status;
        const statusStep = {
          QUEUED: 2,
          INITIATING: 3,
          RINGING: 3,
          ANSWERED: 4,
          IN_PROGRESS: 4,
          COMPLETED: 4,
          FAILED: 0,
          NO_ANSWER: 0,
          BUSY: 0
        }[status];

        if (statusStep !== undefined) {
          setActiveStep(statusStep);
          if (['COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY'].includes(status)) {
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to refresh call status:', err);
      }
    };

    refreshCallStatus();
    const intervalId = setInterval(refreshCallStatus, 2500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [leadResult?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.phone || !formData.firstName) {
      setError('Please provide at least a First Name and valid Phone Number.');
      return;
    }

    setLoading(true);
    setError(null);
    setActiveStep(1);

    try {
      // Calculate delay in seconds if scheduled
      const delaySeconds = formData.timing === 'scheduled' ? formData.delayMins * 60 : 0;

      // Submit lead to backend API
      const res = await api.post('/leads', {
        firstName: formData.firstName,
        lastName: formData.lastName || '',
        phone: formData.phone,
        company: formData.company || 'Direct Web Submission',
        email: formData.email || undefined,
        delaySeconds
      });

      setLeadResult(res.data);
      setActiveStep(2); // Enqueued in pg-boss queue

    } catch (err) {
      console.error('Failed to submit lead:', err);
      setError(err.response?.data?.message || err.message || 'Failed to submit lead and initiate call.');
      setLoading(false);
      setActiveStep(0);
    }
  };

  const resetForm = () => {
    setActiveStep(0);
    setLeadResult(null);
    setError(null);
    setFormData({
      firstName: '',
      lastName: '',
      phone: '',
      company: '',
      email: '',
      timing: 'immediate',
      delayMins: 5
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Title Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold font-mono">
          <Zap className="w-3.5 h-3.5" /> LIVE OUTBOUND CALL SIMULATOR
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
          Test Instant AI Lead Calling
        </h1>
        <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
          Enter your details below to trigger an instant AI voice call. Experience real-time BANT qualification powered by Twilio, ElevenLabs, and PostgreSQL job queues.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Form Card (7 Cols) */}
        <div className="md:col-span-7 glass-card p-6 md:p-8 rounded-2xl border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-cyan-400" />
              Lead Details
            </h2>
            <span className="text-xs text-slate-500 font-mono">E.164 Format Ready</span>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Submission Error</div>
                <div className="text-xs opacity-90">{error}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">First Name *</label>
                <input
                  type="text"
                  required
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Last Name</label>
                <input
                  type="text"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Phone Number (E.164) *</span>
                <span className="text-[11px] text-cyan-400 font-mono">e.g. +919876543210 or +14155552671</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  required
                  placeholder="+919876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Company / Organization</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Acme Tech"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    placeholder="john@acme.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Call Timing Options */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" /> When Should the Call Happen?
              </label>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, timing: 'immediate' })}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                    formData.timing === 'immediate'
                      ? 'border-cyan-500 bg-cyan-950/40 text-white'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-white">Call Me Immediately</div>
                    <div className="text-[11px] text-slate-400">Triggers dialer in ~2 seconds</div>
                  </div>
                  <Zap className={`w-4 h-4 ${formData.timing === 'immediate' ? 'text-cyan-400' : 'text-slate-600'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, timing: 'scheduled' })}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                    formData.timing === 'scheduled'
                      ? 'border-emerald-500 bg-emerald-950/40 text-white'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-white">Schedule Delayed Call</div>
                    <div className="text-[11px] text-slate-400">Delay by 5 minutes</div>
                  </div>
                  <Clock className={`w-4 h-4 ${formData.timing === 'scheduled' ? 'text-emerald-400' : 'text-slate-600'}`} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || activeStep > 0}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-linear-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  Initiating Outbound Dial Sequence...
                </>
              ) : activeStep > 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  Call Sequence Active
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4 text-slate-950" />
                  Trigger Outbound Call Now
                </>
              )}
            </button>

          </form>
        </div>

        {/* Live Execution Visualizer Stepper (5 Cols) */}
        <div className="md:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-6 relative overflow-hidden">
            <h3 className="font-bold text-white text-base border-b border-slate-800 pb-3 flex items-center justify-between">
              <span>Execution Timeline</span>
              {activeStep > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 animate-pulse">
                  LIVE STATUS
                </span>
              )}
            </h3>

            {/* Stepper items */}
            <div className="space-y-6 relative before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
              
              {/* Step 1 */}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all ${
                  activeStep >= 1
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  1
                </div>
                <div>
                  <div className={`font-semibold text-sm ${activeStep >= 1 ? 'text-white' : 'text-slate-500'}`}>
                    Lead Record Ingested
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    POST /api/leads created lead entry in PostgreSQL.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all ${
                  activeStep >= 2
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  2
                </div>
                <div>
                  <div className={`font-semibold text-sm ${activeStep >= 2 ? 'text-white' : 'text-slate-500'}`}>
                    PostgreSQL Queue Job Enqueued
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Job <span className="font-mono text-cyan-400">CALL_LEAD</span> scheduled in <span className="font-mono text-emerald-400">pg-boss</span> queue.
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all ${
                  activeStep >= 3
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  3
                </div>
                <div>
                  <div className={`font-semibold text-sm ${activeStep >= 3 ? 'text-white' : 'text-slate-500'}`}>
                    Twilio Outbound Dialing
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Worker invoking <span className="font-mono text-slate-300">client.calls.create()</span> to your phone number.
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all ${
                  activeStep >= 4
                    ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/30 ring-4 ring-emerald-400/20'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  4
                </div>
                <div>
                  <div className={`font-semibold text-sm ${activeStep >= 4 ? 'text-emerald-300' : 'text-slate-500'}`}>
                    AI Voice Conversation Active
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    ElevenLabs + OpenAI streaming live audio via WebSocket.
                  </div>
                </div>
              </div>

            </div>

            {activeStep === 4 && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                  Phone Should Be Ringing Now!
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Your call is currently active. Answer your phone to speak directly with the AI Lead Qualification Agent!
                </p>
                <button
                  onClick={resetForm}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold transition-colors"
                >
                  Test Another Call
                </button>
              </div>
            )}

          </div>

          <div className="p-4 rounded-2xl glass-card border border-slate-800 text-xs text-slate-400 space-y-1.5">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Zero-Redis Architecture Guarantee
            </div>
            <p className="leading-relaxed">
              All jobs, delayed callbacks, and retries are managed by PostgreSQL. No Redis or external key-value store is required.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
