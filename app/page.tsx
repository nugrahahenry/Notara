'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles, Mic, FileText, Brain, Shield, Lock,
  ChevronDown, ChevronRight, ArrowRight, Zap,
  MessageSquare, Users, Crown, Check, X, Star,
  Globe, Eye, Folder
} from 'lucide-react';
import { NotaraBrand } from './components/brand/NotaraBrand';
import { StarryBackground } from './components/ui/StarryBackground';
import { supabase } from '@/lib/supabase';

// ==========================================
// LANDING PAGE — Notara Neural Nexus
// ==========================================

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isNavScrolled, setIsNavScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    };
    checkAuth();
  }, []);

  // Scroll listener for navbar & parallax
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
      setIsNavScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to section
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // FAQ Data
  const faqItems = [
    {
      q: 'Apakah Notara gratis?',
      a: 'Ya! Paket Free memungkinkan Anda merekam dan merangkum hingga 5 catatan per bulan tanpa biaya apapun. Jika Anda membutuhkan kuota lebih, upgrade ke paket Pro atau Max.'
    },
    {
      q: 'Format audio apa yang didukung?',
      a: 'Notara mendukung MP3, WAV, M4A, OGG, WebM, dan format audio utama lainnya. Anda juga bisa merekam langsung dari browser tanpa instal apapun.'
    },
    {
      q: 'Bagaimana Notara melindungi privasi saya?',
      a: 'Catatan dan transkrip Anda 100% milik Anda. Kami tidak pernah mempublikasikan, menjual, atau membagikan data Anda ke pihak ketiga. Arsitektur kami dibangun Private by Default.'
    },
    {
      q: 'Apakah bisa digunakan untuk rapat kerja?',
      a: 'Tentu! Notara dirancang untuk semua jenis audio — kuliah, rapat, podcast, wawancara, presentasi, dan lainnya. Neural Nexus AI menganalisis konteks apapun.'
    },
    {
      q: 'Metode pembayaran apa yang tersedia?',
      a: 'Kami menerima pembayaran melalui QRIS, GoPay, ShopeePay, bank transfer (BCA, BNI, Mandiri, BRI), dan kartu kredit/debit melalui gateway Midtrans yang aman.'
    },
    {
      q: 'Apakah ada batasan durasi rekaman?',
      a: 'Paket Free mendukung hingga 30 menit per rekaman. Paket Pro meningkatkan ke 2 jam, dan paket Max tidak memiliki batasan durasi.'
    },
  ];

  // Pricing tiers data
  const pricingTiers = [
    {
      name: 'Free',
      price: 'Rp 0',
      period: '/selamanya',
      description: 'Sempurna untuk mulai mencoba',
      icon: <Sparkles className="w-6 h-6" />,
      color: 'from-zinc-500 to-zinc-600',
      borderColor: 'border-zinc-700/50',
      features: [
        { text: '5 catatan / bulan', included: true },
        { text: 'Rekam langsung dari browser', included: true },
        { text: 'Transkripsi Whisper AI', included: true },
        { text: 'Rangkuman otomatis', included: true },
        { text: 'Neural Nexus AI Chat', included: false },
        { text: 'Folder & organisasi', included: true },
        { text: 'Ekspor PDF', included: false },
        { text: 'Grup Studi kolaboratif', included: false },
      ],
      cta: 'Mulai Gratis',
      popular: false,
    },
    {
      name: 'Pro',
      price: 'Rp 29.900',
      period: '/bulan',
      description: 'Untuk pelajar & pekerja serius',
      icon: <Zap className="w-6 h-6" />,
      color: 'from-violet-500 to-indigo-600',
      borderColor: 'border-violet-500/50',
      features: [
        { text: '50 catatan / bulan', included: true },
        { text: 'Rekam hingga 2 jam', included: true },
        { text: 'Transkripsi Whisper AI', included: true },
        { text: 'Rangkuman + Istilah Kunci', included: true },
        { text: 'Neural Nexus AI Chat', included: true },
        { text: 'Folder & organisasi', included: true },
        { text: 'Ekspor PDF & Share Card', included: true },
        { text: 'Grup Studi (maks 3)', included: true },
      ],
      cta: 'Upgrade ke Pro',
      popular: true,
    },
    {
      name: 'Max',
      price: 'Rp 79.900',
      period: '/bulan',
      description: 'Akses tanpa batas, prioritas AI',
      icon: <Crown className="w-6 h-6" />,
      color: 'from-amber-500 to-orange-600',
      borderColor: 'border-amber-500/50',
      features: [
        { text: 'Catatan unlimited', included: true },
        { text: 'Rekam tanpa batas durasi', included: true },
        { text: 'Transkripsi prioritas', included: true },
        { text: 'Rangkuman + Prediksi Soal', included: true },
        { text: 'Neural Nexus AI — tanpa limit', included: true },
        { text: 'Keamanan 2FA & Audit Log', included: true },
        { text: 'API Access (coming soon)', included: true },
        { text: 'Grup Studi unlimited', included: true },
      ],
      cta: 'Pilih Max',
      popular: false,
    },
  ];

  // Feature cards data
  const features = [
    {
      icon: <Mic className="w-8 h-8" />,
      title: 'Speech-to-Text Instan',
      description: 'Rekam langsung dari browser atau upload file audio. Whisper AI mengonversi ke teks dengan akurasi tinggi dalam hitungan detik.',
      gradient: 'from-violet-500/20 to-purple-500/20',
      iconColor: 'text-violet-400',
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: 'Rangkuman Terstruktur',
      description: 'AI secara otomatis mengekstrak poin penting, istilah kunci, konsep utama, dan menyusun rangkuman yang mudah dipahami.',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-400',
    },
    {
      icon: <Brain className="w-8 h-8" />,
      title: 'Neural Nexus AI Chat',
      description: 'Chatbot cerdas yang memahami konteks seluruh catatan Anda. Tanya jawab, cari info, atau minta penjelasan lebih lanjut.',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-400',
    },
    {
      icon: <Folder className="w-8 h-8" />,
      title: 'Organisasi Cerdas',
      description: 'Atur catatan dalam folder berwarna dengan emoji kustom. Cari catatan lama dengan pencarian instan.',
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-400',
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Grup Studi Kolaboratif',
      description: 'Buat grup studi, bagikan folder catatan, dan kolaborasi real-time bersama teman sekelas atau rekan kerja.',
      gradient: 'from-pink-500/20 to-rose-500/20',
      iconColor: 'text-pink-400',
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: 'Share & Publish',
      description: 'Bagikan catatan via link publik atau buat Share Card visual untuk media sosial. Kontrol penuh kapan saja.',
      gradient: 'from-indigo-500/20 to-violet-500/20',
      iconColor: 'text-indigo-400',
    },
  ];

  return (
    <main data-page="landing" className="relative min-h-screen bg-[#08070B] text-white overflow-y-auto overflow-x-hidden">
      <StarryBackground />

      {/* ══════════════════════════════════════════════════════
          SECTION 1: GLASSMORPHIC NAVIGATION BAR
          ══════════════════════════════════════════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isNavScrolled
            ? 'bg-[#08070B]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-2xl shadow-violet-500/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <div className="flex-shrink-0">
              <NotaraBrand variant="horizontal" size={36} />
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {['Fitur', 'Keamanan', 'Harga', 'FAQ'].map((item) => (
                <button
                  key={item}
                  onClick={() => scrollToSection(item.toLowerCase())}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-all duration-300 cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>

            {/* CTA Button */}
            <div className="flex items-center gap-3">
              <Link
                href={isAuthenticated ? '/dashboard' : '/login'}
                className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                  text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40
                  transition-all duration-300 hover:scale-[1.03]"
              >
                {isAuthenticated ? 'Ke Dashboard' : 'Masuk / Daftar'}
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════
          SECTION 2: HERO — COSMIC SHOWCASE
          ══════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center pt-20 pb-16 px-4 sm:px-6"
      >
        {/* Decorative radial gradient */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-radial from-violet-500/8 via-transparent to-transparent blur-3xl" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-8 animate-fadeIn">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Powered by Whisper AI & Llama 3.3</span>
          </div>

          {/* Main Heading */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6"
            style={{
              transform: `translateY(${scrollY * 0.08}px)`,
              opacity: Math.max(0, 1 - scrollY / 600),
            }}
          >
            <span className="block text-white">Ubah Rekaman Audio</span>
            <span className="block bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Menjadi Rangkuman AI
            </span>
            <span className="block text-white">Terstruktur</span>
          </h1>

          {/* Subheading */}
          <p
            className="max-w-2xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed mb-10"
            style={{
              transform: `translateY(${scrollY * 0.04}px)`,
              opacity: Math.max(0, 1 - scrollY / 800),
            }}
          >
            Rekam kuliah, rapat, atau podcast langsung dari browser. Notara memotong audio,
            mentranskripsikan dengan Whisper, lalu merangkum konsep kunci secara otomatis
            dengan AI — semua dalam hitungan detik.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href={isAuthenticated ? '/dashboard' : '/login'}
              className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-base font-bold
                bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                text-white shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50
                transition-all duration-500 hover:scale-[1.04]
                animate-pulse-glow"
            >
              <Sparkles className="w-5 h-5" />
              {isAuthenticated ? 'Ke Dashboard' : 'Mulai Sekarang — Gratis'}
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>

            <button
              onClick={() => scrollToSection('fitur')}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-base font-semibold
                text-zinc-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15]
                transition-all duration-300 hover:scale-[1.02] cursor-pointer"
            >
              <Eye className="w-5 h-5" />
              Lihat Fitur
            </button>
          </div>

          {/* CSS Glass Mockup — Dashboard Preview */}
          <div
            className="relative max-w-4xl mx-auto animate-float"
            style={{
              transform: `translateY(${scrollY * 0.06}px)`,
              opacity: Math.max(0, 1 - scrollY / 900),
            }}
          >
            <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#111122]/90 to-[#0a0a1a]/90 backdrop-blur-xl shadow-2xl shadow-violet-500/10 overflow-hidden">
              {/* Fake Browser Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="mx-auto max-w-xs h-6 rounded-lg bg-white/[0.06] flex items-center justify-center px-3">
                    <span className="text-[10px] text-zinc-500 font-mono">notara.vercel.app/dashboard</span>
                  </div>
                </div>
              </div>

              {/* Fake Dashboard Content */}
              <div className="p-6 grid grid-cols-12 gap-4 min-h-[320px]">
                {/* Sidebar Mock */}
                <div className="col-span-3 space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <div className="w-4 h-4 rounded bg-violet-500/40" />
                    <div className="h-3 w-16 rounded bg-white/20" />
                  </div>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                      <div className="w-4 h-4 rounded bg-white/10" />
                      <div className={`h-2.5 rounded bg-white/10`} style={{ width: `${40 + i * 12}px` }} />
                    </div>
                  ))}
                </div>

                {/* Main Content Mock */}
                <div className="col-span-6 space-y-3">
                  <div className="h-4 w-48 rounded bg-white/15" />
                  <div className="h-3 w-full rounded bg-white/8" />
                  <div className="h-3 w-5/6 rounded bg-white/8" />
                  <div className="h-3 w-4/6 rounded bg-white/8" />
                  <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <div className="h-3 w-20 rounded bg-violet-400/30" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2 w-full rounded bg-white/8" />
                      <div className="h-2 w-5/6 rounded bg-white/8" />
                      <div className="h-2 w-3/4 rounded bg-white/8" />
                    </div>
                  </div>
                </div>

                {/* Chat Panel Mock */}
                <div className="col-span-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
                    <div className="h-3 w-16 rounded bg-white/15" />
                  </div>
                  <div className="space-y-2">
                    <div className="self-end ml-auto p-2 rounded-lg bg-violet-500/20 max-w-[85%]">
                      <div className="h-2 w-16 rounded bg-white/20" />
                    </div>
                    <div className="p-2 rounded-lg bg-white/[0.04] max-w-[90%]">
                      <div className="h-2 w-full rounded bg-white/10 mb-1" />
                      <div className="h-2 w-3/4 rounded bg-white/10" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow effect under the mockup */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-24 bg-gradient-to-t from-violet-500/15 to-transparent blur-3xl pointer-events-none" />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs text-zinc-500 font-medium">Scroll ke bawah</span>
          <ChevronDown className="w-5 h-5 text-zinc-600" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 3: FEATURES MATRIX (6-card grid)
          ══════════════════════════════════════════════════════ */}
      <section id="fitur" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-4">
              <Zap className="w-3.5 h-3.5" />
              Fitur Unggulan
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Semua yang kamu butuhkan,{' '}
              <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                dalam satu tempat
              </span>
            </h2>
            <p className="max-w-xl mx-auto text-zinc-400 text-base sm:text-lg">
              Dari rekaman audio hingga rangkuman AI terstruktur — Notara menangani semua proses berat untuk Anda.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]
                  hover:bg-white/[0.05] hover:border-white/[0.12] hover:scale-[1.02]
                  transition-all duration-500 cursor-default"
              >
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} mb-4 ${feature.iconColor}
                  group-hover:scale-110 transition-transform duration-500`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>

                {/* Hover ambient glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 60px rgba(139, 92, 246, 0.04)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 4: PRIVACY MOAT — COMPETITIVE ADVANTAGE
          ══════════════════════════════════════════════════════ */}
      <section id="keamanan" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
        {/* Background accent */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[150px]" />
          <div className="absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-violet-500/5 blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold mb-6">
                <Shield className="w-3.5 h-3.5" />
                Private by Default
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                100% Kepemilikan Data &{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Privasi Mutlak
                </span>
              </h2>
              <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-8">
                Tidak seperti platform lain yang memaksa upload dokumen ke katalog publik,
                Notara dibangun dengan arsitektur <strong className="text-zinc-200">Private by Default</strong>.
                Catatan dan transkrip Anda tidak akan pernah dipublikasikan, dijual, atau dibagikan ke siapapun tanpa izin Anda.
              </p>

              {/* Privacy Features List */}
              <div className="space-y-4">
                {[
                  { icon: <Lock className="w-5 h-5" />, title: 'Enkripsi End-to-End', desc: 'Data dienkripsi saat transit maupun saat tersimpan.' },
                  { icon: <Shield className="w-5 h-5" />, title: 'Zero Data Selling', desc: 'Kami tidak menjual data Anda ke pihak ketiga. Titik.' },
                  { icon: <Eye className="w-5 h-5" />, title: 'Kontrol Penuh Sharing', desc: 'Anda memutuskan siapa yang bisa melihat catatan Anda.' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-emerald-500/20 transition-colors duration-300">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-0.5">{item.title}</h4>
                      <p className="text-xs text-zinc-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual comparison card */}
            <div className="relative">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-6 backdrop-blur-sm">
                <h3 className="text-lg font-bold text-white text-center mb-2">Platform Lain vs Notara</h3>

                {/* Comparison items */}
                {[
                  { label: 'Dokumen dipublikasikan tanpa izin', other: true, notara: false },
                  { label: 'Harus upload dokumen ke katalog publik', other: true, notara: false },
                  { label: 'Data dijual ke pihak ketiga', other: true, notara: false },
                  { label: 'Kontrol penuh atas sharing', other: false, notara: true },
                  { label: 'Privasi sebagai fitur utama', other: false, notara: true },
                ].map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-sm text-zinc-300">{item.label}</span>
                    <div className="flex justify-center">
                      {item.other ? (
                        <div className="w-7 h-7 rounded-full bg-rose-500/15 flex items-center justify-center">
                          <X className="w-4 h-4 text-rose-400" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <Check className="w-4 h-4 text-emerald-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center">
                      {item.notara ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <Check className="w-4 h-4 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-rose-500/15 flex items-center justify-center">
                          <X className="w-4 h-4 text-rose-400" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Column labels */}
                <div className="grid grid-cols-[1fr_80px_80px] gap-3 pt-2">
                  <span />
                  <span className="text-xs text-zinc-500 text-center font-medium">Lainnya</span>
                  <span className="text-xs text-violet-400 text-center font-bold">Notara</span>
                </div>
              </div>

              {/* Glow */}
              <div className="absolute -z-10 top-8 -right-8 w-48 h-48 rounded-full bg-emerald-500/8 blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 5: INTERACTIVE 3-TIER PRICING TABLE
          ══════════════════════════════════════════════════════ */}
      <section id="harga" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold mb-4">
              <Crown className="w-3.5 h-3.5" />
              Harga Transparan
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Pilih paket{' '}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                sesuai kebutuhanmu
              </span>
            </h2>
            <p className="max-w-xl mx-auto text-zinc-400 text-base sm:text-lg">
              Mulai gratis, upgrade kapan saja. Tanpa biaya tersembunyi, tanpa kejutan.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {pricingTiers.map((tier, idx) => (
              <div
                key={idx}
                className={`relative group rounded-2xl border p-6 sm:p-8 flex flex-col
                  transition-all duration-500 hover:scale-[1.03]
                  ${tier.popular
                    ? 'border-violet-500/40 bg-gradient-to-b from-violet-500/[0.06] to-transparent shadow-lg shadow-violet-500/10'
                    : `${tier.borderColor} bg-white/[0.02] hover:bg-white/[0.04]`
                  }
                `}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-bold text-white shadow-lg">
                    ⚡ Paling Populer
                  </div>
                )}

                {/* Tier Header */}
                <div className="mb-6">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${tier.color} mb-4 text-white`}>
                    {tier.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-sm text-zinc-500">{tier.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white">{tier.price}</span>
                    <span className="text-sm text-zinc-500">{tier.period}</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="flex-1 space-y-3 mb-8">
                  {tier.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Link
                  href={isAuthenticated ? '/dashboard' : '/login'}
                  className={`block w-full text-center py-3 rounded-xl text-sm font-bold transition-all duration-300
                    ${tier.popular
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40'
                      : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white border border-white/[0.08]'
                    }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 6: FAQ ACCORDION
          ══════════════════════════════════════════════════════ */}
      <section id="faq" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs font-semibold mb-4">
              <MessageSquare className="w-3.5 h-3.5" />
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Pertanyaan{' '}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                yang sering diajukan
              </span>
            </h2>
          </div>

          {/* Accordion */}
          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div
                key={idx}
                className={`rounded-xl border transition-all duration-300
                  ${activeAccordion === idx
                    ? 'border-violet-500/30 bg-violet-500/[0.04]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
              >
                <button
                  onClick={() => setActiveAccordion(activeAccordion === idx ? null : idx)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-semibold text-white pr-4">{item.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-zinc-400 flex-shrink-0 transition-transform duration-300
                      ${activeAccordion === idx ? 'rotate-180 text-violet-400' : ''}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out
                    ${activeAccordion === idx ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 7: CTA BANNER + COSMIC FOOTER
          ══════════════════════════════════════════════════════ */}
      {/* Final CTA */}
      <section className="relative py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative p-8 sm:p-12 rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-500/[0.06] to-transparent">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Siap mengubah cara belajar &{' '}
              <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">bekerja</span>
              ?
            </h2>
            <p className="text-zinc-400 text-base sm:text-lg mb-8 max-w-lg mx-auto">
              Bergabung dengan ribuan pelajar dan profesional yang sudah menggunakan Notara untuk merangkum audio secara otomatis.
            </p>
            <Link
              href={isAuthenticated ? '/dashboard' : '/login'}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-base font-bold
                bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                text-white shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50
                transition-all duration-500 hover:scale-[1.04]"
            >
              <Sparkles className="w-5 h-5" />
              {isAuthenticated ? 'Ke Dashboard' : 'Mulai Gratis Sekarang'}
              <ArrowRight className="w-5 h-5" />
            </Link>

            {/* Ambient glow */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-500/8 blur-[100px] pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.06] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <NotaraBrand variant="horizontal" size={32} />
              <p className="text-sm text-zinc-500 mt-3 leading-relaxed">
                AI-powered audio summarizer untuk pelajar & profesional. Rekam, transkrip, dan rangkum secara otomatis.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-bold text-white mb-4">Produk</h4>
              <div className="space-y-2">
                {['Fitur', 'Harga', 'FAQ'].map((item) => (
                  <button
                    key={item}
                    onClick={() => scrollToSection(item.toLowerCase())}
                    className="block text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-bold text-white mb-4">Legal</h4>
              <div className="space-y-2">
                <span className="block text-sm text-zinc-500">Kebijakan Privasi</span>
                <span className="block text-sm text-zinc-500">Syarat Penggunaan</span>
                <span className="block text-sm text-zinc-500">Cookie Policy</span>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-bold text-white mb-4">Kontak</h4>
              <div className="space-y-2">
                <span className="block text-sm text-zinc-500">support@notara.app</span>
                <span className="block text-sm text-zinc-500">Instagram: @notara.app</span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">
              © {new Date().getFullYear()} Notara Neural Nexus. All rights reserved.
            </p>
            <p className="text-xs text-zinc-700">
              Built with ❤️ by Henry & Team
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
