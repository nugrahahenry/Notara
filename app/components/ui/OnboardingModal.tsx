'use client';

import { useState, useEffect, useRef } from 'react';
import { NotaraLogo } from '../brand/NotaraLogo';

// ─────────────────────────────────────────────────────────────
// OnboardingModal — Survei Onboarding Interaktif Notara
// Multi-step wizard dengan desain glassmorphism premium
// Step 1: Peran → Step 2: Kampus & Jurusan → Step 3: Sumber Info → Step 4: AI Sync
// ─────────────────────────────────────────────────────────────

interface OnboardingData {
  role: string;
  university: string;
  major: string;
  find_source: string;
}

interface OnboardingModalProps {
  userName: string;
  onComplete: (data: OnboardingData) => void;
}

const ROLES = [
  { id: 'mahasiswa', emoji: '🎓', label: 'Mahasiswa', desc: 'Pelajar aktif di perguruan tinggi', color: '#8B5CF6', bg: 'from-violet-500/20 to-purple-600/20', border: 'border-violet-500/40' },
  { id: 'dosen', emoji: '🏫', label: 'Dosen / Pengajar', desc: 'Tenaga pendidik & peneliti', color: '#3B82F6', bg: 'from-blue-500/20 to-indigo-600/20', border: 'border-blue-500/40' },
  { id: 'profesional', emoji: '💼', label: 'Profesional', desc: 'Bekerja di industri & bisnis', color: '#10B981', bg: 'from-emerald-500/20 to-teal-600/20', border: 'border-emerald-500/40' },
  { id: 'lainnya', emoji: '🌟', label: 'Lainnya', desc: 'Pelajar mandiri & penasaran', color: '#F59E0B', bg: 'from-amber-500/20 to-orange-600/20', border: 'border-amber-500/40' },
];

const SOURCES = [
  { id: 'tiktok', emoji: '📱', label: 'TikTok', color: '#00F2EA', bg: 'from-[#00F2EA]/15 to-[#FF0050]/15', border: 'border-[#00F2EA]/40' },
  { id: 'instagram', emoji: '📸', label: 'Instagram', color: '#E1306C', bg: 'from-[#F77737]/15 via-[#E1306C]/15 to-[#833AB4]/15', border: 'border-[#E1306C]/40' },
  { id: 'google', emoji: '🔍', label: 'Google Search', color: '#4285F4', bg: 'from-[#4285F4]/15 to-[#34A853]/15', border: 'border-[#4285F4]/40' },
  { id: 'teman', emoji: '🤝', label: 'Rekomendasi Teman', color: '#A855F7', bg: 'from-[#A855F7]/15 to-[#7C3AED]/15', border: 'border-[#A855F7]/40' },
  { id: 'twitter', emoji: '🐦', label: 'Twitter / X', color: '#1DA1F2', bg: 'from-[#1DA1F2]/15 to-[#0A8FDE]/15', border: 'border-[#1DA1F2]/40' },
  { id: 'youtube', emoji: '▶️', label: 'YouTube', color: '#FF0000', bg: 'from-[#FF0000]/15 to-[#CC0000]/15', border: 'border-[#FF0000]/40' },
];

const AI_SYNCING_STEPS = [
  '🧠 Memetakan pola belajar Anda...',
  '🔗 Menghubungkan Neural Nexus...',
  '✨ Mengkalibrasi asisten AI...',
  '🎯 Personalisasi siap!',
];

export function OnboardingModal({ userName, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({ role: '', university: '', major: '', find_source: '' });
  const [aiStep, setAiStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const universityRef = useRef<HTMLInputElement>(null);

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Focus university input on step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => universityRef.current?.focus(), 400);
    }
  }, [step]);

  // AI syncing animation
  useEffect(() => {
    if (step !== 4) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setAiStep(idx);
      if (idx >= AI_SYNCING_STEPS.length) {
        clearInterval(interval);
        // Complete after last step animation
        setTimeout(() => {
          setIsExiting(true);
          setTimeout(() => onComplete(data), 600);
        }, 800);
      }
    }, 900);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleRoleSelect = (roleId: string) => {
    setData(prev => ({ ...prev, role: roleId }));
    setTimeout(() => setStep(2), 280);
  };

  const handleSourceSelect = (sourceId: string) => {
    setData(prev => ({ ...prev, find_source: sourceId }));
    setTimeout(() => setStep(4), 200);
  };

  const handleStep2Next = () => {
    if (!data.university.trim()) {
      universityRef.current?.focus();
      return;
    }
    setStep(3);
  };

  const progressPct = ((step - 1) / 3) * 100;
  const firstName = userName?.split(' ')[0] || 'Teman';

  return (
    <div
      className="onboarding-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(6, 4, 18, 0.88)',
        backdropFilter: 'blur(12px)',
        opacity: isVisible && !isExiting ? 1 : 0,
        transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: '1rem',
      }}
    >
      {/* Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(20, 13, 50, 0.97) 0%, rgba(14, 10, 40, 0.97) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '560px',
          padding: '2.5rem',
          boxShadow: '0 0 80px rgba(139, 92, 246, 0.15), 0 32px 64px rgba(0,0,0,0.6)',
          transform: isVisible && !isExiting ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decorative orbs */}
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-40px', left: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* ─── Header ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <NotaraLogo variant="icon" size={36} animated motionState={step === 4 ? 'thinking' : 'idle'} showGlow />
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', color: '#A78BFA', textTransform: 'uppercase' }}>Selamat Datang</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F8FAFC', lineHeight: 1.2 }}>Halo, {firstName}! 👋</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(248,250,252,0.4)', fontWeight: 500 }}>
            {step < 4 ? `${step} / 3` : '✦'}
          </div>
        </div>

        {/* ─── Progress Bar ─── */}
        {step < 4 && (
          <div style={{ height: '3px', background: 'rgba(139,92,246,0.15)', borderRadius: '99px', marginBottom: '2rem', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)',
              borderRadius: '99px',
              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
        )}

        {/* ─── STEP 1: Pilih Peran ─── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.4rem' }}>Kamu sebagai apa di Notara?</h2>
              <p style={{ fontSize: '0.85rem', color: 'rgba(248,250,252,0.5)' }}>Pilih peranmu agar Notara bisa menyesuaikan pengalaman belajarmu.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {ROLES.map(role => (
                <button
                  key={role.id}
                  onClick={() => handleRoleSelect(role.id)}
                  style={{
                    background: `linear-gradient(135deg, ${role.bg.replace('from-', '').replace('to-', '').split(' ')[0].replace(/\//g, '')} 0%, transparent 100%)`,
                    border: `1px solid ${role.border.replace('border-', '')}`,
                    borderRadius: '16px',
                    padding: '1.1rem 1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04) translateY(-2px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${role.color}22`;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = role.color + '70';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1) translateY(0)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '';
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', lineHeight: 1 }}>{role.emoji}</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.2rem' }}>{role.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.45)', lineHeight: 1.4 }}>{role.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 2: Kampus & Jurusan ─── */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.4rem' }}>Dari mana kamu belajar?</h2>
              <p style={{ fontSize: '0.85rem', color: 'rgba(248,250,252,0.5)' }}>Opsional — bantu kami memahami konteks akademikmu.</p>
            </div>

            {/* Virtual Student Card Preview */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.15) 100%)',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '16px',
              padding: '1.25rem',
              marginBottom: '1.25rem',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Card decorative pattern */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                  {ROLES.find(r => r.id === data.role)?.emoji || '🎓'}
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F8FAFC' }}>{firstName}</div>
                  <div style={{ fontSize: '0.68rem', color: '#A78BFA' }}>{ROLES.find(r => r.id === data.role)?.label || 'Pengguna'}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <NotaraLogo variant="icon" size={24} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: data.university ? '#F8FAFC' : 'rgba(248,250,252,0.3)', transition: 'color 0.2s' }}>
                  {data.university || 'Universitas Anda...'}
                </div>
                <div style={{ fontSize: '0.72rem', color: data.major ? 'rgba(167,139,250,0.8)' : 'rgba(248,250,252,0.2)', transition: 'color 0.2s' }}>
                  {data.major || 'Program Studi / Bidang'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input
                ref={universityRef}
                type="text"
                value={data.university}
                onChange={e => setData(prev => ({ ...prev, university: e.target.value }))}
                placeholder="Nama Universitas (mis. Universitas Indonesia)"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  color: '#F8FAFC',
                  fontSize: '0.875rem',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)'}
              />
              <input
                type="text"
                value={data.major}
                onChange={e => setData(prev => ({ ...prev, major: e.target.value }))}
                placeholder="Program Studi / Jurusan (opsional)"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  color: '#F8FAFC',
                  fontSize: '0.875rem',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)'}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setStep(1)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem 1.25rem', color: 'rgba(248,250,252,0.6)', fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >
                ← Kembali
              </button>
              <button
                onClick={handleStep2Next}
                style={{ flex: 1, background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', border: 'none', borderRadius: '12px', padding: '0.75rem 1.5rem', color: '#fff', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}
                onMouseEnter={e => { (e.currentTarget.style.transform = 'translateY(-1px)'); (e.currentTarget.style.boxShadow = '0 8px 24px rgba(139,92,246,0.5)'); }}
                onMouseLeave={e => { (e.currentTarget.style.transform = 'translateY(0)'); (e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.35)'); }}
              >
                Lanjutkan →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Sumber Informasi ─── */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.4rem' }}>Dari mana kamu tau Notara?</h2>
              <p style={{ fontSize: '0.85rem', color: 'rgba(248,250,252,0.5)' }}>Bantu kami tahu bagaimana cerita pertemuanmu dengan Notara dimulai.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1.25rem' }}>
              {SOURCES.map(source => (
                <button
                  key={source.id}
                  onClick={() => handleSourceSelect(source.id)}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid rgba(255,255,255,0.1)`,
                    borderRadius: '14px',
                    padding: '1rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05) translateY(-2px)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = source.color + '60';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 20px ${source.color}20`;
                    (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${source.color}12, transparent)`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                  }}
                >
                  <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{source.emoji}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(248,250,252,0.8)' }}>{source.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              style={{ background: 'none', border: 'none', color: 'rgba(248,250,252,0.4)', fontSize: '0.8rem', cursor: 'pointer', padding: '0.25rem', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.4)')}
            >
              ← Kembali
            </button>
          </div>
        )}

        {/* ─── STEP 4: AI Sinkronisasi ─── */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ marginBottom: '2rem' }}>
              <NotaraLogo
                variant="icon"
                size={80}
                animated
                motionState="thinking"
                showGlow
                className="onboarding-ai-sync-logo"
              />
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.5rem' }}>
              Neural Nexus sedang bersiap...
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'rgba(248,250,252,0.45)', marginBottom: '2.5rem' }}>
              Notara memetakan profil belajar unik Anda
            </p>

            {/* Animated steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left', background: 'rgba(139,92,246,0.08)', borderRadius: '16px', padding: '1.25rem', border: '1px solid rgba(139,92,246,0.15)' }}>
              {AI_SYNCING_STEPS.map((stepText, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    opacity: aiStep > idx ? 1 : aiStep === idx ? 0.5 : 0.15,
                    transform: aiStep > idx ? 'translateX(0)' : 'translateX(-8px)',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: aiStep > idx ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)' : 'rgba(139,92,246,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    color: '#fff',
                    flexShrink: 0,
                    transition: 'background 0.4s',
                  }}>
                    {aiStep > idx ? '✓' : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.85rem', color: aiStep > idx ? '#F8FAFC' : 'rgba(248,250,252,0.5)', fontWeight: aiStep > idx ? 600 : 400, transition: 'all 0.3s' }}>
                    {stepText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes onboarding-logo-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 12px rgba(139,92,246,0.4)); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 24px rgba(139,92,246,0.7)); }
        }
        .onboarding-ai-sync-logo {
          animation: onboarding-logo-pulse 2s ease-in-out infinite;
          display: block;
          margin: 0 auto;
        }
      `}</style>
    </div>
  );
}

export default OnboardingModal;
