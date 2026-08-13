'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// DashboardTour — Guided Interactive Tour for Nalira Dashboard
// Lightweight, no external library, pure React + vanilla CSS
// Uses data-tour attributes to find & highlight elements
// ─────────────────────────────────────────────────────────────

export interface TourStep {
  target: string;            // data-tour attribute value
  title: string;
  description: string;
  emoji: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface DashboardTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

interface TooltipRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 12;

export function DashboardTour({ steps, onComplete, onSkip }: DashboardTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipRect>({ top: 0, left: 0, width: 340, height: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const getTargetElement = useCallback((target: string): Element | null => {
    if (target === 'center') return null;
    return document.querySelector(`[data-tour="${target}"]`);
  }, []);

  const calculateTooltipPosition = useCallback((rect: DOMRect, pos: TourStep['position'] = 'bottom') => {
    const TOOLTIP_W = 340;
    const TOOLTIP_H = 200; // estimated
    const MARGIN = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0;
    let left = 0;

    if (pos === 'center' || !rect) {
      top = vh / 2 - TOOLTIP_H / 2;
      left = vw / 2 - TOOLTIP_W / 2;
    } else if (pos === 'bottom') {
      top = rect.bottom + SPOTLIGHT_PADDING + MARGIN;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (pos === 'top') {
      top = rect.top - SPOTLIGHT_PADDING - MARGIN - TOOLTIP_H;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (pos === 'right') {
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.right + SPOTLIGHT_PADDING + MARGIN;
    } else if (pos === 'left') {
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.left - SPOTLIGHT_PADDING - MARGIN - TOOLTIP_W;
    }

    // Clamp to viewport
    left = Math.max(MARGIN, Math.min(vw - TOOLTIP_W - MARGIN, left));
    top = Math.max(MARGIN, Math.min(vh - TOOLTIP_H - MARGIN, top));

    return { top, left, width: TOOLTIP_W, height: TOOLTIP_H };
  }, []);

  const updatePosition = useCallback(() => {
    if (!step) return;
    const el = getTargetElement(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPos(calculateTooltipPosition(rect, step.position));
      // Scroll element into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setTooltipPos({ top: vh / 2 - 100, left: vw / 2 - 170, width: 340, height: 200 });
    }
  }, [step, getTargetElement, calculateTooltipPosition]);

  // Initial mount fade-in
  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Update position on step change or resize
  useEffect(() => {
    let frameId = requestAnimationFrame(updatePosition);
    const handleResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [updatePosition]);

  const goNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      if (isLast) {
        setIsVisible(false);
        setTimeout(onComplete, 400);
      } else {
        setCurrentStep(prev => prev + 1);
        setIsTransitioning(false);
      }
    }, 200);
  };

  const goPrev = () => {
    if (isTransitioning || currentStep === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(prev => prev - 1);
      setIsTransitioning(false);
    }, 200);
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(onSkip, 400);
  };

  // Spotlight cutout values
  const sp = targetRect ? {
    x: targetRect.left - SPOTLIGHT_PADDING,
    y: targetRect.top - SPOTLIGHT_PADDING,
    w: targetRect.width + SPOTLIGHT_PADDING * 2,
    h: targetRect.height + SPOTLIGHT_PADDING * 2,
  } : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        pointerEvents: 'none',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      {/* ─── SVG Overlay with Spotlight Cutout ─── */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'all' }}
        onClick={handleSkip}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {sp && (
              <rect
                x={sp.x}
                y={sp.y}
                width={sp.w}
                height={sp.h}
                rx="10"
                ry="10"
                fill="black"
                style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(6, 4, 18, 0.75)"
          mask="url(#tour-spotlight-mask)"
        />
        {/* Spotlight glow ring */}
        {sp && (
          <rect
            x={sp.x - 2}
            y={sp.y - 2}
            width={sp.w + 4}
            height={sp.h + 4}
            rx="12"
            ry="12"
            fill="none"
            stroke="rgba(139,92,246,0.6)"
            strokeWidth="2"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.8))',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}
      </svg>

      {/* ─── Tooltip Card ─── */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: tooltipPos.width,
          zIndex: 9991,
          pointerEvents: 'all',
          opacity: isTransitioning ? 0 : 1,
          transform: isTransitioning ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, rgba(20, 13, 50, 0.98) 0%, rgba(14, 10, 40, 0.98) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: '20px',
          padding: '1.5rem',
          boxShadow: '0 0 40px rgba(139,92,246,0.2), 0 16px 48px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background shimmer */}
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Step indicator & skip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: idx === currentStep ? '20px' : '6px',
                    height: '6px',
                    borderRadius: '99px',
                    background: idx === currentStep ? 'linear-gradient(90deg, #8B5CF6, #3B82F6)' : idx < currentStep ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleSkip}
              style={{ background: 'none', border: 'none', color: 'rgba(248,250,252,0.4)', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.4)')}
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.75rem', lineHeight: 1, flexShrink: 0 }}>{step?.emoji}</div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '0.4rem', lineHeight: 1.3 }}>{step?.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'rgba(248,250,252,0.6)', lineHeight: 1.6, margin: 0 }}>{step?.description}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {currentStep > 0 && (
              <button
                onClick={goPrev}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.6rem 0.9rem', color: 'rgba(248,250,252,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', transition: 'all 0.2s', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >
                <ArrowLeft size={12} /> Kembali
              </button>
            )}
            <button
              onClick={handleSkip}
              style={{ background: 'none', border: 'none', color: 'rgba(248,250,252,0.35)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.6rem 0.5rem', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,250,252,0.35)')}
            >
              Lewati Panduan
            </button>
            <button
              onClick={goNext}
              style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', border: 'none', borderRadius: '10px', padding: '0.6rem 1.1rem', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(139,92,246,0.35)' }}
              onMouseEnter={e => { (e.currentTarget.style.transform = 'translateY(-1px)'); (e.currentTarget.style.boxShadow = '0 8px 20px rgba(139,92,246,0.5)'); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = ''); (e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.35)'); }}
            >
              {isLast ? (
                <><Sparkles size={12} /> Mulai Belajar!</>
              ) : (
                <>Lanjut <ArrowRight size={12} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Default tour steps for Nalira dashboard
export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    target: 'sidebar-folders',
    title: 'Folder & Kategori',
    description: 'Organisasikan materi rekaman ke dalam folder berdasarkan topik atau proyek. Klik + untuk membuat folder baru!',
    emoji: '📁',
    position: 'right',
  },
  {
    target: 'upload-area',
    title: 'Unggah & Rekam',
    description: 'Unggah file audio/video atau rekam langsung dari microphone. Nalira akan otomatis membuat transkrip dan rangkuman!',
    emoji: '🎙️',
    position: 'top',
  },
  {
    target: 'chat-panel',
    title: 'Nalira AI',
    description: 'Tanya jawab langsung dengan AI tentang isi rekaman atau rapat! Nalira memahami konteks setiap rangkuman yang kamu buka.',
    emoji: '🧠',
    position: 'left',
  },
  {
    target: 'global-search',
    title: 'Pencarian Cepat',
    description: 'Tekan Ctrl+K kapan saja untuk mencari di semua rangkuman dan folder secara instan. Hemat waktu, temukan materi lebih cepat!',
    emoji: '🔍',
    position: 'bottom',
  },
];

export default DashboardTour;
