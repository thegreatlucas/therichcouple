'use client';

import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; type: ToastType };

// Singleton externo — permite chamar toast.success() de qualquer lugar sem contexto
let _addToast: (msg: string, type: ToastType) => void = () => {};

export const toast = {
  success: (msg: string) => _addToast(msg, 'success'),
  error: (msg: string) => _addToast(msg, 'error'),
  info: (msg: string) => _addToast(msg, 'info'),
};

const COLORS: Record<ToastType, string> = {
  success: '#2ecc71',
  error:   '#e74c3c',
  info:    '#3498db',
};

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error:   '❌',
  info:    '💡',
};

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // Conecta o singleton ao estado local
  useEffect(() => {
    _addToast = add;
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      right: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 340,
      width: '90vw',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            backgroundColor: COLORS[t.type],
            color: 'white',
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'slideIn 0.2s ease',
          }}
        >
          <span style={{ fontSize: 16 }}>{ICONS[t.type]}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(i => i.id !== t.id))}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: 16,
              opacity: 0.7,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}