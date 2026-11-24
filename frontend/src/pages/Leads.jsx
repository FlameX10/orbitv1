import React, { useEffect, useState } from 'react';
import { Search, Phone, ArrowUpRight, RefreshCw, Users, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QualificationBadge from '../components/QualificationBadge';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, PageHeader, SkeletonRows, formatDateTime } from '../components/ui';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'CALLING', label: 'Calling' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'NOT_QUALIFIED', label: 'Not qualified' },
  { value: 'CALLBACK_SCHEDULED', label: 'Callback' },
  { value: 'DO_NOT_CALL', label: 'Do not call' }
];

export default function Leads() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  const [triggeringId, setTriggeringId] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchLeads = async (searchOverride) => {
    setLoading(true);
    const term = searchOverride !== undefined ? searchOverride : search;
    try {
      const res = await api.get(`/leads?page=${page}&search=${encodeURIComponent(term)}&status=${statusFilter}`);
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

  // Header search navigates here with ?q=
  useEffect(() => {
    if (initialQuery !== search) {
      setSearch(initialQuery);
      setPage(1);
      fetchLeads(initialQuery);
    }
  }, [initialQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLeads();
  };

  const triggerCallNow = async (leadId) => {
    setTriggeringId(leadId);
    try {
      await api.post('/calls/trigger', { leadId });
      toast({ type: 'success', title: 'Call started', message: 'The AI agent is dialing this lead now.' });
      fetchLeads();
    } catch (err) {
      toast({ type: 'error', title: 'Could not start the call', message: err.message });
    } finally {
      setTriggeringId(null);
    }
  };

  const total = pagination?.total;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Leads"
        subtitle="Every website enquiry, its qualification status and next follow-up — in one place."
        actions={
          <button onClick={() => fetchLeads()} className="btn btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <section className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <form onSubmit={handleSearchSubmit} className="relative w-full xl:w-[360px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
            <input
              type="text"
              placeholder="Search by name, phone or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-icon"
              aria-label="Search leads"
            />
          </form>

          <div className="segmented overflow-x-auto max-w-full" role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value || 'all'}
                type="button"
                data-active={statusFilter === f.value}
                onClick={() => { setStatusFilter(f.value); setPage(1); }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Company</th>
                <th>Status</th>
                <th>Next callback</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={6} cols={6} />
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <EmptyState
                      icon={Users}
                      title={search || statusFilter ? 'No leads match your filters' : 'No leads yet'}
                      text={search || statusFilter ? 'Try a different search or status.' : 'Use “New Lead” in the top bar to add one, or wait for the next website enquiry.'}
                    />
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
                  return (
                    <tr key={lead.id} className="row-link" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <div className="cell-strong truncate">{name}</div>
                            <div className="text-[12px] faint truncate">{lead.email || 'No email'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{lead.phone}</td>
                      <td>{lead.company || '—'}</td>
                      <td><QualificationBadge status={lead.status} score={lead.qualificationScore} /></td>
                      <td className="text-[12.5px] whitespace-nowrap" style={{ color: lead.callbacks?.[0] ? 'var(--gold)' : undefined }}>
                        {lead.callbacks?.[0] ? formatDateTime(lead.callbacks[0].scheduledFor) : <span className="faint">—</span>}
                      </td>
                      <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => triggerCallNow(lead.id)}
                            disabled={triggeringId === lead.id || lead.status === 'DO_NOT_CALL'}
                            className="btn btn-secondary btn-sm"
                            title={lead.status === 'DO_NOT_CALL' ? 'This lead asked not to be called' : 'Call this lead now'}
                          >
                            {triggeringId === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                            Call now
                          </button>
                          <Link to={`/leads/${lead.id}`} className="btn btn-ghost btn-sm">
                            Open <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (pagination?.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[12.5px] faint">
              Page <span className="num muted">{page}</span> of <span className="num muted">{pagination.totalPages}</span>
              {total !== undefined && <> · <span className="num muted">{total}</span> leads</>}
            </span>
            <div className="flex items-center gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
