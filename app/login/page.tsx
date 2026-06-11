'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Brain, Mail, Lock, User, ArrowRight, Loader2, Sparkles, Zap, MessageSquare, FolderGit2, AlertCircle, CheckCircle2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Loading and Error States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Toast state for logout success notification
  const [loginToast, setLoginToast] = useState<{ show: boolean; message: string; isSuccess: boolean }>({ show: false, message: '', isSuccess: true });

  // Show toast briefly, then dismiss
  const showLoginToast = (message: string, isSuccess = true) => {
    setLoginToast({ show: true, message, isSuccess });
    setTimeout(() => setLoginToast(prev => ({ ...prev, show: false })), 3500);
  };

  // Check URL query parameters & sessionStorage flags on mount
  useEffect(() => {
    // ─── PENTING: bersihkan login_success flag jika kita ada di halaman login ───
    // Ini mencegah toast 'selamat datang' muncul jika user cancel lalu login ulang
    sessionStorage.removeItem('login_success');

    // ─── Cek error dari callback URL ─────────────────────────────────────────
    const errorParam = searchParams.get('error');
    if (errorParam === 'auth-code-exchange-failed') {
      setErrorMsg('Gagal memproses sesi dari Google. Silakan coba lagi.');
    } else if (errorParam === 'oauth-error') {
      setErrorMsg('Terjadi kesalahan saat login dengan Google. Silakan coba lagi.');
    }
    // Jika cancelled=1 → user sengaja klik Batal, tidak perlu tampilkan error

    // ─── Toast logout sukses (dari dashboard) ────────────────────────────────
    const logoutFlag = sessionStorage.getItem('logout_success');
    if (logoutFlag) {
      sessionStorage.removeItem('logout_success');
      setTimeout(() => showLoginToast('Berhasil keluar dari Notara. Sampai jumpa! 👋', true), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Google OAuth Login
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      
      // Set flag BEFORE OAuth redirect — sessionStorage persists across
      // cross-origin navigations in the same tab (Google → back to Notara)
      sessionStorage.setItem('login_success', '1');

      const redirectVal = searchParams.get('redirect') || '';
      const redirectTo = redirectVal
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectVal)}`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) {
        // If OAuth fails before redirecting, clear the flag
        sessionStorage.removeItem('login_success');
        throw error;
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat masuk menggunakan Google.');
      setLoading(false);
    }
  };

  // Email/Password Submit (Sign In or Sign Up)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isSignUp && !fullName)) {
      setErrorMsg('Mohon isi semua bidang yang diperlukan.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const redirectVal = searchParams.get('redirect') || '';
      const emailRedirectTo = redirectVal
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectVal)}`
        : `${window.location.origin}/auth/callback`;
      const nextParam = redirectVal || '/';

      if (isSignUp) {
        // Sign Up Flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo,
          },
        });

        if (error) throw error;

        // If email confirmation is required, inform the user
        if (data.user && data.session === null) {
          setSuccessMsg('Pendaftaran berhasil! Silakan periksa kotak masuk email Anda untuk melakukan verifikasi akun.');
          // Clear inputs
          setEmail('');
          setPassword('');
          setFullName('');
        } else if (data.session) {
          // Direct session after sign-up (email confirmation disabled)
          sessionStorage.setItem('login_success', '1');
          router.replace(nextParam);
        }
      } else {
        // Sign In Flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.session) {
          sessionStorage.setItem('login_success', '1');
          router.replace(nextParam);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.message === 'Invalid login credentials') {
        setErrorMsg('Email atau password salah. Silakan periksa kembali.');
      } else if (err.message === 'User already registered') {
        setErrorMsg('Email ini sudah terdaftar. Silakan masuk saja.');
      } else {
        setErrorMsg(err.message || 'Terjadi kesalahan sistem. Silakan coba beberapa saat lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main data-page="login" className="relative min-h-screen w-full flex items-center justify-center bg-zinc-950 text-zinc-100 overflow-y-auto px-4 py-12 md:p-6 select-none font-sans">
      
      {/* ====== TOAST NOTIFICATION (login page) ====== */}
      {loginToast.show && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium animate-fadeIn transition-all ${
          loginToast.isSuccess
            ? 'bg-emerald-900/90 border-emerald-500/30 text-emerald-200'
            : 'bg-red-900/90 border-red-500/30 text-red-200'
        }`}>
          {loginToast.isSuccess ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          )}
          <span>{loginToast.message}</span>
        </div>
      )}

      {/* Dynamic Glowing Mesh Background */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 md:w-[450px] h-80 md:h-[450px] bg-violet-600/10 rounded-full blur-[100px] md:blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 md:w-[450px] h-80 md:h-[450px] bg-fuchsia-600/10 rounded-full blur-[100px] md:blur-[130px] pointer-events-none" />
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Side: Brand & Value Propositions (Desktop Only) */}
        <div className="hidden lg:flex lg:col-span-6 flex-col space-y-8 pr-8 text-left">
          {/* Logo */}
          <div className="flex items-center space-x-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/30 ring-1 ring-violet-400/30">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-violet-200 via-fuchsia-200 to-white bg-clip-text text-transparent">
                Notara
              </span>
              <span className="ml-1.5 px-2 py-0.5 rounded text-[10px] font-medium tracking-wide bg-violet-500/10 text-violet-300 border border-violet-500/20">
                AI Agent
              </span>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
              Ubah Audio Kuliah & Rapat Menjadi <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Rangkuman Instan</span>
            </h1>
            <p className="text-zinc-400 text-base leading-relaxed">
              Notara menyalin berkas audio panjang secara cerdas, merangkum poin penting secara otomatis, dan menyediakan chatbot interaktif untuk mendiskusikan materi Anda.
            </p>
          </div>

          {/* Value Props */}
          <div className="space-y-5 pt-4">
            <div className="flex items-start space-x-4">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-violet-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200">Asinkron & Multi-File Processing</h3>
                <p className="text-sm text-zinc-400 mt-0.5">Unggah hingga 3 berkas audio/video sekaligus dan biarkan Notara merangkumnya sekuensial.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-fuchsia-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200">Chatbot AI dengan Scope Fleksibel</h3>
                <p className="text-sm text-zinc-400 mt-0.5">Tanyakan apapun pada materi spesifik, satu mata kuliah/folder, atau secara global lintas semua berkas.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-emerald-400">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200">Organisasi Pustaka Rapi</h3>
                <p className="text-sm text-zinc-400 mt-0.5">Klasifikasikan rangkuman Anda ke dalam folder berwarna-warni yang intuitif.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login/Signup Card */}
        <div className="w-full lg:col-span-6 flex justify-center">
          <div className="w-full max-w-md bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-2xl shadow-violet-950/10 p-6 md:p-8 flex flex-col space-y-6">
            
            {/* Header for Mobile */}
            <div className="flex flex-col items-center text-center lg:hidden space-y-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-violet-200 to-white bg-clip-text text-transparent">
                Notara
              </span>
              <p className="text-xs text-zinc-400">
                Ubah rekaman audio panjang Anda menjadi rangkuman AI instan.
              </p>
            </div>

            {/* Title / Tab Selector */}
            <div className="text-center space-y-2">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                {isSignUp ? 'Buat Akun Notara' : 'Selamat Datang Kembali'}
              </h2>
              <p className="text-xs md:text-sm text-zinc-400">
                {isSignUp 
                  ? 'Silakan isi formulir untuk memulai perpustakaan digital Anda.' 
                  : 'Masuk untuk mengakses riwayat dan asisten AI Anda.'}
              </p>
            </div>

            {/* Error / Success Notifications */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs md:text-sm flex items-start space-x-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs md:text-sm flex items-start space-x-2.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Google OAuth Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 active:bg-zinc-900/80 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-lg hover:shadow-violet-950/10 group"
            >
              <svg className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" width="24" height="24">
                <g transform="matrix(1, 0, 0, 1, 0, 0)">
                  <path d="M21.35,11.1H12v2.7h5.38C16.88,15.72,14.81,17,12,17c-2.76,0-5-2.24-5-5s2.24-5,5-5c1.24,0,2.37,0.45,3.25,1.2l2.4-2.4C16.03,4.28,14.15,3.5,12,3.5,7.3,3.5,3.5,7.3,3.5,12s3.8,8.5,8.5,8.5c4.7,0,8.5-3.8,8.5-8.5C20.5,11.75,20.45,11.42,20.35,11.1Z" fill="#ffffff" />
                  <path d="M21.35,11.1H12v2.7h5.38c-0.5,1.92-2.57,3.2-5.38,3.2c-2.76,0-5-2.24-5-5s2.24-5,5-5c1.24,0,2.37,0.45,3.25,1.2l2.4-2.4C16.03,4.28,14.15,3.5,12,3.5c-4.7,0-8.5,3.8-8.5,8.5s3.8,8.5,8.5,8.5c4.7,0,8.5-3.8,8.5-8.5C20.5,11.75,20.45,11.42,20.35,11.1Z" fill="#4285F4" />
                </g>
              </svg>
              <span>{isSignUp ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-zinc-800/80"></div>
              <span className="px-3 text-xs text-zinc-500 uppercase tracking-widest">atau</span>
              <div className="flex-grow border-t border-zinc-800/80"></div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Henry Nugraha"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl text-sm transition-all outline-none text-zinc-200"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl text-sm transition-all outline-none text-zinc-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl text-sm transition-all outline-none text-zinc-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 active:opacity-90 rounded-xl font-semibold text-sm text-white shadow-lg shadow-violet-900/20 hover:shadow-violet-900/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>{isSignUp ? 'Daftar Sekarang' : 'Masuk'}</span>
                    <ArrowRight className="w-4 h-4 text-white transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Toggle Sign In / Sign Up */}
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                disabled={loading}
                className="text-xs md:text-sm text-zinc-400 hover:text-violet-400 font-medium transition-colors cursor-pointer outline-none"
              >
                {isSignUp 
                  ? 'Sudah punya akun? Masuk di sini' 
                  : 'Belum punya akun? Daftar gratis di sini'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
