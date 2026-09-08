import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle, XCircle, Clock, Filter, Plus } from 'lucide-react';
import api from '../services/api';

export default function Callbacks() {
  const [callbacks, setCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchCallbacks = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/callbacks?page=${page}&status=${statusFilter}`);
      if (res.success) {
        setCallbacks(res.callbacks);
      }
    } catch (err) {
      console.error('Failed to fetch callbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallbacks();
  }, [page, statusFilter]);

  const handleCancel = async (id) => {
    try {
      await api.patch(`/callbacks/${id}/cancel`);
      fetchCallbacks();
    } catch (err) {
      alert(`Failed to cancel callback: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Scheduled Callback Queue</h1>
          <p className="text-sm text-slate-400">PostgreSQL pg-boss worker scheduled follow-ups with timezone handling</p>
        </div>

        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Callback Statuses</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELED">CANCELED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="p-4">Lead & Contact</th>
              <th className="p-4">Scheduled Execution Time</th>
              <th className="p-4">Timezone</th>
              <th className="p-4">Reason / Context</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500 font-mono">
                  Loading callback queue...
                </td>
              </tr>
            ) : callbacks.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">
                  No callbacks scheduled currently.
                </td>
              </tr>
            ) : (
              callbacks.map((cb) => (
                <tr key={cb.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-white">{cb.lead?.firstName} {cb.lead?.lastName}</div>
                    <div className="text-xs font-mono text-cyan-400">{cb.lead?.phone}</div>
                  </td>
                  <td className="p-4 font-mono text-xs font-bold text-amber-300">
                    {new Date(cb.scheduledFor).toLocaleString()}
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-400">{cb.timezone}</td>
                  <td className="p-4 text-xs text-slate-300 max-w-xs truncate">{cb.reason}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      cb.status === 'SCHEDULED' ? 'bg-amber-950/80 border-amber-800 text-amber-300 animate-pulse' :
                      cb.status === 'COMPLETED' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' :
                      'bg-slate-900 border-slate-700 text-slate-400'
                    }`}>
                      {cb.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {cb.status === 'SCHEDULED' && (
                      <button
                        onClick={() => handleCancel(cb.id)}
                        className="px-3 py-1 bg-rose-950 border border-rose-800 hover:bg-rose-900 text-rose-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel Callback
                      </button>
                    )}
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
