import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Menu, ChevronRight, Sun, Moon } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { NAV_SECTIONS } from './Sidebar';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const ALL_ITEMS = NAV_SECTIONS.flatMap(section => section.items.map(item => ({ ...item, section: section.label })));

function useCrumbs(pathname) {
  const match = ALL_ITEMS
    .filter(item => (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!match) return { section: 'Workspace', page: 'Overview', detail: null };
  const isDetail = match.path !== '/' && pathname.length > match.path.length + 1;
  return { section: match.section, page: match.label, detail: isDetail ? 'Details' : null };
}

export default function Header({ onMenu }) {
  const { connected } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const crumbs = useCrumbs(pathname);
  const searchRef = useRef(null);

  // "/" or Ctrl/Cmd+K focuses search
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/leads?q=${encodeURIComponent(q)}` : '/leads');
    searchRef.current?.blur();
  };

  return (
    <header
      className="sticky top-0 z-30 h-[72px] flex items-center gap-4 px-5 md:px-8"
      style={{
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(18px) saturate(140%)'
      }}
    >
      <button className="btn btn-secondary btn-icon lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumbs */}
      <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
        <span className="faint">{crumbs.section}</span>
        <ChevronRight className="w-3.5 h-3.5 faint" />
        <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{crumbs.page}</span>
        {crumbs.detail && (
          <>
            <ChevronRight className="w-3.5 h-3.5 faint" />
            <span className="muted">{crumbs.detail}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Search */}
      <form onSubmit={submitSearch} className="relative hidden sm:block w-[min(340px,40vw)]">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 faint" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search leads…"
          className="input input-icon pr-16"
          style={{ height: 40 }}
          aria-label="Search leads"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 chip" style={{ height: 20, fontSize: 10.5 }}>{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
      </form>

      {/* Realtime status */}
      <div
        className="hidden md:flex items-center gap-2 h-10 px-3.5 rounded-xl text-[12.5px] font-medium"
        style={{ background: 'var(--fill-03)', border: '1px solid var(--border)' }}
        title={connected ? 'Realtime updates connected' : 'Reconnecting to realtime updates'}
      >
        <span className={`live-dot ${connected ? '' : 'live-dot-warning'}`} />
        <span className="muted">{connected ? 'Live' : 'Reconnecting'}</span>
      </div>

      <button
        onClick={toggleTheme}
        className="btn btn-secondary btn-icon theme-toggle"
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        <span key={theme} className="theme-toggle-icon">
          {theme === 'light' ? <Moon className="w-[18px] h-[18px]" /> : <Sun className="w-[18px] h-[18px]" />}
        </span>
      </button>
    </header>
  );
}
