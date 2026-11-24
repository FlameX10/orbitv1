import React from 'react';
import { Bot, User, Info, MessageSquareText } from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState } from './ui';

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
      <EmptyState
        icon={MessageSquareText}
        title="No transcript yet"
        text="The conversation appears here once the call is underway or the recording is processed."
      />
    );
  }

  return (
    <div className="transcript-viewer space-y-4 max-h-[620px] overflow-y-auto pr-2 scroll-thin">
      {messages.map((msg, index) => {
        const { isAI, text } = resolveSpeaker(msg);
        const isSystem = msg.role === 'SYSTEM' || msg.role === 'TOOL';
        const timestampFormatted = msg.timestamp ? format(new Date(msg.timestamp), 'HH:mm:ss') : '--:--';

        if (isSystem) {
          return (
            <div key={msg.id || index} className="flex justify-center animate-fade">
              <span className="pill tone-neutral" style={{ height: 'auto', padding: '6px 12px' }}>
                <Info className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                {msg.content}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id || index}
            className={`flex gap-3 animate-fade ${isAI ? 'justify-start' : 'justify-end'}`}
            style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
          >
            {isAI && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-5"
                style={{ background: 'linear-gradient(140deg, #a99dff, #6f5cf2)', boxShadow: '0 8px 18px -8px var(--iris-glow)' }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}

            <div className={`max-w-[78%] ${isAI ? '' : 'items-end'} flex flex-col`}>
              <div className={`transcript-meta flex items-center gap-2 mb-1.5 ${isAI ? '' : 'justify-end'}`}>
                <span>{isAI ? 'AI Agent' : 'Lead'}</span>
                <span className="faint">·</span>
                <span className="tabular-nums" style={{ letterSpacing: 0 }}>{timestampFormatted}</span>
              </div>
              <div className={`transcript-bubble rounded-2xl px-4 py-3 ${isAI ? 'transcript-bubble-ai' : 'transcript-bubble-human'}`}>
                <p className="transcript-content whitespace-pre-wrap m-0">{text}</p>
              </div>
            </div>

            {!isAI && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-5"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)' }}
              >
                <User className="w-4 h-4 muted" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
