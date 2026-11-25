import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { UserPlus, KeyRound, Power, Eye, EyeOff, Loader2, ShieldCheck, UserCog, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, PageHeader, SkeletonRows, formatDateTime } from '../components/ui';

function PasswordInput({ value, onChange, id, placeholder = 'At least 8 characters', autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className="input pr-11"
        placeholder={placeholder}
        autoComplete="new-password"
        minLength={8}
        required
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-icon btn-sm"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ResetPasswordDialog({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/users/${user.id}/password`, { password });
      toast({ type: 'success', title: 'Password updated', message: `${user.username} can sign in with the new password.` });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto animate-fade" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
        <form onSubmit={submit} className="relative card card-glow w-full max-w-[420px] p-7 animate-scale pointer-events-auto" style={{ background: 'var(--modal-bg)', boxShadow: 'var(--shadow-pop)' }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <span className="icon-tile"><KeyRound className="w-[18px] h-[18px]" /></span>
              <div>
                <h2 id="reset-title" className="text-[18px] font-bold">Reset password</h2>
                <p className="text-[13px] muted m-0">For <span className="mono">{user.username}</span></p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          {error && <div className="rounded-xl px-4 py-3 mb-4 text-[13px] tone-danger">{error}</div>}
          <label className="field-label" htmlFor="reset-password">New password</label>
          <PasswordInput id="reset-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          <button type="submit" disabled={saving} className="btn btn-primary btn-lg w-full mt-5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default function Users() {
  const { isAdmin, user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      if (res.success) setUsers(res.data);
    } catch (err) {
      toast({ type: 'error', title: 'Could not load users', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const createUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      const res = await api.post('/users', {
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password
      });
      toast({ type: 'success', title: 'User created', message: `${res.data.username} can now sign in.` });
      setForm({ name: '', username: '', password: '' });
      loadUsers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (u) => {
    setTogglingId(u.id);
    try {
      await api.patch(`/users/${u.id}/active`, { isActive: !u.isActive });
      toast({ type: 'success', title: u.isActive ? 'User turned off' : 'User turned on', message: u.isActive ? `${u.username} can no longer sign in.` : `${u.username} can sign in again.` });
      loadUsers();
    } catch (err) {
      toast({ type: 'error', title: 'Could not update user', message: err.message });
    } finally {
      setTogglingId(null);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="System"
        title="Users"
        subtitle="Create sign-ins for your team. Users get the full dashboard; only the admin can manage users."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Create user */}
        <section className="card card-glow overflow-hidden xl:order-2 self-start">
          <div className="card-header">
            <div className="card-title">
              <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><UserPlus className="w-4 h-4" /></span>
              Create user
            </div>
          </div>
          <form onSubmit={createUser} className="p-6 space-y-4">
            {formError && <div className="rounded-xl px-4 py-3 text-[13px] tone-danger">{formError}</div>}
            <div>
              <label className="field-label" htmlFor="new-name">Full name <span className="faint font-normal">(optional)</span></label>
              <input id="new-name" className="input" value={form.name} onChange={set('name')} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label className="field-label" htmlFor="new-username">Username</label>
              <input
                id="new-username"
                className="input mono"
                style={{ fontSize: 14 }}
                value={form.username}
                onChange={set('username')}
                placeholder="e.g. priya"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                required
              />
              <div className="text-[11.5px] faint mt-1.5">3–32 characters: letters, numbers, dot, dash or underscore.</div>
            </div>
            <div>
              <label className="field-label" htmlFor="new-password">Password</label>
              <PasswordInput id="new-password" value={form.password} onChange={set('password')} />
            </div>
            <button type="submit" disabled={creating} className="btn btn-primary btn-lg w-full">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creating ? 'Creating…' : 'Create user'}
            </button>
          </form>
        </section>

        {/* User list */}
        <section className="card overflow-hidden xl:col-span-2 xl:order-1">
          <div className="card-header">
            <div>
              <div className="card-title">
                <span className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9 }}><UserCog className="w-4 h-4" /></span>
                Team
              </div>
              <div className="card-subtitle">Everyone who can sign in to this workspace</div>
            </div>
            <span className="pill tone-neutral num">{users.length} users</span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows rows={3} cols={5} />
                ) : users.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState icon={UserCog} title="No users yet" text="Create the first user with the form." /></td></tr>
                ) : (
                  users.map(u => {
                    const admin = u.role === 'ADMIN';
                    return (
                      <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.6 }}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name || u.username || ''} />
                            <div className="min-w-0">
                              <div className="cell-strong truncate">
                                {u.name}{me?.id === u.id && <span className="faint font-normal"> (you)</span>}
                              </div>
                              <div className="mono faint truncate">{u.username || u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {admin
                            ? <span className="pill tone-gold"><ShieldCheck className="w-3.5 h-3.5" /> Admin</span>
                            : <span className="pill tone-iris">User</span>}
                        </td>
                        <td>
                          <span className={`pill ${u.isActive ? 'tone-success' : 'tone-neutral'}`}>
                            <span className="pill-dot" /> {u.isActive ? 'Active' : 'Turned off'}
                          </span>
                        </td>
                        <td className="text-[12.5px] whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                        <td className="text-right whitespace-nowrap">
                          {admin ? (
                            <span className="text-[12px] faint">Managed in server settings</span>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => setResetting(u)} className="btn btn-secondary btn-sm">
                                <KeyRound className="w-3.5 h-3.5" /> Reset password
                              </button>
                              <button
                                onClick={() => toggleActive(u)}
                                disabled={togglingId === u.id}
                                className={`btn btn-sm ${u.isActive ? 'btn-danger-soft' : 'btn-secondary'}`}
                              >
                                {togglingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                                {u.isActive ? 'Turn off' : 'Turn on'}
                              </button>
                            </div>
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

      {resetting && (
        <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onDone={() => setResetting(null)} />
      )}
    </div>
  );
}
