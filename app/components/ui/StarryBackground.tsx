'use client';

import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  alphaSpeed: number;
  twinkleSpeed: number;
  twinkleDirection: number;
}

export function StarryBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let stars: Star[] = [];
    const maxStars = 80;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      for (let i = 0; i < maxStars; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random(),
          alphaSpeed: 0.005 + Math.random() * 0.005,
          twinkleSpeed: 0.002 + Math.random() * 0.008,
          twinkleDirection: Math.random() > 0.5 ? 1 : -1,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw starry sky
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Twinkle effect (fade in and out)
        star.alpha += star.twinkleSpeed * star.twinkleDirection;
        if (star.alpha >= 1) {
          star.alpha = 1;
          star.twinkleDirection = -1;
        } else if (star.alpha <= 0.1) {
          star.alpha = 0.1;
          star.twinkleDirection = 1;
        }

        ctx.fillStyle = `rgba(244, 244, 245, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-20">
      {/* Canvas for twinkle stars */}
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* Shifting Cosmic Nebula Glows in the background */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full blur-[150px] opacity-25 animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.05) 50%, transparent 70%)',
          top: '-10%',
          left: '20%',
          animationDuration: '12s',
          animationTimingFunction: 'ease-in-out',
        }}
      />
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[130px] opacity-20 animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, rgba(139, 92, 246, 0.03) 60%, transparent 80%)',
          bottom: '10%',
          right: '15%',
          animationDuration: '18s',
          animationTimingFunction: 'ease-in-out',
          animationDelay: '-4s',
        }}
      />
      
      {/* Deep space overlay grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.008)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
    </div>
  );
}
