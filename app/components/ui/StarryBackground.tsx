'use client';

import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  color: string;
  alpha: number;
  twinkleSpeed: number;
  twinkleDirection: number;
  parallaxFactor: number;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  active: boolean;
}

export function StarryBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let stars: Star[] = [];
    let shootingStar: ShootingStar | null = null;
    const maxStars = 250;

    // Multi-color palette for 20% of stars
    const starColors = [
      'rgba(147, 197, 253, ', // Soft Blue
      'rgba(253, 224, 71, ',  // Soft Yellow
      'rgba(244, 114, 182, ', // Soft Pink
      'rgba(192, 132, 252, ', // Soft Purple
    ];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      for (let i = 0; i < maxStars; i++) {
        // Size distribution: 60% tiny, 30% medium, 10% bright
        const sizeRand = Math.random();
        let size = 0.4 + Math.random() * 0.5; // default tiny
        let parallaxFactor = 0.3;

        if (sizeRand > 0.6 && sizeRand <= 0.9) {
          size = 0.9 + Math.random() * 0.9; // medium
          parallaxFactor = 0.6;
        } else if (sizeRand > 0.9) {
          size = 1.8 + Math.random() * 1.2; // bright
          parallaxFactor = 1.2;
        }

        // Color distribution: 80% white, 20% colorful
        const colorRand = Math.random();
        const colorBase = colorRand > 0.8 
          ? starColors[Math.floor(Math.random() * starColors.length)]
          : 'rgba(244, 244, 245, ';

        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size,
          color: colorBase,
          alpha: Math.random() * 0.9 + 0.1,
          twinkleSpeed: 0.003 + Math.random() * 0.007,
          twinkleDirection: Math.random() > 0.5 ? 1 : -1,
          parallaxFactor,
        });
      }
    };

    // Handle mouse move for parallax
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      // Calculate mouse offset ratio from center (ranges between -1 and 1)
      offsetRef.current.targetX = (e.clientX - centerX) * 0.04;
      offsetRef.current.targetY = (e.clientY - centerY) * 0.04;
    };

    // Shooting star spawn logic
    const spawnShootingStar = () => {
      const angle = Math.PI / 6 + Math.random() * (Math.PI / 12); // ~30-45 degrees
      shootingStar = {
        x: Math.random() * canvas.width * 0.8,
        y: Math.random() * canvas.height * 0.4,
        length: Math.random() * 70 + 40,
        speed: Math.random() * 8 + 6,
        angle,
        opacity: 1,
        active: true,
      };
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Smooth interpolation for parallax offsets
      const o = offsetRef.current;
      o.currentX += (o.targetX - o.currentX) * 0.05;
      o.currentY += (o.targetY - o.currentY) * 0.05;

      // Draw starry sky
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Twinkle effect
        star.alpha += star.twinkleSpeed * star.twinkleDirection;
        if (star.alpha >= 1) {
          star.alpha = 1;
          star.twinkleDirection = -1;
        } else if (star.alpha <= 0.15) {
          star.alpha = 0.15;
          star.twinkleDirection = 1;
        }

        // Apply mouse parallax offset based on star layer
        let x = star.x + o.currentX * star.parallaxFactor;
        let y = star.y + o.currentY * star.parallaxFactor;

        // Wrap around screen edges if parallax moves star out of bounds
        if (x < 0) x += canvas.width;
        if (x > canvas.width) x -= canvas.width;
        if (y < 0) y += canvas.height;
        if (y > canvas.height) y -= canvas.height;

        ctx.fillStyle = star.color + star.alpha + ')';
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Add optional extra glow for bright stars
        if (star.size > 1.8 && star.alpha > 0.7) {
          ctx.fillStyle = star.color + (star.alpha * 0.2) + ')';
          ctx.beginPath();
          ctx.arc(x, y, star.size * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Shooting star rendering & update
      if (shootingStar && shootingStar.active) {
        const ss = shootingStar;
        const dx = Math.cos(ss.angle);
        const dy = Math.sin(ss.angle);

        // Gradient trail
        const gradient = ctx.createLinearGradient(
          ss.x, ss.y,
          ss.x - dx * ss.length, ss.y - dy * ss.length
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${ss.opacity})`);
        gradient.addColorStop(0.1, `rgba(167, 139, 250, ${ss.opacity * 0.8})`); // Violet glow
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - dx * ss.length, ss.y - dy * ss.length);
        ctx.stroke();

        // Update position & opacity
        ss.x += dx * ss.speed;
        ss.y += dy * ss.speed;
        ss.opacity -= 0.015;

        if (ss.opacity <= 0 || ss.x > canvas.width || ss.y > canvas.height) {
          ss.active = false;
          shootingStar = null;
        }
      } else if (Math.random() < 0.002) {
        // ~0.2% chance per frame to spawn a meteor (roughly every 5-8 seconds)
        spawnShootingStar();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    resizeCanvas();
    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-20">
      {/* Canvas for twinkle stars & shooting stars */}
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* ─── 4 slowly drifting CSS-animated nebulae ─── */}
      
      {/* Nebula 1 (Violet-Indigo) - Top Left */}
      <div 
        className="absolute w-[650px] h-[650px] rounded-full blur-[140px] opacity-[0.22] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, rgba(99, 102, 241, 0.04) 55%, transparent 75%)',
          top: '-15%',
          left: '10%',
          animation: 'float-nebula-1 22s ease-in-out infinite',
        }}
      />

      {/* Nebula 2 (Pink-Rose) - Bottom Right */}
      <div 
        className="absolute w-[550px] h-[550px] rounded-full blur-[130px] opacity-[0.16] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.15) 0%, rgba(139, 92, 246, 0.03) 60%, transparent 80%)',
          bottom: '-5%',
          right: '8%',
          animation: 'float-nebula-2 28s ease-in-out infinite',
        }}
      />

      {/* Nebula 3 (Blue-Cyan) - Top Right */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.15] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.14) 0%, rgba(6, 182, 212, 0.02) 50%, transparent 75%)',
          top: '10%',
          right: '15%',
          animation: 'float-nebula-3 34s ease-in-out infinite',
        }}
      />

      {/* Nebula 4 (Amber-Gold) - Center Left */}
      <div 
        className="absolute w-[450px] h-[450px] rounded-full blur-[110px] opacity-[0.12] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.02) 60%, transparent 80%)',
          top: '35%',
          left: '-5%',
          animation: 'float-nebula-4 40s ease-in-out infinite',
        }}
      />
      
      {/* Deep space overlay grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.008)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Inject Keyframe CSS for performance */}
      <style>{`
        @keyframes float-nebula-1 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, 30px) scale(1.08); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes float-nebula-2 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, -50px) scale(0.92); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes float-nebula-3 {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); }
          50% { transform: translate(30px, -40px) scale(1.06) rotate(45deg); }
          100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        }
        @keyframes float-nebula-4 {
          0% { transform: translate(0, 0) scale(1) rotate(0deg); }
          50% { transform: translate(-20px, 30px) scale(1.1) rotate(-30deg); }
          100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

export default StarryBackground;
