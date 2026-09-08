import React, { useState } from 'react';
import { 
  Calculator, 
  DollarSign, 
  TrendingUp, 
  Copy, 
  Check, 
  HelpCircle, 
  Phone, 
  Bot, 
  Cpu, 
  Server, 
  Globe, 
  ShieldCheck,
  Zap,
  ArrowRight,
  Info
} from 'lucide-react';

export default function ClientCosting() {
  // Calculator State
  const [monthlyCalls, setMonthlyCalls] = useState(500);
  const [avgDurationMins, setAvgDurationMins] = useState(3);
  const [region, setRegion] = useState('us'); // 'us' | 'in' | 'global'
  const [copied, setCopied] = useState(false);
  const [targetMargin, setTargetMargin] = useState(60); // 60% profit margin default

  // Rates definition
  const rates = {
    us: { twilio: 0.018, name: 'US / Canada ($0.018/min)' },
    in: { twilio: 0.045, name: 'India Mobile ($0.045/min)' },
    global: { twilio: 0.065, name: 'International Avg ($0.065/min)' }
  };

  const selectedRegion = rates[region];
  const twilioPerMin = selectedRegion.twilio;
  const twilioMediaStreamPerMin = 0.004;
  const elevenLabsPerMin = 0.07; // ElevenLabs Conversational AI Voice
  const openaiPerCall = 0.002; // gpt-4o-mini average prompt/completion per 3 min call
  const hostingMonthlyFixed = 20.00; // PostgreSQL + Express worker on Render/DigitalOcean
  const twilioPhoneNumberMonthly = region === 'us' ? 1.15 : 2.50;

  // Cost calculations
  const totalMinutes = monthlyCalls * avgDurationMins;
  
  const twilioVoiceCost = totalMinutes * twilioPerMin;
  const twilioStreamCost = totalMinutes * twilioMediaStreamPerMin;
  const totalTwilioMonthly = twilioVoiceCost + twilioStreamCost + twilioPhoneNumberMonthly;

  const totalElevenLabsMonthly = totalMinutes * elevenLabsPerMin;
  const totalOpenAIMonthly = monthlyCalls * openaiPerCall;

  const totalRawMonthlyCost = totalTwilioMonthly + totalElevenLabsMonthly + totalOpenAIMonthly + hostingMonthlyFixed;
  const rawCostPerCall = monthlyCalls > 0 ? totalRawMonthlyCost / monthlyCalls : 0;
  const rawCostPerMin = totalMinutes > 0 ? totalRawMonthlyCost / totalMinutes : 0;

  // Client billing recommendations
  const clientPricePerCall = rawCostPerCall / (1 - targetMargin / 100);
  const totalClientBillMonthly = clientPricePerCall * monthlyCalls;
  const estimatedMonthlyProfit = totalClientBillMonthly - totalRawMonthlyCost;

  const generateProposalText = () => {
    return `========================================================
VEDRON AI VOICE AGENT - API & CLIENT COSTING PROPOSAL
========================================================
Estimated Volume: ${monthlyCalls.toLocaleString()} calls / month
Average Call Duration: ${avgDurationMins} minutes (${totalMinutes.toLocaleString()} total voice minutes)
Target Region: ${selectedRegion.name}

1. RAW API & INFRASTRUCTURE COST BREAKDOWN (AT COST)
--------------------------------------------------------
- Twilio Telephony (Outbound + WebStreams + Phone Number): $${totalTwilioMonthly.toFixed(2)}/mo ($${(twilioPerMin + twilioMediaStreamPerMin).toFixed(3)}/min)
- ElevenLabs Conversational Voice Synthesis: $${totalElevenLabsMonthly.toFixed(2)}/mo ($${elevenLabsPerMin.toFixed(2)}/min)
- OpenAI LLM Reasoning (gpt-4o-mini): $${totalOpenAIMonthly.toFixed(2)}/mo (~$${openaiPerCall.toFixed(3)}/call)
- Dedicated PostgreSQL & Node.js Queue Hosting: $${hostingMonthlyFixed.toFixed(2)}/mo

TOTAL RAW API OPERATIONAL EXPENSE: $${totalRawMonthlyCost.toFixed(2)} / month
TOTAL RAW COST PER CALL: $${rawCostPerCall.toFixed(2)} / call

2. RECOMMENDED CLIENT PRICING & RETAINER PACKAGE
--------------------------------------------------------
Option A: Pay-Per-Call ($${clientPricePerCall.toFixed(2)} / call)
- Total Monthly Estimated Investment: $${totalClientBillMonthly.toFixed(2)}
- Net Profit Margin: ${targetMargin}% ($${estimatedMonthlyProfit.toFixed(2)} monthly profit)

Option B: Monthly All-Inclusive Retainer
- Setup & Licensing: $299 / month base
- Included Calls: ${monthlyCalls} qualification calls per month
- Overage Rate: $${(clientPricePerCall * 1.1).toFixed(2)} per call beyond package

Generated via Vedron Voice Engine - Zero-Redis Architecture
========================================================`;
  };

  const handleCopyProposal = () => {
    navigator.clipboard.writeText(generateProposalText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> CLIENT PROPOSAL & COST CALCULATOR
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              API Costing & Client Unit Economics
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Calculate exact API operational costs for Twilio, ElevenLabs, OpenAI, and PostgreSQL infrastructure. Generate instant transparent quotations and billing margins for your enterprise clients.
            </p>
          </div>
          <button
            onClick={handleCopyProposal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Proposal Copied!' : 'Copy Client Pitch Proposal'}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Interactive Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Calculator className="w-5 h-5 text-cyan-400" />
              Volume & Regional Inputs
            </h2>

            {/* Slider 1: Monthly Calls */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium">Estimated Monthly Leads / Calls</label>
                <span className="font-mono font-bold text-cyan-400 text-base">{monthlyCalls.toLocaleString()} calls</span>
              </div>
              <input
                type="range"
                min="50"
                max="10000"
                step="50"
                value={monthlyCalls}
                onChange={(e) => setMonthlyCalls(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>50 calls</span>
                <span>2,500</span>
                <span>5,000</span>
                <span>10,000 calls</span>
              </div>
            </div>

            {/* Slider 2: Average Duration */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium">Average Call Duration</label>
                <span className="font-mono font-bold text-emerald-400 text-base">{avgDurationMins} minutes</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={avgDurationMins}
                onChange={(e) => setAvgDurationMins(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>1 min (Quick)</span>
                <span>3 mins (Standard BANT)</span>
                <span>5 mins</span>
                <span>10 mins</span>
              </div>
            </div>

            {/* Region Selector */}
            <div className="space-y-2">
              <label className="text-slate-300 font-medium text-sm flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-400" /> Destination Calling Region
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'us', label: 'US / Canada', sub: '$0.018/min' },
                  { id: 'in', label: 'India', sub: '$0.045/min' },
                  { id: 'global', label: 'Global Avg', sub: '$0.065/min' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setRegion(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      region === item.id
                        ? 'border-cyan-500 bg-cyan-950/40 text-white shadow-md shadow-cyan-500/10'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white">{item.label}</div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Margin Slider */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between items-center text-sm">
                <label className="text-slate-300 font-medium flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-purple-400" /> Client Profit Margin Markup
                </label>
                <span className="font-mono font-bold text-purple-400 text-base">{targetMargin}% Margin</span>
              </div>
              <input
                type="range"
                min="20"
                max="80"
                step="5"
                value={targetMargin}
                onChange={(e) => setTargetMargin(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>20% (Low)</span>
                <span>50% (Standard)</span>
                <span>80% (Premium SaaS)</span>
              </div>
            </div>

          </div>

          {/* Quick Summary Info Box */}
          <div className="p-5 rounded-2xl glass-card border border-blue-500/20 bg-blue-950/20 text-sm space-y-2">
            <div className="flex items-center gap-2 text-blue-300 font-semibold">
              <Info className="w-4 h-4 shrink-0 text-blue-400" />
              <span>Twilio Account Model Requirement</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              No mandatory high-tier monthly plan is required. Twilio operates strictly on a **Pay-As-You-Go** basis. You only need a standard account with an initial **$20 deposit** and 1 Voice Phone Number ($1.15/mo).
            </p>
          </div>
        </div>

        {/* Right Column: Calculations & Breakdown (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Top Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/80">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider block">Raw Cost / Call</span>
              <div className="text-2xl font-black text-white font-mono mt-1">
                ${rawCostPerCall.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                ${rawCostPerMin.toFixed(3)} / min
              </span>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/20">
              <span className="text-cyan-400 text-xs font-medium uppercase tracking-wider block">Total Raw API Expense</span>
              <div className="text-2xl font-black text-cyan-300 font-mono mt-1">
                ${totalRawMonthlyCost.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                {totalMinutes.toLocaleString()} voice mins
              </span>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
              <span className="text-emerald-400 text-xs font-medium uppercase tracking-wider block">Client Billing Quote</span>
              <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
                ${clientPricePerCall.toFixed(2)}
              </div>
              <span className="text-[11px] text-emerald-400/80 font-mono mt-1 block">
                ${estimatedMonthlyProfit.toFixed(0)} profit/mo ({targetMargin}%)
              </span>
            </div>
          </div>

          {/* Breakdown Table by API Service */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Line-Item API Expense Breakdown
              </h3>
              <span className="text-xs font-mono text-slate-400">Monthly Expense</span>
            </div>

            <div className="divide-y divide-slate-800 text-sm">
              
              {/* Twilio */}
              <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Twilio Telephony & Media Streams</div>
                    <div className="text-xs text-slate-400">
                      Outbound Voice (${twilioPerMin}/min) + Streams ($0.004/min) + Phone Number ($${twilioPhoneNumberMonthly}/mo)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-white">${totalTwilioMonthly.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-500">
                    {((totalTwilioMonthly / totalRawMonthlyCost) * 100).toFixed(0)}% of total
                  </div>
                </div>
              </div>

              {/* ElevenLabs */}
              <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">ElevenLabs Conversational AI Agent</div>
                    <div className="text-xs text-slate-400">
                      Voice Synthesis & Conversational Agent ($0.070/min avg)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-white">${totalElevenLabsMonthly.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-500">
                    {((totalElevenLabsMonthly / totalRawMonthlyCost) * 100).toFixed(0)}% of total
                  </div>
                </div>
              </div>

              {/* OpenAI LLM */}
              <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">OpenAI LLM Reasoning (gpt-4o-mini)</div>
                    <div className="text-xs text-slate-400">
                      Turn-by-turn BANT reasoning (~$0.002/call prompt & completion tokens)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-white">${totalOpenAIMonthly.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-500">
                    {((totalOpenAIMonthly / totalRawMonthlyCost) * 100).toFixed(0)}% of total
                  </div>
                </div>
              </div>

              {/* PostgreSQL & Hosting */}
              <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">PostgreSQL & Node Worker Server</div>
                    <div className="text-xs text-slate-400">
                      Managed PostgreSQL DB + pg-boss queue runner (Fixed monthly baseline)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-white">${hostingMonthlyFixed.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-500">Fixed Overhead</div>
                </div>
              </div>

            </div>
          </div>

          {/* Client Packages Recommendation Box */}
          <div className="glass-panel p-6 rounded-2xl border border-purple-500/20 bg-purple-950/10 space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              Recommended Client Pricing Options to Quote
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-2">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono font-bold">OPTION A: PAY-PER-CALL</span>
                <div className="text-xl font-extrabold text-white font-mono">
                  ${clientPricePerCall.toFixed(2)} <span className="text-xs font-normal text-slate-400">/ qualified call</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Charge your client per initiated lead call. Simple, risk-free for client with a predictable {targetMargin}% margin for your business.
                </p>
              </div>

              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono font-bold">OPTION B: MONTHLY RETAINER</span>
                <div className="text-xl font-extrabold text-white font-mono">
                  ${(totalClientBillMonthly + 150).toFixed(0)} <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Includes {monthlyCalls.toLocaleString()} qualified lead calls per month + $150 management fee. Overage charged at ${(clientPricePerCall * 1.1).toFixed(2)}/call.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
