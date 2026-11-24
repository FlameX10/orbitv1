import React, { useEffect, useState } from 'react';
import { PhoneCall, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Avatar, EmptyState, PageHeader, RegionChip, SkeletonRows, StatusPill, formatDateTime, formatDuration } from '../components/ui';

function getProviderTracking(call) {
  if (call.plivoCallUuid) return { label: 'Call UUID', value: call.plivoCallUuid };
  if (call.plivoTriggerApiId) return { label: 'Trigger API ID', value: call.plivoTriggerApiId };
  if (call.plivoFlowRunUuid) return { label: 'Flow Run UUID', value: call.plivoFlowRunUuid };
  if (call.plivoConversationId) return { label: 'Conversation ID', value: call.plivoConversationId };
  if (call.twilioCallSid) return { label: 'Twilio SID', value: call.twilioCallSid };
  return { label: 'Provider ID', value: 'Unavailable' };
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RINGING', label: 'Ringing' },
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'FAILED', label: 'Failed' }
];

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  const { lastEvent } = useSocket();
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!lastEvent || lastEvent.name !== 'call_status_change') return;
    fetchCalls();
  }, [lastEvent]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Calls & Transcripts"
        subtitle="Every conversation the AI agent has had — status, duration and the full transcript."
      />

      <section className="card overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-[13px] muted">
            {pagination?.total !== undefined ? <><span className="num" style={{ color: 'var(--text)' }}>{pagination.total}</span> calls recorded</> : 'Call history'}
          </div>
          <div className="segmented overflow-x-auto max-w-full" role="tablist" aria-label="Filter by call status">
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
                <th>Status</th>
                <th>Region</th>
                <th>Attempt</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Provider reference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={7} cols={8} />
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <EmptyState icon={PhoneCall} title="No calls recorded yet" text="Calls appear here as soon as the agent dials a lead." />
                  </td>
                </tr>
              ) : (
                calls.map((call) => {
                  const name = `${call.lead?.firstName || ''} ${call.lead?.lastName || ''}`.trim() || 'Unknown lead';
                  const tracking = getProviderTracking(call);
                  return (
                    <tr key={call.id} className="row-link" onClick={() => navigate(`/calls/${call.id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <div className="cell-strong truncate">{name}</div>
                            <div className="mono faint">{call.lead?.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td><StatusPill status={call.status} /></td>
                      <td><RegionChip region={call.plivoRegion} /></td>
                      <td><span className="chip">#{call.attemptNumber}</span></td>
                      <td className="num whitespace-nowrap" style={{ color: 'var(--text)' }}>{formatDuration(call.duration)}</td>
                      <td className="text-[12.5px] whitespace-nowrap">{formatDateTime(call.createdAt)}</td>
                      <td className="max-w-[200px]">
                        <div className="text-[10.5px] uppercase tracking-wider faint">{tracking.label}</div>
                        <div className="mono faint truncate" title={tracking.value}>{tracking.value}</div>
                      </td>
                      <td className="text-right">
                        <Link to={`/calls/${call.id}`} onClick={e => e.stopPropagation()} className="btn btn-ghost btn-sm whitespace-nowrap">
                          Transcript <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && (pagination?.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[12.5px] faint">
              Page <span className="num muted">{page}</span> of <span className="num muted">{pagination.totalPages}</span>
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
