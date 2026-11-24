import React from 'react';
import { Bot, User, Clock, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

const AGENT_SPEAKERS = ['ai_agent', 'ai agent', 'agent', 'ai', 'assistant', 'bot'];
const CUSTOMER_SPEAKERS = ['customer', 'user', 'human', 'caller', 'lead'];

// Plivo transcripts arrive as "[Ai_Agent] text" / "[Customer] text" and may all be
// stored with the same role, so the speaker tag in the text decides the side.
function resolveSpeaker(msg) {
  const content = typeof msg.content === 'string' ? msg.content : '';
  const match = content.match(/^\s*\[([^\]]+)\]\s*/);
  if (match) {
    const tag = match[1].trim().toLowerCase();
    const text = content.slice(match[0].length);
    if (AGENT_SPEAKERS.includes(tag)) return { isAI: true, text };
    if (CUSTOMER_SPEAKERS.includes(tag)) return { isAI: false, text };
  }
  return { isAI: msg.role === 'AI', text: content };
}

export default function TranscriptViewer({ messages = [] }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="p-8 text-center glass-panel rounded-xl border border-slate-800 text-slate-500 text-sm">
        No conversation transcript records recorded for this attempt yet.
      </div>
    );
  }

  return (
    <div className="transcript-viewer space-y-4 max-h-[500px] overflow-y-auto pr-2">
      {messages.map((msg, index) => {
        const { isAI, text } = resolveSpeaker(msg);
        const isSystem = msg.role === 'SYSTEM' || msg.role === 'TOOL';
        const timestampFormatted = msg.timestamp ? format(new Date(msg.timestamp), 'HH:mm:ss') : '--:--';

        if (isSystem) {
          return (
            <div key={msg.id || index} className="flex justify-center my-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                {msg.content}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id || index}
            className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
          >
            {isAI && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-500/20 shrink-0">
                <Bot className="w-4 h-4 text-slate-950" />
              </div>
            )}

            <div className={`transcript-bubble ${isAI ? 'transcript-bubble-ai' : 'transcript-bubble-human'} max-w-[75%] rounded-2xl p-4 shadow-lg ${
              isAI 
                ? 'bg-slate-900 border border-cyan-900/40 text-slate-100 rounded-tl-none' 
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-none'
            }`}>
              <div className="transcript-meta flex items-center justify-between gap-4 mb-2">
                <span className="font-semibold uppercase tracking-wider">{isAI ? 'AI Agent' : 'Human Lead'}</span>
                <span className="font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timestampFormatted}
                </span>
              </div>
              <p className="transcript-content whitespace-pre-wrap">{text}</p>
            </div>

            {!isAI && (
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
