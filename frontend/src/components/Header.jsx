import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, PhoneCall, Wifi, WifiOff, Search, Calculator } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import NewLeadModal from './NewLeadModal';

export default function Header() {
  const { connected } = useSocket();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <header className="h-16 glass-panel border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="relative w-72">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search leads, calls, phone..."
          className="w-full pl-9 pr-4 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        {/* Real-time Status */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-slate-900 border border-slate-800">
          {connected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Live SSE/WS</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400">Reconnecting</span>
            </>
          )}
        </div>

        {/* Costing Calculator Link */}
        <Link
          to="/costing"
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium rounded-lg text-xs transition-colors"
        >
          <Calculator className="w-3.5 h-3.5 text-purple-400" />
          <span>Client Costing</span>
        </Link>

        {/* Lead Form Simulator Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-sm shadow-md shadow-cyan-500/20 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Simulate Lead</span>
        </button>
      </div>

      <NewLeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </header>
  );
}
