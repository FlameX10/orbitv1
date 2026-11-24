import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext({ toast: () => {} });

const ICONS = {
  success: { Icon: CheckCircle2, tone: 'var(--success)' },
  error: { Icon: AlertTriangle, tone: 'var(--danger)' },
  info: { Icon: Info, tone: 'var(--iris)' }
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(({ type = 'info', title, message, duration = 4200 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(list => [...list.slice(-3), { id, type, title, message }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3 w-[min(380px,calc(100vw-40px))]" role="status" aria-live="polite">
        {toasts.map(t => {
          const { Icon, tone } = ICONS[t.type] || ICONS.info;
          return (
            <div key={t.id} className="card animate-toast flex items-start gap-3 p-4" style={{ boxShadow: 'var(--shadow-pop)', background: 'rgba(24,27,38,0.92)' }}>
              <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: tone }} />
              <div className="min-w-0 flex-1">
                {t.title && <div className="font-semibold text-[13.5px]" style={{ color: 'var(--text)' }}>{t.title}</div>}
                {t.message && <div className="text-[12.5px] muted mt-0.5 break-words">{t.message}</div>}
              </div>
              <button onClick={() => dismiss(t.id)} className="btn-ghost rounded-lg p-1" aria-label="Dismiss notification">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
