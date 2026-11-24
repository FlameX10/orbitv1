import React, { useEffect, useState } from 'react';
import { CalendarClock, X, Globe2 } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, PageHeader, SkeletonRows, StatusPill, formatDateTime } from '../components/ui';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELED', label: 'Canceled' },
  { value: 'FAILED', label: 'Failed' }
];

function relativeUntil(value) {
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  if (Number.isNaN(diff)) return '';
  const abs = Math.abs(diff);
  const unit = abs < 3600 ? `${Math.max(1, Math.round(abs / 60))}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

export default function Callbacks() {
  const [callbacks, setCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const { toast } = useToast();

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
      toast({ type: 'success', title: 'Callback canceled' });
      fetchCallbacks();
    } catch (err) {
      toast({ type: 'error', title: 'Could not cancel the callback', message: err.message });
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Callbacks"
        subtitle="Follow-up calls the agent scheduled when a lead asked to be called back later."
      />

      <section className="card overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-[13px] muted">Times are shown in your local timezone.</div>
          <div className="segmented overflow-x-auto max-w-full" role="tablist" aria-label="Filter by callback status">
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
                <th>Scheduled for</th>
                <th>Timezone</th>
                <th>Reason</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={5} cols={6} />
              ) : callbacks.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <EmptyState icon={CalendarClock} title="No callbacks" text="When a lead asks to be called later, the agent schedules it here automatically." />
                  </td>
                </tr>
              ) : (
                callbacks.map((cb) => {
                  const name = `${cb.lead?.firstName || ''} ${cb.lead?.lastName || ''}`.trim() || 'Unknown lead';
                  return (
                    <tr key={cb.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <div className="cell-strong truncate">{name}</div>
                            <div className="mono faint">{cb.lead?.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-semibold" style={{ color: cb.status === 'SCHEDULED' ? 'var(--gold)' : 'var(--text)' }}>
                          {formatDateTime(cb.scheduledFor)}
                        </div>
                        {cb.status === 'SCHEDULED' && <div className="text-[12px] faint">{relativeUntil(cb.scheduledFor)}</div>}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-[12.5px]"><Globe2 className="w-3.5 h-3.5 faint" />{cb.timezone}</span>
                      </td>
                      <td className="max-w-xs">
                        <div className="truncate text-[13px]" title={cb.reason}>{cb.reason || '—'}</div>
                      </td>
                      <td><StatusPill status={cb.status} /></td>
                      <td className="text-right">
                        {cb.status === 'SCHEDULED' && (
                          <button onClick={() => handleCancel(cb.id)} className="btn btn-danger-soft btn-sm">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
