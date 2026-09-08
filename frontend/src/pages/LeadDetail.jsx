import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Calendar, CheckCircle2, User, Building, Mail, Clock, FileText } from 'lucide-react';
import QualificationBadge from '../components/QualificationBadge';
import TranscriptViewer from '../components/TranscriptViewer';
import api from '../services/api';

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [callLoading, setCallLoading] = useState(false);

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

  if (loading) {
    return <div className="p-8 text-cyan-400 font-mono">Loading Lead File & Conversation History...</div>;
  }

  if (!lead) {
    return <div className="p-8 text-rose-400">Lead record not found.</div>;
  }

  const qual = lead.qualificationResult;

  return (
    <div className="space-y-8">
      {/* Back Link */}
      <Link to="/leads" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400">
        <ArrowLeft className="w-4 h-4" /> Back to Lead CRM
      </Link>

      {/* Header Info Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-extrabold text-white">
              {lead.firstName} {lead.lastName}
            </h1>
            <QualificationBadge status={lead.status} score={lead.qualificationScore} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-cyan-400" /> {lead.phone}</span>
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /> {lead.email || 'N/A'}</span>
            <span className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-slate-400" /> {lead.company || 'N/A'}</span>
          </div>
        </div>

        <button
          onClick={async () => {
            await api.post('/calls/trigger', { leadId: lead.id });
            alert('Outbound call queued!');
          }}
          disabled={lead.status === 'DO_NOT_CALL'}
          className="px-4 py-2 bg-linear-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold rounded-lg text-xs shadow-md cursor-pointer disabled:opacity-50"
        >
          Initiate Outbound Call
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: BANT Qualification & Callbacks */}
        <div className="space-y-6">
          {/* BANT Card */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              BANT Qualification Analysis
            </h2>

            {qual ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <span className="font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">Project Need</span>
                  <span className="text-white font-medium text-sm">{qual.need || 'Not extracted'}</span>
                </div>
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <span className="font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">Budget Range</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm">{qual.budget || 'Not extracted'}</span>
                </div>
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <span className="font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">Decision Authority</span>
                  <span className="text-cyan-300 font-medium text-sm">{qual.authority || 'Not extracted'}</span>
                </div>
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <span className="font-semibold text-slate-400 block mb-0.5 uppercase tracking-wider">Timeline</span>
                  <span className="text-amber-300 font-mono text-sm">{qual.timeline || 'Not extracted'}</span>
                </div>
                {qual.summary && (
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 mt-2">
                    <span className="font-semibold text-slate-400 block mb-1 uppercase tracking-wider">AI Call Summary</span>
                    <p className="text-slate-300 italic leading-relaxed">{qual.summary}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs italic">
                Post-call AI evaluation pending or call not completed.
              </div>
            )}
          </div>

          {/* Call Attempts History Selector */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3">Call Attempts ({lead.callAttempts?.length || 0})</h3>
            <div className="space-y-2">
              {lead.callAttempts?.map((attempt) => (
                <button
                  key={attempt.id}
                  onClick={() => setSelectedAttempt(attempt)}
                  className={`w-full p-3 rounded-xl text-left border transition-all text-xs flex items-center justify-between cursor-pointer ${
                    selectedAttempt?.id === attempt.id
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-bold text-white">Attempt #{attempt.attemptNumber}</div>
                    <div className="text-[11px] font-mono text-slate-400">{new Date(attempt.createdAt).toLocaleString()}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-950 border border-slate-800 text-cyan-400">
                    {attempt.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Call Attempt Transcript Viewer */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Call Transcript & Diagnostics
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Twilio Call SID: {selectedCall?.twilioCallSid || selectedAttempt?.twilioCallSid || 'Not assigned'}
              </p>
            </div>

            {selectedAttempt && (
              <div className="text-xs font-mono text-slate-400">
                Duration: <strong className="text-white">{selectedCall?.duration || selectedAttempt.duration || 0}s</strong>
              </div>
            )}
          </div>

          {callLoading ? (
            <div className="p-8 text-center text-cyan-400 font-mono">Loading conversation...</div>
          ) : (
            <TranscriptViewer messages={selectedCall?.messages || []} />
          )}
        </div>
      </div>
    </div>
  );
}
