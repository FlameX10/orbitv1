import React from 'react';
import PublicLeadForm from './PublicLeadForm';
import { BrandMark } from '../components/Sidebar';

export default function StandaloneInstantCall() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="orb" style={{ width: 520, height: 520, top: '-18%', left: '-10%', background: 'rgba(139,124,246,0.22)' }} />
      <div className="orb" style={{ width: 420, height: 420, top: '30%', right: '-12%', background: 'rgba(232,196,124,0.1)', animationDelay: '-7s' }} />

      <header className="relative" style={{ borderBottom: '1px solid var(--border)', background: 'var(--header-bg-soft)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-6xl mx-auto px-5 h-[68px] flex items-center gap-3">
          <BrandMark size={36} />
          <div className="leading-tight">
            <div className="font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Orbit</div>
            <div className="text-[11.5px] faint">AI voice qualification</div>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-5 py-10 md:py-14 animate-page">
        <PublicLeadForm />
      </main>
    </div>
  );
}
