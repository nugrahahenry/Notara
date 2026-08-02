'use client';

import { useState, useEffect, useRef } from 'react';
import { NotaraBrand } from '../brand/NotaraBrand';

interface LoginSuccessScreenProps {
  userName?: string;
  isFirstTime?: boolean;
  type?: 'login' | 'logout';
  onDismiss: () => void;
}

export function LoginSuccessScreen({
  userName = '',
  isFirstTime = false,
  type = 'login',
  onDismiss,
}: LoginSuccessScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const firstName = userName ? userName.split(' ')[0] : 'Teman';

  // Progress bar animation (2.8 seconds total duration)
  useEffect(() => {
    const duration = 2500; // 2.5s for progress bar
    const intervalTime = 30;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const progressValue = Math.min((currentStep / steps) * 100, 100);
      setProgress(progressValue);

      if (currentStep >= steps) {
        clearInterval(timer);
        // Start exit animation
        setTimeout(() => {
          setIsExiting(true);
          // Dismiss after exit animation completes (600ms transition)
          setTimeout(() => {
            onDismiss();
          }, 600);
        }, 300);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onDismiss]);

  // Particle celebration effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particles array
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
      gravity: number;
    }

    const particles: Particle[] = [];
    const colors = [
      'rgba(139, 92, 246, ', // Violet
      'rgba(59, 130, 246, ',  // Blue
      'rgba(236, 72, 153, ',  // Pink
      'rgba(16, 185, 129, ',  // Emerald
      'rgba(245, 158, 11, ',  // Amber
    ];

    // Spawn burst
    const spawnBurst = () => {
      const count = type === 'login' ? 80 : 40;
      const centerX = width / 2;
      const centerY = height / 2;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 4;
        const colorBase = colors[Math.floor(Math.random() * colors.length)];
        
        particles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (type === 'login' ? 3 : 1), // slight upward bias
          size: Math.random() * 4 + 2,
          color: colorBase,
          alpha: 1,
          decay: Math.random() * 0.015 + 0.01,
          gravity: 0.15,
        });
      }
    };

    spawnBurst();

    // Loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ')';
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [type]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(6, 4, 18, 0.94)',
        backdropFilter: 'blur(20px)',
        transform: isExiting ? 'translateY(-100%)' : 'translateY(0)',
        opacity: isExiting ? 0 : 1,
        transition: 'transform 0.6s cubic-bezier(0.82, 0.08, 0.25, 1), opacity 0.6s ease-in-out',
        overflow: 'hidden',
      }}
    >
      {/* Celebration Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Decorative Radial glow */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: type === 'login' 
            ? 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
          filter: 'blur(50px)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Main Content Box */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '480px',
          padding: '2rem',
        }}
      >
        {/* Animated Notara Logo */}
        <div style={{ marginBottom: '2.5rem', transform: 'scale(1.15)' }}>
          <NotaraBrand
            variant="icon"
            size={84}
            animated
            motionState="thinking"
            showGlow
          />
        </div>

        {/* Dynamic Text Messages */}
        {type === 'login' ? (
          <>
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: '#FFFFFF',
                marginBottom: '1rem',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {isFirstTime ? 'Selamat Datang di Notara! 🎉' : `Selamat Datang Kembali, ${firstName}! 👋`}
            </h1>
            <p
              style={{
                fontSize: '0.95rem',
                color: 'rgba(248, 250, 252, 0.6)',
                lineHeight: 1.6,
                marginBottom: '2.5rem',
              }}
            >
              {isFirstTime
                ? 'Notara siap mendampingi perjalanan belajar terbaikmu.'
                : 'Menghubungkan Anda kembali ke ruang belajar digital Neural Nexus.'}
            </p>
          </>
        ) : (
          <>
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: '#FFFFFF',
                marginBottom: '1rem',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Sampai Jumpa Lagi! 👋
            </h1>
            <p
              style={{
                fontSize: '0.95rem',
                color: 'rgba(248, 250, 252, 0.6)',
                lineHeight: 1.6,
                marginBottom: '2.5rem',
              }}
            >
              Sesi Anda telah diakhiri dengan aman. Semoga harimu menyenangkan dan produktif!
            </p>
          </>
        )}

        {/* Progress Bar Container */}
        <div
          style={{
            width: '240px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '99px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: type === 'login'
                ? 'linear-gradient(90deg, #8B5CF6, #3B82F6)'
                : 'linear-gradient(90deg, #3B82F6, #10B981)',
              borderRadius: '99px',
              transition: 'width 0.03s linear',
            }}
          />
        </div>

        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'rgba(248, 250, 252, 0.35)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            marginTop: '0.75rem',
          }}
        >
          {type === 'login' ? 'Memuat Dasbor...' : 'Keluar Aman...'}
        </span>
      </div>
    </div>
  );
}

export default LoginSuccessScreen;
