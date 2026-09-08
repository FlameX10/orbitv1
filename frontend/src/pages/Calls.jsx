import React, { useEffect, useState } from 'react';
import { PhoneCall, Clock, FileText, Filter } from 'lucide-react';
import api from '../services/api';
import { Link } from 'react-router-dom';

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/calls?page=${page}&status=${statusFilter}`);
      if (res.success) {
        setCalls(res.calls);
        setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch calls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [page, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Call Execution Logs</h1>
          <p className="text-sm text-slate-400">Complete historical records of outbound Twilio & ElevenLabs call attempts</p>
        </div>

        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Call Statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RINGING">RINGING</option>
            <option value="NO_ANSWER">NO_ANSWER</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="p-4">Lead Name & Phone</th>
              <th className="p-4">Twilio Call SID</th>
              <th className="p-4">Attempt #</th>
              <th className="p-4">Status</th>
              <th className="p-4">Duration</th>
              <th className="p-4">Timestamp</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500 font-mono">
                  Loading call logs...
                </td>
              </tr>
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500">
                  No call logs recorded yet.
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-white">
                      {call.lead?.firstName} {call.lead?.lastName}
                    </div>
                    <div className="text-xs font-mono text-cyan-400">{call.lead?.phone}</div>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-400">{call.twilioCallSid || 'CA_MOCK_SIMULATED'}</td>
                  <td className="p-4 font-mono font-bold text-white">#{call.attemptNumber}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      call.status === 'COMPLETED' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' :
                      call.status === 'IN_PROGRESS' ? 'bg-cyan-950/80 border-cyan-800 text-cyan-300 animate-pulse' :
                      call.status === 'NO_ANSWER' ? 'bg-amber-950/80 border-amber-800 text-amber-300' :
                      'bg-rose-950/80 border-rose-800 text-rose-300'
                    }`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-300">{call.duration ? `${call.duration}s` : '--'}</td>
                  <td className="p-4 font-mono text-xs text-slate-400">{new Date(call.createdAt).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <Link
                      to={`/calls/${call.id}`}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Transcript
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
