'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, ArrowRight, Loader2, Sparkles, Zap, MessageSquare, FolderGit2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { NotaraLogo } from '../components/brand/NotaraLogo';
import { LoginSuccessScreen } from '../components/ui/LoginSuccessScreen';
import StarryBackground from '../components/ui/StarryBackground';

// Helper to detect offensive names
const containsDirtyWord = (name: string): boolean => {
  const cleanName = name.toLowerCase().trim();
  const badWords = [
    'anjing', 'babi', 'bangsat', 'kontol', 'memek', 'jancok', 'asu', 
    'pepek', 'perek', 'lonte', 'bajingan', 'ngentot', 'peli', 'jembut',
    'fuck', 'shit', 'asshole', 'bitch', 'bastard', 'cunt'
  ];
  return badWords.some(word => cleanName.includes(word));
};

// Helper for password strength calculation
const getPasswordStrength = (pass: string) => {
  if (!pass) return { text: 'Sangat Lemah', color: 'bg-zinc-800' };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 10) score += 1;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { text: 'Lemah', color: 'bg-rose-500' };
  if (score <= 3) return { text: 'Sedang', color: 'bg-amber-500' };
  return { text: 'Kuat', color: 'bg-emerald-500' };
};

// Helper for translating Supabase Auth API error messages to user-friendly Indonesian
const getFriendlyErrorMessage = (msg: string): string => {
  const cleanMsg = msg.toLowerCase();
  if (cleanMsg.includes('password should be at least 6 characters')) {
    return 'Kata sandi terlalu pendek. Minimal harus 6 karakter.';
  }
  if (cleanMsg.includes('invalid email') || cleanMsg.includes('is invalid')) {
    return 'Format email tidak valid. Silakan periksa kembali penulisan email Anda.';
  }
  if (cleanMsg.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah. Silakan periksa kembali. Jika baru mendaftar, pastikan Anda sudah verifikasi email terlebih dahulu.';
  }
  if (cleanMsg.includes('email not confirmed')) {
    return 'Email Anda belum terverifikasi. Silakan cek kotak masuk email dan klik link verifikasi sebelum masuk.';
  }
  if (cleanMsg.includes('user already registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk menggunakan email ini.';
  }
  if (cleanMsg.includes('signup requires a valid email')) {
    return 'Pendaftaran memerlukan email yang valid.';
  }
  if (cleanMsg.includes('flow_state') || cleanMsg.includes('state has already been used')) {
    return 'Sesi login sebelumnya kedaluwarsa. Silakan coba masuk lagi.';
  }
  if (cleanMsg.includes('rate limit') || cleanMsg.includes('too many requests')) {
    return 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit sebelum mencoba lagi.';
  }
  return msg;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  
  // Loading and Error States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Toast state for logout success notification
  const [loginToast, setLoginToast] = useState<{ show: boolean; message: string; isSuccess: boolean }>({ show: false, message: '', isSuccess: true });

  // Full-screen logout success state
  const [showLogoutSuccess, setShowLogoutSuccess] = useState<boolean>(false);

  // Show toast briefly, then dismiss
  const showLoginToast = (message: string, isSuccess = true) => {
    setLoginToast({ show: true, message, isSuccess });
    setTimeout(() => setLoginToast(prev => ({ ...prev, show: false })), 3500);
  };

  // Check URL query parameters & sessionStorage/localStorage flags on mount
  useEffect(() => {
    // ─── PENTING: bersihkan login_success flag jika kita ada di halaman login ───
    // Ini mencegah toast 'selamat datang' muncul jika user cancel lalu login ulang
    localStorage.removeItem('login_success');
    sessionStorage.removeItem('login_success');

    // ─── Cek error dari callback URL ─────────────────────────────────────────
    const errorParam = searchParams.get('error');
    if (errorParam === 'auth-code-exchange-failed') {
      setErrorMsg('Gagal memproses sesi dari Google. Silakan coba lagi.');
    } else if (errorParam === 'oauth-error') {
      setErrorMsg('Terjadi kesalahan saat login dengan Google. Silakan coba lagi.');
    } else if (errorParam === 'session-expired') {
      setErrorMsg('Sesi login kedaluwarsa atau sudah pernah digunakan. Silakan coba masuk kembali.');
    }
    // Jika cancelled=1 → user sengaja klik Batal, tidak perlu tampilkan error

    // ─── Toast logout sukses (dari dashboard) ────────────────────────────────
    const logoutFlag = localStorage.getItem('logout_success') || sessionStorage.getItem('logout_success');
    if (logoutFlag) {
      localStorage.removeItem('logout_success');
      sessionStorage.removeItem('logout_success');
      setShowLogoutSuccess(true);
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
      localStorage.setItem('login_success', '1');
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
        localStorage.removeItem('login_success');
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

    // Client-side validations for Sign Up
    if (isSignUp) {
      if (fullName.trim().length < 2) {
        setErrorMsg('Nama lengkap minimal harus 2 karakter.');
        return;
      }
      if (containsDirtyWord(fullName)) {
        setErrorMsg('Nama lengkap tidak boleh mengandung kata-kata kasar atau tidak pantas.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Kata sandi minimal harus 6 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Kata sandi dan konfirmasi kata sandi tidak cocok.');
        return;
      }
      if (!acceptTerms) {
        setErrorMsg('Anda harus menyetujui Syarat & Ketentuan untuk mendaftar.');
        return;
      }
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
          localStorage.setItem('login_success', '1');
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
          localStorage.setItem('login_success', '1');
          sessionStorage.setItem('login_success', '1');
          router.replace(nextParam);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setErrorMsg(getFriendlyErrorMessage(err.message || 'Terjadi kesalahan sistem. Silakan coba beberapa saat lagi.'));
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

      {/* Starry night cosmic background */}
      <StarryBackground />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Side: Brand & Value Propositions (Desktop Only) */}
        <div className="hidden lg:flex lg:col-span-6 flex-col space-y-8 pr-8 text-left">
          {/* Logo */}
          <div className="flex items-center space-x-3.5 group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/25 ring-1 ring-violet-400/30 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_25px_rgba(139,92,246,0.35)]">
              <NotaraLogo variant="icon" size={28} />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-200 via-fuchsia-200 to-white bg-clip-text text-transparent">
                Notara
              </span>
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-widest uppercase bg-violet-500/10 text-violet-300 border border-violet-500/20">
                AI Agent
              </span>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tight leading-tight bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
              Ubah Rekaman Audio & Rapat Menjadi Rangkuman Instan
            </h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Notara menyalin berkas audio panjang secara cerdas, merangkum poin penting secara otomatis, dan menyediakan chatbot interaktif untuk mendiskusikan materi Anda.
            </p>
          </div>

          {/* Value Props */}
          <div className="space-y-4 pt-4">
            <div className="flex items-start space-x-4 p-4 rounded-2xl bg-zinc-950/20 border border-white/[0.02] hover:border-violet-500/30 hover:bg-violet-900/5 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(139,92,246,0.03)] cursor-default group">
              <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-violet-400 group-hover:text-violet-300 group-hover:border-violet-500/35 transition-colors">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-200 group-hover:text-white transition-colors">Asinkron & Multi-File Processing</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Unggah hingga 3 berkas audio/video sekaligus dan biarkan Notara merangkumnya sekuensial.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 rounded-2xl bg-zinc-950/20 border border-white/[0.02] hover:border-fuchsia-500/30 hover:bg-fuchsia-900/5 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(217,70,239,0.03)] cursor-default group">
              <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-fuchsia-400 group-hover:text-fuchsia-300 group-hover:border-fuchsia-500/35 transition-colors">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-200 group-hover:text-white transition-colors">Chatbot AI dengan Scope Fleksibel</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Tanyakan apapun pada materi spesifik, satu folder/topik, atau secara global lintas semua berkas.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 rounded-2xl bg-zinc-950/20 border border-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-900/5 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(16,185,129,0.03)] cursor-default group">
              <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-emerald-400 group-hover:text-emerald-300 group-hover:border-emerald-500/35 transition-colors">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-200 group-hover:text-white transition-colors">Organisasi Pustaka Rapi</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Klasifikasikan rangkuman Anda ke dalam folder berwarna-warni yang intuitif.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login/Signup Card */}
        <div className="w-full lg:col-span-6 flex justify-center">
          <div className="w-full max-w-md bg-zinc-950/40 border border-white/[0.08] backdrop-blur-3xl p-6 md:p-8 rounded-3xl shadow-2xl shadow-violet-950/10 flex flex-col space-y-6 relative overflow-hidden">
            {/* Top gradient highlight border */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500" />
            {/* Background glowing orb */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Header for Mobile */}
            <div className="flex flex-col items-center text-center lg:hidden space-y-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
                <NotaraLogo variant="icon" size={20} />
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
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs md:text-sm flex flex-col items-center text-center gap-3 animate-fadeIn">
                <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-950/20">
                  <NotaraLogo variant="icon" animated={true} motionState="idle" size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">Pendaftaran Sukses!</h4>
                  <p className="text-zinc-300 text-xs mt-1.5 leading-relaxed">{successMsg}</p>
                </div>
              </div>
            )}

            {/* Google OAuth Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-white/[0.03] border border-white/[0.08] hover:border-violet-500/50 hover:bg-white/[0.06] active:bg-white/[0.02] rounded-xl font-medium text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] group"
            >
              <svg className="w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-115" viewBox="0 0 24 24" width="24" height="24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.16l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
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
                <div className="space-y-1.5 text-left">
                  <label className="text-xs text-zinc-400 font-medium">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Henry Nugraha"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-white/[0.06] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 rounded-xl text-sm transition-all duration-300 outline-none text-zinc-200 placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(139,92,246,0.08)]"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-zinc-400 font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-white/[0.06] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 rounded-xl text-sm transition-all duration-300 outline-none text-zinc-200 placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(139,92,246,0.08)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-zinc-400 font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-white/[0.06] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 rounded-xl text-sm transition-all duration-300 outline-none text-zinc-200 placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(139,92,246,0.08)]"
                  />
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-1.5 text-left animate-fadeIn">
                  <label className="text-xs text-zinc-400 font-medium">Konfirmasi Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-white/[0.06] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 rounded-xl text-sm transition-all duration-300 outline-none text-zinc-200 placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(139,92,246,0.08)]"
                    />
                  </div>
                </div>
              )}

              {isSignUp && password && (
                <div className="space-y-1.5 animate-fadeIn p-3 rounded-2xl bg-black/30 border border-white/[0.03]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-medium">Kekuatan Kata Sandi:</span>
                    <span className={`font-bold ${
                      getPasswordStrength(password).text === 'Kuat' 
                        ? 'text-emerald-400' 
                        : getPasswordStrength(password).text === 'Sedang' 
                          ? 'text-amber-400' 
                          : 'text-rose-400'
                    }`}>
                      {getPasswordStrength(password).text}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-white/[0.03]">
                    <div 
                      className={`h-full transition-all duration-300 ${getPasswordStrength(password).color} ${
                        getPasswordStrength(password).text === 'Kuat' 
                          ? 'w-full' 
                          : getPasswordStrength(password).text === 'Sedang' 
                            ? 'w-2/3' 
                            : 'w-1/3'
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[9px] pt-1 font-mono text-zinc-500 text-left">
                    <div className="flex items-center gap-1">
                      <span className={password.length >= 6 ? 'text-emerald-400 font-bold' : 'text-zinc-700 font-bold'}>
                        {password.length >= 6 ? '✓' : '○'}
                      </span>
                      <span>Min. 6 karakter</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={/[A-Z]/.test(password) && /[a-z]/.test(password) ? 'text-emerald-400 font-bold' : 'text-zinc-700 font-bold'}>
                        {/[A-Z]/.test(password) && /[a-z]/.test(password) ? '✓' : '○'}
                      </span>
                      <span>Huruf besar & kecil</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={/[0-9]/.test(password) ? 'text-emerald-400 font-bold' : 'text-zinc-700 font-bold'}>
                        {/[0-9]/.test(password) ? '✓' : '○'}
                      </span>
                      <span>Angka</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={/[^A-Za-z0-9]/.test(password) ? 'text-emerald-400 font-bold' : 'text-zinc-700 font-bold'}>
                        {/[^A-Za-z0-9]/.test(password) ? '✓' : '○'}
                      </span>
                      <span>Simbol khusus</span>
                    </div>
                  </div>
                </div>
              )}

              {isSignUp && (
                <div className="space-y-3 animate-fadeIn bg-black/20 p-3.5 rounded-2xl border border-white/[0.03]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Syarat & Ketentuan</span>
                    <span className="text-[9px] text-zinc-500 font-medium">Scroll untuk membaca</span>
                  </div>
                  <div className="h-20 overflow-y-auto text-[9.5px] p-2.5 bg-black/40 border border-white/[0.04] rounded-xl text-zinc-500 leading-relaxed scrollbar-thin select-text text-left">
                    <p className="font-bold text-zinc-400 mb-1">Syarat Penggunaan Notara AI</p>
                    <p className="mb-1.5">Selamat datang di Notara Neural Nexus. Dengan mendaftar, Anda menyetujui ketentuan berikut:</p>
                    <p className="mb-1.5"><strong>1. Penggunaan Layanan:</strong> Layanan transkrip dan rangkuman ini disediakan khusus untuk membantu produktivitas pribadi. Anda dilarang menggunakannya untuk aktivitas ilegal atau pelanggaran hak cipta.</p>
                    <p className="mb-1.5"><strong>2. Kebijakan Privasi:</strong> Kami menghormati data Anda. Berkas audio dan transkrip rekaman Anda disimpan aman dan tidak akan dibagikan atau dijual ke pihak ketiga.</p>
                    <p className="mb-1.5"><strong>3. Hak Cipta Materi:</strong> Anda bertanggung jawab penuh atas hak cipta materi yang Anda unggah. Pastikan Anda memiliki izin merekam dari pembicara atau pihak yang bersangkutan.</p>
                    <p className="mb-1.5"><strong>4. Batasan Akun:</strong> Akun free/gratis dibatasi oleh kapasitas penyimpanan dan durasi pemrosesan tertentu yang dapat berubah sewaktu-waktu.</p>
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer select-none py-1 group text-left">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      disabled={loading}
                      className="mt-0.5 rounded border-zinc-800 text-violet-600 focus:ring-violet-500 bg-zinc-950 accent-violet-600 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span className="text-[10.5px] text-zinc-400 group-hover:text-zinc-300 transition-colors leading-tight">
                      Saya membaca dan menyetujui Syarat & Ketentuan Notara
                    </span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 active:opacity-90 rounded-xl font-semibold text-sm text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.01] hover:animate-pulse transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none cursor-pointer group"
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
                  setConfirmPassword('');
                  setAcceptTerms(false);
                }}
                disabled={loading}
                className="text-xs md:text-sm text-zinc-400 font-medium transition-colors cursor-pointer outline-none group"
              >
                {isSignUp ? (
                  <>
                    Sudah punya akun?{' '}
                    <span className="text-violet-400 group-hover:text-violet-300 font-semibold transition-colors ml-1">
                      Masuk di sini
                    </span>
                  </>
                ) : (
                  <>
                    Belum punya akun?{' '}
                    <span className="text-violet-400 group-hover:text-violet-300 font-semibold transition-colors ml-1">
                      Daftar gratis di sini
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showLogoutSuccess && (
        <LoginSuccessScreen
          type="logout"
          onDismiss={() => setShowLogoutSuccess(false)}
        />
      )}
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
