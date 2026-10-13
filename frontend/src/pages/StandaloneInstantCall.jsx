import React from 'react';
import { Zap } from 'lucide-react';
import PublicLeadForm from './PublicLeadForm';

export default function StandaloneInstantCall() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="font-extrabold tracking-tight">Orbit Voice</div>
            <div className="text-xs text-slate-400">AI voice qualification</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <PublicLeadForm />
      </main>
    </div>
  );
}
