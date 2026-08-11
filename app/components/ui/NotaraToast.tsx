'use client';

import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

/* ════════════════════════════════════════════════════════════
   NotaraToast — Premium Reusable Toast Notification System
   
   Features:
   - Slide-in animation from bottom
   - Auto-dismiss with progress bar
   - Stack multiple toasts
   - Success/Error/Info/Warning variants
   - Nalira-branded styling with glassmorphism
   - Accessible: role="alert", aria-live
   ════════════════════════════════════════════════════════════ */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
};

type ToastContextType = {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within NotaraToastProvider');
  return ctx;
}

/* ── Single Toast Item ── */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = toast.duration ?? 4500;
  const startTime = useRef(Date.now());

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [toast.id, onRemove]);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, duration);
    
    // Animate progress bar
    const frame = () => {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining > 0) requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [duration, handleDismiss]);

  const config = {
    success: {
      icon: '✓',
      iconBg: 'linear-gradient(135deg, #10B981, #059669)',
      border: 'rgba(16, 185, 129, 0.25)',
      progressColor: '#10B981',
      glow: 'rgba(16, 185, 129, 0.15)',
    },
    error: {
      icon: '✕',
      iconBg: 'linear-gradient(135deg, #EF4444, #DC2626)',
      border: 'rgba(239, 68, 68, 0.25)',
      progressColor: '#EF4444',
      glow: 'rgba(239, 68, 68, 0.15)',
    },
    info: {
      icon: 'ℹ',
      iconBg: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
      border: 'rgba(139, 92, 246, 0.25)',
      progressColor: '#8B5CF6',
      glow: 'rgba(139, 92, 246, 0.15)',
    },
    warning: {
      icon: '⚠',
      iconBg: 'linear-gradient(135deg, #F59E0B, #D97706)',
      border: 'rgba(245, 158, 11, 0.25)',
      progressColor: '#F59E0B',
      glow: 'rgba(245, 158, 11, 0.15)',
    },
  }[toast.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px 10px',
        background: 'rgba(17, 17, 30, 0.92)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        border: `1px solid ${config.border}`,
        borderRadius: '14px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${config.glow}`,
        minWidth: '320px',
        maxWidth: '420px',
        position: 'relative',
        overflow: 'hidden',
        animation: isExiting
          ? 'notara-toast-exit 0.3s ease-in forwards'
          : 'notara-toast-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        cursor: 'pointer',
      }}
      onClick={handleDismiss}
    >
      {/* Icon */}
      <div style={{
        width: '30px',
        height: '30px',
        borderRadius: '9px',
        background: config.iconBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        fontWeight: 800,
        color: 'white',
        flexShrink: 0,
        boxShadow: `0 2px 8px ${config.glow}`,
      }}>
        {config.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: '#F8FAFC',
          lineHeight: 1.3,
          margin: 0,
        }}>
          {toast.title}
        </p>
        {toast.message && (
          <p style={{
            fontSize: '12px',
            color: '#A1A1AA',
            lineHeight: 1.4,
            margin: '3px 0 0',
          }}>
            {toast.message}
          </p>
        )}
      </div>

      {/* Close hint */}
      <div style={{
        fontSize: '12px',
        color: '#52525B',
        flexShrink: 0,
        marginTop: '2px',
      }}>
        ✕
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: 'rgba(255,255,255,0.04)',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${config.progressColor}, ${config.progressColor}88)`,
          borderRadius: '0 2px 2px 0',
          transition: 'width 0.1s linear',
        }} />
      </div>
    </div>
  );
}

/* ── Toast Provider & Container ── */
export function NotaraToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Toast Container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div
          aria-label="Notifikasi"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '10px',
            pointerEvents: 'none',
          }}
        >
          {toasts.slice(-5).map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={toast} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}

      {/* Injected animation keyframes */}
      <style>{`
        @keyframes notara-toast-enter {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes notara-toast-exit {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
