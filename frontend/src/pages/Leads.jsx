import React, { useEffect, useState } from 'react';
import { Search, Filter, Phone, Eye, RefreshCw } from 'lucide-react';
import QualificationBadge from '../components/QualificationBadge';
import api from '../services/api';
import { Link } from 'react-router-dom';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  const [triggeringId, setTriggeringId] = useState(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/leads?page=${page}&search=${search}&status=${statusFilter}`);
      if (res.success) {
        setLeads(res.leads);
        setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLeads();
  };

  const triggerCallNow = async (leadId) => {
    setTriggeringId(leadId);
    try {
      await api.post('/calls/trigger', { leadId });
      alert('Outbound voice call triggered! Job queued.');
      fetchLeads();
    } catch (err) {
      alert(`Call trigger error: ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Lead CRM Directory</h1>
          <p className="text-sm text-slate-400">All website leads with qualifications, callbacks, and call triggers</p>
        </div>

        <button
          onClick={fetchLeads}
          className="flex items-center gap-2 px-3 py-1.5 glass-panel rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="QUEUED">QUEUED</option>
            <option value="CALLING">CALLING</option>
            <option value="QUALIFIED">QUALIFIED</option>
            <option value="NOT_QUALIFIED">NOT_QUALIFIED</option>
            <option value="CALLBACK_SCHEDULED">CALLBACK_SCHEDULED</option>
            <option value="DO_NOT_CALL">DO_NOT_CALL</option>
          </select>
        </div>
      </div>

      {/* Lead Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Phone Number</th>
              <th className="p-4">Company</th>
              <th className="p-4">Status</th>
              <th className="p-4">Qualification Score</th>
              <th className="p-4">Next Callback</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500 font-mono">
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500">
                  No leads found. Submit a lead using the top right button.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-white">{lead.firstName} {lead.lastName}</div>
                    <div className="text-xs text-slate-500">{lead.email || 'No email'}</div>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-200">{lead.phone}</td>
                  <td className="p-4 text-slate-400">{lead.company || '--'}</td>
                  <td className="p-4">
                    <QualificationBadge status={lead.status} />
                  </td>
                  <td className="p-4 font-mono font-bold text-cyan-400">
                    {lead.qualificationScore || 0}/100
                  </td>
                  <td className="p-4 text-xs font-mono text-amber-400">
                    {lead.callbacks?.[0] ? new Date(lead.callbacks[0].scheduledFor).toLocaleString() : '--'}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => triggerCallNow(lead.id)}
                      disabled={triggeringId === lead.id || lead.status === 'DO_NOT_CALL'}
                      className="px-3 py-1 bg-cyan-950 border border-cyan-800 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Phone className="w-3 h-3" />
                      Call Now
                    </button>
                    <Link
                      to={`/leads/${lead.id}`}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      View
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
