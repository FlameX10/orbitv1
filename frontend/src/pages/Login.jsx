import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandMark } from '../components/Sidebar';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && user) return <Navigate to="/" replace />;

  return (
    <div className="relative min-h-screen flex items-center justify-center p-5 overflow-hidden">
      <div className="orb" style={{ width: 520, height: 520, top: '-12%', left: '-8%', background: 'rgba(139,124,246,0.28)' }} />
      <div className="orb" style={{ width: 420, height: 420, bottom: '-14%', right: '-6%', background: 'rgba(232,196,124,0.14)', animationDelay: '-7s' }} />

      <div className="relative w-full max-w-[420px] animate-scale">
        <div className="text-center mb-8">
          <div className="inline-flex mb-5"><BrandMark size={56} /></div>
          <h1 className="text-[28px] font-bold tracking-tight"><span className="text-gradient">Welcome to Orbit</span></h1>
          <p className="text-[14px] muted mt-2">Sign in to your AI voice qualification workspace</p>
        </div>

        <div className="card card-glow p-7" style={{ boxShadow: 'var(--shadow-pop)' }}>
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 text-[13px] tone-danger" style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="login-username">Username</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                <input
                  id="login-username"
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="input input-icon"
                  placeholder="Your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="login-password">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input input-icon"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] faint mt-6">Secured workspace · Orbit AI Voice</p>
      </div>
    </div>
  );
}
