'use client';

import React, { useId } from 'react';
import './notara-logo.css';

/* ────────────────────────────────────────────────────────────
   NotaraLogo — The Single Source of Truth for Notara Identity
   
   Refined 7C: N/Wave + Orbit Arc + One Dot
   7D motion behavior: orbit → trail → pulse → return to 7C
   ──────────────────────────────────────────────────────────── */

export type NotaraLogoVariant = 'icon' | 'horizontal' | 'stacked';
export type NotaraMotionState = 'idle' | 'loading' | 'recording' | 'transcribing' | 'summarizing' | 'thinking';

export type NotaraLogoProps = {
  variant?: NotaraLogoVariant;
  animated?: boolean;
  motionState?: NotaraMotionState;
  size?: number;
  className?: string;
  showGlow?: boolean;
  onClick?: () => void;
};

export function NotaraLogo({
  variant = 'icon',
  animated = false,
  motionState = 'idle',
  size = 40,
  className = '',
  showGlow = false,
  onClick,
}: NotaraLogoProps) {
  // Unique ID prefix per instance to avoid SVG gradient ID collisions
  const uid = useId().replace(/:/g, '');
  const isAnimating = animated && motionState !== 'idle';
  const motionClass = isAnimating ? `notara-motion notara-motion--${motionState}` : '';

  /* ── Icon SVG (512×512 viewBox) ────────────── */
  const renderIcon = (iconSize: number) => (
    <svg
      viewBox="0 0 512 512"
      width={iconSize}
      height={iconSize}
      className={`notara-logo ${motionClass} ${className}`}
      role="img"
      aria-label="Notara"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <defs>
        {/* N/Wave gradient: violet → purple → blue (135° diagonal) */}
        <linearGradient id={`${uid}-wave`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="45%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>

        {/* Orbit arc gradient */}
        <linearGradient id={`${uid}-orbit`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>

        {/* Orbit dot radial gradient */}
        <radialGradient id={`${uid}-dot`} cx="40%" cy="35%">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="40%" stopColor="#C084FC" />
          <stop offset="75%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6D28D9" />
        </radialGradient>

        {/* Glow filter */}
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0.5 0 0 0 0.35
                    0 0.2 0 0 0.15
                    0 0 0.9 0 0.45
                    0 0 0 0.4 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ─── Layer 0: Soft Glow (optional) ─── */}
      {showGlow && (
        <g className="notara-soft-glow">
          <ellipse cx="256" cy="262" rx="165" ry="160"
            fill="none" stroke="#8B5CF6" strokeWidth="45"
            opacity="0.06" style={{ filter: 'blur(40px)' }}
          />
        </g>
      )}

      {/* ─── Layer 1: Orbit Arc ─── 
           Partial circle (~285°) with gap at upper-right (1-2 o'clock)
           Uses stroke-dasharray on a circle for clean geometry */}
      <circle
        className="notara-orbit-arc"
        cx="256" cy="258" r="198"
        fill="none"
        stroke={`url(#${uid}-orbit)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeDasharray="995 250"
        strokeDashoffset="80"
        opacity="0.45"
      />

      {/* ─── Layer 2: N/Wave Mark ───
           The heart of Notara. A fluid N formed through a wave ribbon.
           Thick stroke with round caps creates a bold, readable mark.
           Path: bottom-left → top-left → diagonal → top-right */}
      <path
        className="notara-n-wave"
        d={[
          'M 170 356',                           // Start: bottom-left
          'C 158 278, 156 200, 188 160',         // Sweep up to top-left peak
          'C 214 128, 246 198, 272 258',         // Wave crest, flowing down through center
          'C 300 322, 320 362, 344 342',         // Valley dip, rising at right
          'C 366 324, 370 234, 356 164',         // Right arm sweeping up to top-right
        ].join(' ')}
        fill="none"
        stroke={`url(#${uid}-wave)`}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ─── Layer 3: Orbit Dot ───
           Single dot, upper-right (~1:30 clock position).
           This is a KEY brand element — always visible in static logo. */}
      <g className="notara-orbit-dot-wrapper" style={{ transformOrigin: '256px 258px' }}>
        <circle
          className="notara-orbit-dot"
          cx="395" cy="92"
          r="22"
          fill={`url(#${uid}-dot)`}
        />
      </g>

      {/* ─── Layer 4: Trail Dots (animation only) ───
           2-3 smaller dots that appear behind the main dot during orbit.
           Hidden by default (opacity: 0). */}
      <g className="notara-trail-dots" style={{ transformOrigin: '256px 258px' }}>
        <circle cx="420" cy="130" r="13" fill="#A855F7" opacity="0.65" />
        <circle cx="438" cy="172" r="9" fill="#8B5CF6" opacity="0.45" />
        <circle cx="448" cy="218" r="6" fill="#7C3AED" opacity="0.25" />
      </g>

      {/* ─── Layer 5: Audio Pulse Bars (animation only) ───
           Short waveform bars appearing where trail ends.
           Hidden by default. */}
      <g className="notara-audio-pulse" transform="translate(438, 260)">
        <rect x="0" y="-10" width="5" height="20" rx="2.5" fill="#C084FC" className="notara-pulse-bar" style={{ animationDelay: '0ms' }} />
        <rect x="9" y="-16" width="5" height="32" rx="2.5" fill="#A855F7" className="notara-pulse-bar" style={{ animationDelay: '80ms' }} />
        <rect x="18" y="-22" width="5" height="44" rx="2.5" fill="#8B5CF6" className="notara-pulse-bar" style={{ animationDelay: '160ms' }} />
        <rect x="27" y="-16" width="5" height="32" rx="2.5" fill="#7C3AED" className="notara-pulse-bar" style={{ animationDelay: '240ms' }} />
        <rect x="36" y="-10" width="5" height="20" rx="2.5" fill="#6D28D9" className="notara-pulse-bar" style={{ animationDelay: '320ms' }} />
      </g>
    </svg>
  );

  /* ── Wordmark ────────────── */
  const renderWordmark = (wordSize: number, layout: 'row' | 'col') => (
    <div className={`notara-wordmark ${layout === 'col' ? 'notara-wordmark--stacked' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        ...(layout === 'row' ? { marginLeft: wordSize * 0.25 } : { marginTop: wordSize * 0.18, alignItems: 'center' }),
      }}
    >
      <span style={{
        fontSize: wordSize * (layout === 'row' ? 0.58 : 0.32),
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: '#F8FAFC',
        lineHeight: 1.1,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}>
        Notara
      </span>
      <span style={{
        fontSize: wordSize * (layout === 'row' ? 0.17 : 0.1),
        fontWeight: 600,
        letterSpacing: '0.14em',
        color: '#A78BFA',
        textTransform: 'uppercase' as const,
        marginTop: 1,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}>
        AI Companion
      </span>
    </div>
  );

  /* ── Variant Renderers ────────────── */
  if (variant === 'horizontal') {
    return (
      <div className="notara-logo-horizontal" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {renderIcon(size)}
        {renderWordmark(size, 'row')}
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className="notara-logo-stacked" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        {renderIcon(size)}
        {renderWordmark(size, 'col')}
      </div>
    );
  }

  // Default: icon only
  return renderIcon(size);
}

export default NotaraLogo;
