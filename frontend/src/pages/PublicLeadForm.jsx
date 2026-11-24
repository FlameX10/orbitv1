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
  PhoneCall,
  Sparkles,
  Languages,
  ShieldCheck,
  Check
} from 'lucide-react';
import api from '../services/api';

const STEPS = [
  { title: 'Lead received', text: 'Your details are saved securely.' },
  { title: 'Call queued', text: 'The call is scheduled in our job queue.' },
  { title: 'Dialing your phone', text: 'The AI agent is placing the call now.' },
  { title: 'Conversation live', text: 'Answer your phone and talk to the agent.' }
];

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

  const set = (key) => (e) => setFormData({ ...formData, [key]: e.target.value });

  return (
    <div className="max-w-5xl mx-auto space-y-9 pb-12">
      {/* Hero */}
      <div className="text-center space-y-4">
        <span className="pill tone-iris"><Sparkles className="w-3.5 h-3.5" /> Live call studio</span>
        <h1 className="text-[34px] md:text-[44px] font-bold tracking-tight leading-[1.08]">
          <span className="text-gradient">Hear the AI agent</span>
          <br />
          <span style={{ color: 'var(--text)' }}>call you in seconds.</span>
        </h1>
        <p className="text-[15px] muted max-w-xl mx-auto">
          Enter your details and the agent will phone you, qualify your requirement in English or Hindi, and log the full conversation.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <span className="pill tone-neutral"><Zap className="w-3.5 h-3.5" /> Calls within seconds</span>
          <span className="pill tone-neutral"><Languages className="w-3.5 h-3.5" /> English & Hindi</span>
          <span className="pill tone-neutral"><ShieldCheck className="w-3.5 h-3.5" /> Secure</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form */}
        <section className="lg:col-span-7 card card-glow p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="icon-tile"><User className="w-[18px] h-[18px]" /></span>
            <div>
              <div className="card-title">Your details</div>
              <div className="card-subtitle">We only use these to place the demo call.</div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 text-[13px] tone-danger" style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Something went wrong</div>
                <div className="opacity-90">{error}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">First name *</label>
                <input type="text" required placeholder="John" value={formData.firstName} onChange={set('firstName')} className="input" />
              </div>
              <div>
                <label className="field-label">Last name</label>
                <input type="text" placeholder="Doe" value={formData.lastName} onChange={set('lastName')} className="input" />
              </div>
            </div>

            <div>
              <label className="field-label">Phone number *</label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                <input type="tel" required placeholder="+91 98765 43210" value={formData.phone} onChange={set('phone')} className="input input-icon mono" style={{ fontSize: 14 }} />
              </div>
              <div className="text-[11.5px] faint mt-1.5">Include your country code, e.g. +91 or +1.</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Company</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                  <input type="text" placeholder="Acme Tech" value={formData.company} onChange={set('company')} className="input input-icon" />
                </div>
              </div>
              <div>
                <label className="field-label">Work email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                  <input type="email" placeholder="john@acme.com" value={formData.email} onChange={set('email')} className="input input-icon" />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="field-label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> When should we call?</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'immediate', title: 'Call me now', text: 'Rings in a few seconds', Icon: Zap },
                  { key: 'scheduled', title: 'In 5 minutes', text: 'A short delay', Icon: Clock }
                ].map(({ key, title, text, Icon }) => {
                  const active = formData.timing === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormData({ ...formData, timing: key })}
                      className="rounded-2xl p-4 text-left flex items-center justify-between gap-3 transition-all"
                      style={{
                        background: active ? 'var(--iris-soft)' : 'var(--fill-025)',
                        border: `1px solid ${active ? 'rgba(139,124,246,0.45)' : 'var(--border)'}`,
                        boxShadow: active ? '0 10px 26px -14px var(--iris-glow)' : 'none'
                      }}
                    >
                      <div>
                        <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
                        <div className="text-[12px] faint">{text}</div>
                      </div>
                      <Icon className="w-4 h-4" style={{ color: active ? 'var(--iris)' : 'var(--text-3)' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="submit" disabled={loading || activeStep > 0} className="btn btn-primary btn-lg w-full mt-3">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Connecting your call…</>
              ) : activeStep > 0 ? (
                <><CheckCircle2 className="w-4 h-4" /> Call in progress</>
              ) : (
                <><PhoneCall className="w-4 h-4" /> Call me now</>
              )}
            </button>
          </form>
        </section>

        {/* Progress */}
        <aside className="lg:col-span-5 space-y-5">
          <section className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="card-title">Call progress</div>
              {activeStep > 0 && (
                <span className="pill tone-iris"><span className="soundwave"><span /><span /><span /><span /></span> Live</span>
              )}
            </div>

            <ol className="relative m-0 p-0 list-none space-y-6">
              <span className="absolute left-[15px] top-4 bottom-4 w-px" style={{ background: 'var(--border-strong)' }} aria-hidden="true" />
              <span
                className="absolute left-[15px] top-4 w-px transition-all duration-700"
                style={{ height: `${Math.max(0, Math.min(activeStep - 1, 3)) * 33}%`, background: 'linear-gradient(var(--iris), var(--aqua))', boxShadow: '0 0 12px var(--iris-glow)' }}
                aria-hidden="true"
              />
              {STEPS.map((step, i) => {
                const n = i + 1;
                const done = activeStep > n || (activeStep === 4 && n === 4);
                const current = activeStep === n && n !== 4;
                const reached = activeStep >= n;
                return (
                  <li key={step.title} className="relative flex items-start gap-4">
                    <div
                      className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 transition-all duration-500"
                      style={{
                        background: reached ? 'linear-gradient(140deg, #a99dff, #6f5cf2)' : 'var(--surface-2)',
                        color: reached ? '#fff' : 'var(--text-3)',
                        border: reached ? 'none' : '1px solid var(--border-strong)',
                        boxShadow: current ? '0 0 0 6px var(--iris-soft), 0 0 22px var(--iris-glow)' : reached ? '0 8px 18px -8px var(--iris-glow)' : 'none'
                      }}
                    >
                      {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
                    </div>
                    <div className="pt-1">
                      <div className="text-[14px] font-semibold" style={{ color: reached ? 'var(--text)' : 'var(--text-3)' }}>{step.title}</div>
                      <div className="text-[12.5px] faint mt-0.5">{step.text}</div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {activeStep === 4 && (
              <div className="mt-6 rounded-2xl p-4 animate-scale" style={{ background: 'var(--success-soft)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <div className="flex items-center gap-2 font-semibold text-[14px]" style={{ color: 'var(--success)' }}>
                  <span className="soundwave"><span /><span /><span /><span /></span>
                  Your phone should be ringing
                </div>
                <p className="text-[13px] muted mt-2 mb-3">Answer to speak with the AI agent. The full transcript will appear in the dashboard.</p>
                <button onClick={resetForm} className="btn btn-secondary btn-sm w-full">Try another call</button>
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2 font-semibold text-[13.5px]" style={{ color: 'var(--text)' }}>
              <Sparkles className="w-4 h-4" style={{ color: 'var(--gold)' }} /> What the agent does
            </div>
            <ul className="mt-3 space-y-2 m-0 p-0 list-none text-[13px] muted">
              {['Confirms it is speaking to the right person', 'Lets you choose English or Hindi', 'Understands your requirement and timeline', 'Schedules a callback if you are busy'].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} /> {item}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
