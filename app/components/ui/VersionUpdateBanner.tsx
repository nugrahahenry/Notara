'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NaliraBrand } from '../brand/NaliraBrand';

// ─────────────────────────────────────────────────────────────
// VersionUpdateBanner — Deteksi Deployment Vercel Baru
//
// Strategy: Check on window focus (tidak perlu polling timer).
// Setiap kali user balik ke tab Nalira, kita fetch /api/version
// dan compare buildId. Kalau beda → ada versi baru di Vercel.
//
// Di local dev: buildId selalu "dev-development", tidak ada notif.
// ─────────────────────────────────────────────────────────────

const CHECK_DELAY_MS = 2000; // delay setelah window focus sebelum check

export function VersionUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const initialBuildId = useRef<string | null>(null);
  const hasCheckedOnce = useRef(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch version dari server
  const checkForUpdate = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      // First check — simpan buildId awal sebagai baseline
      if (!hasCheckedOnce.current) {
        initialBuildId.current = data.buildId;
        hasCheckedOnce.current = true;
        return;
      }

      // Dev mode — jangan tampilkan notif
      if (data.buildId.startsWith('dev-')) return;

      // Bandingkan dengan buildId saat halaman pertama dibuka
      if (
        initialBuildId.current &&
        data.buildId !== initialBuildId.current &&
        !isDismissed
      ) {
        setNewVersion(data.version);
        setUpdateAvailable(true);
        setTimeout(() => setIsVisible(true), 100);
      }
    } catch {
      // Silently fail — jangan ganggu UX
    }
  }, [isDismissed]);

  // Check saat mount (untuk capture baseline buildId)
  useEffect(() => {
    const initialCheck = setTimeout(() => void checkForUpdate(), 0);
    return () => clearTimeout(initialCheck);
  }, [checkForUpdate]);

  // Check saat window mendapat fokus kembali (user balik ke tab)
  useEffect(() => {
    const handleFocus = () => {
      if (isDismissed) return;
      // Delay sedikit agar tidak mengganggu interaksi pertama
      checkTimeoutRef.current = setTimeout(checkForUpdate, CHECK_DELAY_MS);
    };

    const handleBlur = () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [checkForUpdate, isDismissed]);

  const handleReload = () => {
    setIsReloading(true);
    setTimeout(() => window.location.reload(), 600);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setUpdateAvailable(false);
      setIsDismissed(true);
    }, 500);
  };

  if (!updateAvailable) return null;

  return (
    <>
      {/* ─── Collapsed pill (after user collapses) ─── */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99998,
            background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
            border: 'none',
            borderRadius: '99px',
            padding: '8px 16px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
            animation: 'vub-float 3s ease-in-out infinite',
          }}
        >
          <span style={{ animation: 'vub-sparkle 1.5s ease-in-out infinite' }}>✨</span>
          Update tersedia
        </button>
      )}

      {/* ─── Main Banner ─── */}
      {!isCollapsed && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: `translateX(-50%) translateY(${isVisible ? '0' : '120%'})`,
            zIndex: 99998,
            opacity: isVisible ? 1 : 0,
            transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease',
            width: 'calc(100% - 48px)',
            maxWidth: '480px',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(17, 11, 45, 0.97) 0%, rgba(12, 8, 35, 0.97) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '20px',
              padding: '0',
              boxShadow: '0 0 60px rgba(124,58,237,0.25), 0 20px 60px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Animated top accent bar */}
            <div style={{
              height: '3px',
              background: 'linear-gradient(90deg, #8B5CF6, #6366F1, #A855F7, #8B5CF6)',
              backgroundSize: '200% 100%',
              animation: 'vub-shimmer 2s linear infinite',
            }} />

            {/* Background glow orb */}
            <div style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{ padding: '16px 20px 18px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                {/* Animated logo */}
                <div style={{
                  flexShrink: 0,
                  animation: 'vub-logo-pulse 2.5s ease-in-out infinite',
                }}>
                  <NaliraBrand variant="icon" size={36} animated motionState="thinking" showGlow />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '3px',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#F8FAFC',
                      letterSpacing: '-0.01em',
                    }}>
                      Nalira {newVersion} tersedia!
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#A78BFA',
                      background: 'rgba(139,92,246,0.15)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: '99px',
                      padding: '2px 8px',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}>
                      Baru
                    </span>
                  </div>
                  <p style={{
                    fontSize: '12px',
                    color: 'rgba(248,250,252,0.55)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    Pembaruan baru sudah deploy di server. Muat ulang untuk pengalaman terbaik.
                  </p>
                </div>

                {/* Collapse button */}
                <button
                  onClick={() => setIsCollapsed(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(248,250,252,0.3)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    flexShrink: 0,
                    transition: 'color 0.2s',
                    lineHeight: 1,
                    fontSize: '16px',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.3)')}
                  title="Ciutkan"
                >
                  ╌
                </button>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  style={{
                    flex: 1,
                    background: isReloading
                      ? 'rgba(139,92,246,0.5)'
                      : 'linear-gradient(135deg, #7C3AED, #6366F1)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '10px 16px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isReloading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => {
                    if (!isReloading) {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(124,58,237,0.55)';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(124,58,237,0.4)';
                  }}
                >
                  {isReloading ? (
                    <>
                      <span style={{ animation: 'vub-spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                      Memuat...
                    </>
                  ) : (
                    <> ✦ Perbarui Sekarang</>
                  )}
                </button>

                <button
                  onClick={handleDismiss}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    color: 'rgba(248,250,252,0.5)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                >
                  Nanti Saja
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes vub-shimmer {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes vub-float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-4px); }
        }
        @keyframes vub-logo-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(139,92,246,0.3)); }
          50% { filter: drop-shadow(0 0 18px rgba(139,92,246,0.7)); }
        }
        @keyframes vub-sparkle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.2) rotate(15deg); }
        }
        @keyframes vub-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

export default VersionUpdateBanner;
