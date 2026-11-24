import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Clock, UserPlus, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const TIMING_OPTIONS = [
  { value: '0', label: 'Now', hint: 'Within seconds' },
  { value: '60', label: '1 min', hint: 'Short delay' },
  { value: '300', label: '5 min', hint: 'Short delay' },
  { value: '3600', label: '1 hour', hint: 'Later today' }
];

export default function NewLeadModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    company: '',
    source: 'website_form',
    delayOption: '0' // '0' = Immediate call, '300' = 5 mins, '3600' = 1 hour
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await api.post('/leads', {
        ...formData,
        delaySeconds: parseInt(formData.delayOption, 10)
      });
      if (res.success) {
        setMessage({ type: 'success', text: res.message || 'Lead submitted & call enqueued!' });
        setTimeout(() => {
          onClose();
          setMessage(null);
          setFormData({ firstName: '', lastName: '', phone: '', email: '', company: '', source: 'website_form', delayOption: '0' });
        }, 1500);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (e) => setFormData({ ...formData, [key]: e.target.value });

  // Portal to <body>: the header's backdrop-filter would otherwise trap this fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto animate-fade" role="dialog" aria-modal="true" aria-labelledby="new-lead-title">
      <div className="fixed inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} />

      <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
      <div className="relative card card-glow w-full max-w-[520px] my-6 animate-scale pointer-events-auto" style={{ background: 'rgba(18,20,28,0.96)', boxShadow: 'var(--shadow-pop)' }}>
        <div className="flex items-start justify-between gap-4 px-7 pt-7">
          <div className="flex items-center gap-3.5">
            <span className="icon-tile" style={{ width: 42, height: 42, borderRadius: 13 }}><UserPlus className="w-5 h-5" /></span>
            <div>
              <h2 id="new-lead-title" className="text-[19px] font-bold">New lead</h2>
              <p className="text-[13px] muted mt-0.5 mb-0">The AI agent will call this lead automatically.</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 pb-7 pt-6 space-y-4">
          {message && (
            <div
              className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13px] ${message.type === 'success' ? 'tone-success' : 'tone-danger'}`}
              style={{ border: '1px solid currentColor', borderColor: message.type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)' }}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{message.text}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">First name *</label>
              <input type="text" required placeholder="Rahul" value={formData.firstName} onChange={set('firstName')} className="input" autoFocus />
            </div>
            <div>
              <label className="field-label">Last name</label>
              <input type="text" placeholder="Sharma" value={formData.lastName} onChange={set('lastName')} className="input" />
            </div>
          </div>

          <div>
            <label className="field-label">Phone number *</label>
            <input type="tel" required placeholder="+91 98765 43210" value={formData.phone} onChange={set('phone')} className="input mono" style={{ fontSize: 14 }} />
            <div className="text-[11.5px] faint mt-1.5">Include the country code, e.g. +91 or +1.</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Email</label>
              <input type="email" placeholder="rahul@company.com" value={formData.email} onChange={set('email')} className="input" />
            </div>
            <div>
              <label className="field-label">Company</label>
              <input type="text" placeholder="Company name" value={formData.company} onChange={set('company')} className="input" />
            </div>
          </div>

          <div>
            <label className="field-label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> When should the agent call?</label>
            <div className="grid grid-cols-4 gap-2">
              {TIMING_OPTIONS.map(opt => {
                const active = formData.delayOption === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, delayOption: opt.value })}
                    className="rounded-xl px-2 py-2.5 text-center transition-all"
                    style={{
                      background: active ? 'var(--iris-soft)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${active ? 'rgba(139,124,246,0.45)' : 'var(--border)'}`,
                      boxShadow: active ? '0 8px 20px -12px var(--iris-glow)' : 'none'
                    }}
                  >
                    <div className="text-[13px] font-semibold" style={{ color: active ? '#fff' : 'var(--text)' }}>{opt.label}</div>
                    <div className="text-[10.5px] faint">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full mt-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Adding lead…' : 'Add lead & start call'}
          </button>
        </form>
      </div>
      </div>
    </div>,
    document.body
  );
}
