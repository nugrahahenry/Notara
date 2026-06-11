'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GitFork, Loader2, Check, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { forkSummary } from '@/lib/db';
import type { Summary } from '@/lib/types';

interface ForkButtonProps {
  summary: Summary;
}

export default function ForkButton({ summary }: ForkButtonProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [forked, setForked] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Periksa apakah user sudah login di client-side
  useEffect(() => {
    async function checkUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (err) {
        console.error('Error checking user session:', err);
      } finally {
        setCheckingSession(false);
      }
    }
    checkUser();
  }, []);

  const handleFork = async () => {
    if (loading || forked) return;

    if (!user) {
      // Jika user belum login, arahkan ke login dengan target kembali
      const currentPath = window.location.pathname;
      router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    try {
      setLoading(true);
      const newSummary = await forkSummary(summary, user.id);
      if (newSummary) {
        setForked(true);
        // Set info di localStorage untuk memilih rangkuman ini secara otomatis di dashboard
        if (typeof window !== 'undefined') {
          localStorage.setItem('notara_selected_summary_id', newSummary.id);
          localStorage.setItem('notara_toast_message', 'Rangkuman berhasil disalin ke perpustakaan Anda! 🚀');
        }
        
        // Arahkan ke dashboard utama
        setTimeout(() => {
          router.push('/');
        }, 1200);
      } else {
        alert('Gagal menduplikasi rangkuman. Silakan coba lagi.');
      }
    } catch (err) {
      console.error('Fork error:', err);
      alert('Terjadi kesalahan saat menyalin rangkuman.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="h-11 w-44 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <button
      onClick={handleFork}
      disabled={loading || forked}
      className={`relative h-11 px-5 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2 border shadow-lg ${
        forked
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default shadow-emerald-500/5'
          : loading
            ? 'bg-violet-600/50 border-violet-500/30 text-white cursor-not-allowed'
            : user
              ? 'bg-violet-600 border-violet-500 hover:bg-violet-500 text-white shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-95 cursor-pointer'
              : 'bg-white/5 border-white/10 hover:border-white/20 text-zinc-300 hover:text-white active:scale-95 cursor-pointer'
      }`}
    >
      {forked ? (
        <>
          <Check className="h-4 w-4 animate-bounce" />
          <span>Tersalin ke Pustaka</span>
        </>
      ) : loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Menyalin Materi...</span>
        </>
      ) : user ? (
        <>
          <GitFork className="h-4 w-4" />
          <span>Simpan ke Notara Saya</span>
        </>
      ) : (
        <>
          <span>Login untuk Menyimpan</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </>
      )}
      
      {/* Subtle pulsing background glow if logged in and ready */}
      {user && !loading && !forked && (
        <span className="absolute -inset-px rounded-xl border border-violet-500/50 animate-ping opacity-25 pointer-events-none" />
      )}
    </button>
  );
}
