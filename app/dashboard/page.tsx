'use client';

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { 
  UploadCloud, FileAudio, FileText, Sparkles, 
  Check, Loader2, Clipboard, AlertCircle, Trash2, ArrowLeft, BookOpen,
  Plus, FolderPlus, Folder, Edit3, X, ChevronRight, ChevronDown, MoreVertical,
  Calendar, FileSignature, ArrowUpRight, Menu, MessageSquare, Send, Search, LogOut,
  Shield, QrCode, Key, Share2, Globe, Lock, Copy, ExternalLink,
  Mic, MicOff, Users, UserPlus, Link2, Crown, Hash,
  ImageDown, Smartphone, Square, Download, Clock, Settings, RefreshCw
} from 'lucide-react';
import { NotaraLogo } from '../components/brand/NotaraLogo';
import { StarryBackground } from '../components/ui/StarryBackground';
import { OnboardingModal } from '../components/ui/OnboardingModal';
import { DashboardTour, DEFAULT_TOUR_STEPS } from '../components/ui/DashboardTour';
import { LoginSuccessScreen } from '../components/ui/LoginSuccessScreen';
import { VersionUpdateBanner } from '../components/ui/VersionUpdateBanner';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getAllSummaries,
  createSummary,
  deleteSummary,
  renameSummary,
  moveSummaryToFolder,
  extractTitleFromSummary,
  formatDuration,
  getChatMessages,
  createChatMessage,
  clearChatMessages,
  toggleSummaryPublic,
  getStudyGroups,
  createStudyGroup,
  joinStudyGroup,
  getGroupMembers,
  shareFolderWithGroup,
  getGroupFolders,
  leaveStudyGroup,
  getChatThreads,
  createChatThread,
  deleteChatThread,
  renameChatThread,
  getUserProfile,
  saveOnboardingData,
  getUserSubscription
} from '@/lib/db';
import type { Folder as FolderType, Summary as SummaryType, ChatMessage, StudyGroup, ChatThread } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// ==========================================
// CLIENT AUDIO PROCESSING UTILITIES (WAV Encoder & Slicer)
// ==========================================

// Slice an AudioBuffer from start to end (in seconds)
// Native sample-rate Whisper = 16kHz. WAV di rate asli (44.1kHz) bikin chunk 3-menit
// jadi ~16MB → lewat limit body Vercel (4.5MB). Resample ke 16kHz mono = jauh lebih kecil,
// akurasi Whisper sama (dia memang memproses di 16kHz). Async karena pakai OfflineAudioContext.
const TARGET_SAMPLE_RATE = 16000;

const sliceAudioBuffer = async (buffer: AudioBuffer, start: number, end: number): Promise<AudioBuffer> => {
  const startSample = Math.round(start * buffer.sampleRate);
  const frameCount = Math.max(
    0,
    Math.min(Math.round((end - start) * buffer.sampleRate), buffer.length - startSample)
  );

  const sourceChannels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    sourceChannels.push(buffer.getChannelData(channel));
  }

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const targetLength = Math.max(1, Math.ceil((frameCount / buffer.sampleRate) * TARGET_SAMPLE_RATE));
  const offline = new OfflineCtx(1, targetLength, TARGET_SAMPLE_RATE);

  // Buffer sumber di sample-rate ASLI + downmix mono; di-resample otomatis saat dirender ke 16kHz
  const monoSource = offline.createBuffer(1, Math.max(1, frameCount), buffer.sampleRate);
  const monoData = monoSource.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      sum += sourceChannels[c][startSample + i];
    }
    monoData[i] = sum / buffer.numberOfChannels;
  }

  const node = offline.createBufferSource();
  node.buffer = monoSource;
  node.connect(offline.destination);
  node.start();
  return await offline.startRendering(); // mono @ 16kHz
};

// Convert AudioBuffer to playable WAV Blob (16-bit PCM WAV format)
function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(36 + buffer.length * 2);             // file length - 8
  setUint32(0x45564157);                         // "WAVE"
  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // chunk length
  setUint16(1);                                  // sample format (raw)
  setUint16(numOfChan);                          // channel count
  setUint32(buffer.sampleRate);                  // sample rate
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate (sample rate * block align)
  setUint16(2 * numOfChan);                      // block align (channel count * bytes per sample)
  setUint16(16);                                 // bits per sample
  setUint32(0x61746164);                         // "data" - chunk
  setUint32(buffer.length * 2);                  // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // scale to 16-bit signed integer
      view.setInt16(44 + offset, sample, true); // write 16-bit sample (little endian)
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

// Get the duration of an audio file in seconds
const getAudioDuration = (file: File | Blob): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(Math.round(audio.duration));
    };
    audio.onerror = () => {
      resolve(0); // Fallback if decoding fails
    };
  });
};

// Format file size in bytes to a human readable string
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format relative time for chat thread age description
const formatRelativeTime = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins}m yang lalu`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}j yang lalu`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Kemarin';
    if (diffDays < 7) return `${diffDays} hari yang lalu`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch (e) {
    return 'Baru saja';
  }
};

// ==========================================
// HOME COMPONENT
// ==========================================

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState<boolean>(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Database States
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [summaries, setSummaries] = useState<SummaryType[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all'); // 'all', 'recent', 'uncategorized', or folder_id
  const [selectedSummary, setSelectedSummary] = useState<SummaryType | null>(null);
  
  // Chatbot States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(true);
  
  // Chatbot Thread States
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [showChatHistory, setShowChatHistory] = useState<boolean>(false);
  
  // Sidebar Expansion States
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false); // Mobile sidebar open
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false); // Desktop locked expansion
  
  // Chatbot Drawer States
  const [isChatOpenMobile, setIsChatOpenMobile] = useState<boolean>(false); // Mobile chatbot active
  const [chatScope, setChatScope] = useState<'summary' | 'folder' | 'global'>('summary'); // Chat context scope
  const [isChatPanelOpen, setIsChatPanelOpen] = useState<boolean>(true); // Desktop chatbot open
  
  // Folder Selector Prominent Dropdown
  const [showFolderSelectDropdown, setShowFolderSelectDropdown] = useState<boolean>(false);

  // Folder Form Modal States
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [folderName, setFolderName] = useState<string>('');
  const [folderColor, setFolderColor] = useState<string>('#8B5CF6');
  const [folderIcon, setFolderIcon] = useState<string>('📁');

  // Summary Edit States
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editingTitleText, setEditingTitleText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');
  const [copied, setCopied] = useState<boolean>(false);
  const [showSharePopover, setShowSharePopover] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);

  // Loading Steps State for Enhanced Loading Animation
  const [loadingStep, setLoadingStep] = useState<number>(1);

  // Thinking Panel States
  const [thinkingLog, setThinkingLog] = useState<string[]>([]);
  const [showThinkingPanel, setShowThinkingPanel] = useState<boolean>(false);
  const [thinkingStartTime, setThinkingStartTime] = useState<number>(0);
  const [thinkingElapsed, setThinkingElapsed] = useState<number>(0);
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Voice Recording States
  const [isRecordingMode, setIsRecordingMode] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Chunking States for Large Files
  const [chunkTotal, setChunkTotal] = useState<number>(1);
  const [chunkCurrent, setChunkCurrent] = useState<number>(1);
  const [chunkProgress, setChunkProgress] = useState<string>('');
  const [isChunkProcessing, setIsChunkProcessing] = useState<boolean>(false);

  // Audio References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Custom refs for deletion explosion effect
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deleteClickCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Hapus',
    cancelText: 'Batal',
    onConfirm: () => {}
  });

  // Custom Toast State — Enhanced with subtitle & action
  const [toast, setToast] = useState<{
    isOpen: boolean;
    message: string;
    subtitle?: string;
    type: 'success' | 'delete' | 'info';
    action?: { label: string; onClick: () => void };
  }>({
    isOpen: false,
    message: '',
    type: 'success'
  });

  // Search states (Sprint 6)
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchFolderFilter, setSearchFolderFilter] = useState<string>('all');
  const [selectedSearchResultIdx, setSelectedSearchResultIdx] = useState<number>(0);

  // Pending summary states for folder assignment (Sprint 7)
  const [pendingSummary, setPendingSummary] = useState<{
    title: string;
    file_name: string | null;
    duration_sec: number | null;
    transcript: string;
    summary: string;
    word_count: number;
  } | null>(null);
  const [showSaveFolderModal, setShowSaveFolderModal] = useState<boolean>(false);
  const [chosenSaveFolderId, setChosenSaveFolderId] = useState<string>('null');

  // Inline folder creation inside Save Folder Modal
  const [isAddingFolderInline, setIsAddingFolderInline] = useState<boolean>(false);
  const [inlineFolderName, setInlineFolderName] = useState<string>('');
  const [inlineFolderIcon, setInlineFolderIcon] = useState<string>('📚');
  const [inlineFolderColor, setInlineFolderColor] = useState<string>('#A78BFA');

  // Upgrade / pay wall modal state (Sprint 8)
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processingQueueActive, setProcessingQueueActive] = useState<boolean>(false);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  const [inlineEditingSummaryId, setInlineEditingSummaryId] = useState<string | null>(null);
  const [inlineEditingTitleText, setInlineEditingTitleText] = useState<string>('');
  const [studySeconds, setStudySeconds] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keamanan Dua Faktor (2FA) States (Sprint 13)
  const [showMfaModal, setShowMfaModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'security' | 'app' | 'billing'>('profile');
  const [editingName, setEditingName] = useState<string>('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaQrCode, setMfaQrCode] = useState<string>('');
  const [mfaSecret, setMfaSecret] = useState<string>('');
  const [mfaFactorId, setMfaFactorId] = useState<string>('');
  const [mfaVerificationCode, setMfaVerificationCode] = useState<string>('');
  const [mfaLoading, setMfaLoading] = useState<boolean>(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [showMfaChallengeBlock, setShowMfaChallengeBlock] = useState<boolean>(false);

  // Voice Input (Mic) States (Sprint 15)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceNotSupported, setVoiceNotSupported] = useState<boolean>(false);
  const speechRecognitionRef = useRef<any>(null);

  // Study Group States (Sprint 16)
  const [studyGroups, setStudyGroups] = useState<any[]>([]);
  const [showStudyGroupModal, setShowStudyGroupModal] = useState<boolean>(false);
  const [studyGroupTab, setStudyGroupTab] = useState<'create' | 'join'>('create');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [studyGroupLoading, setStudyGroupLoading] = useState<boolean>(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  // Share Card States (Sprint 17 — Phase 4.5C)
  const [showShareCardModal, setShowShareCardModal] = useState<boolean>(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState<boolean>(false);
  const [shareCardFormat, setShareCardFormat] = useState<'story' | 'square'>('story');
  const shareCardRef = useRef<HTMLDivElement>(null);

  // Onboarding & Dashboard Tour States
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [showDashboardTour, setShowDashboardTour] = useState<boolean>(false);

  // Full-screen login success states
  const [showLoginSuccess, setShowLoginSuccess] = useState<boolean>(false);
  const [isFirstTimeLogin, setIsFirstTimeLogin] = useState<boolean>(false);

  // Subscription & Billing States (Phase 5)
  const [profileTier, setProfileTier] = useState<'free' | 'pro' | 'max'>('free');
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [ignorePendingSub, setIgnorePendingSub] = useState<boolean>(false);

  // Persistent Desktop Chat Panel State
  useEffect(() => {
    const saved = localStorage.getItem('isChatPanelOpen');
    if (saved !== null) {
      setIsChatPanelOpen(saved === 'true');
    }
  }, []);

  // Focus Timer useEffect — scoped per user account
  useEffect(() => {
    if (!selectedSummary) {
      setStudySeconds(0);
      return;
    }

    // Key includes userId so timer is isolated per account on the same device
    const userId = user?.id ?? 'anonymous';
    const storageKey = `study_time_${userId}_${selectedSummary.id}`;
    const initialTime = parseInt(localStorage.getItem(storageKey) || '0', 10);
    setStudySeconds(initialTime);

    const interval = setInterval(() => {
      setStudySeconds(prev => {
        const nextSec = prev + 1;
        localStorage.setItem(storageKey, nextSec.toString());
        return nextSec;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedSummary, user?.id]);

  // Synchronize chosenSaveFolderId with activeFolderId on sidebar navigation
  useEffect(() => {
    if (activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'uncategorized') {
      setChosenSaveFolderId(activeFolderId);
    } else {
      setChosenSaveFolderId('null');
    }
  }, [activeFolderId]);

  const handleChatInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(120, textareaRef.current.scrollHeight)}px`;
    }
  };

  // Predefined parameters
  const folderColors = ['#A78BFA', '#818CF8', '#22D3EE', '#34D399', '#FBBF24', '#FB7185', '#38BDF8', '#F472B6'];
  const folderEmojis = ['📁', '🧠', '💻', '📐', '📊', '📚', '🧪', '📝', '🎨', '⚙️', '🌐', '⚖️'];

  // Sound Synthesizer chimes
  const playSoundEffect = (type: 'success' | 'delete' | 'info') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'success') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.35);
      } else if (type === 'delete') {
        // Synthesize a digital "dissolve" or "shredder" sound effect
        const now = ctx.currentTime;
        
        // 1. Primary downward sweep (the heavy dissolution)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sawtooth'; // gives it a buzzy, digital quality
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        
        osc1.frequency.setValueAtTime(800, now);
        osc1.frequency.exponentialRampToValueAtTime(80, now + 0.45);
        
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        
        osc1.start(now);
        osc1.stop(now + 0.45);
        
        // 2. High-pitched digital glitter disintegrating (ascending to heaven)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.linearRampToValueAtTime(2400, now + 0.3);
        
        gain2.gain.setValueAtTime(0.05, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc2.start(now);
        osc2.stop(now + 0.35);

        // 3. Low sub boom for impact
        const oscSub = ctx.createOscillator();
        const gainSub = ctx.createGain();
        oscSub.type = 'triangle';
        oscSub.connect(gainSub);
        gainSub.connect(ctx.destination);
        
        oscSub.frequency.setValueAtTime(120, now);
        oscSub.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        
        gainSub.gain.setValueAtTime(0.12, now);
        gainSub.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        
        oscSub.start(now);
        oscSub.stop(now + 0.52);
      }
    } catch (e) {
      console.warn('AudioContext sound failed:', e);
    }
  };

  // Canvas particle explosion effect for successful deletion
  const triggerParticleExplosion = (x: number, y: number) => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
      rotation: number;
      rotationSpeed: number;
      gravity: number;
      shape: 'circle' | 'square' | 'triangle' | 'star';
    }

    const particles: Particle[] = [];
    const particleCount = 120;
    
    // Aesthetic colors: shades of red, rose, and violet/purple to represent ash/disintegration
    const colors = [
      'rgba(244, 63, 94, ',  // rose-500
      'rgba(225, 29, 72, ',  // rose-600
      'rgba(239, 68, 68, ',  // red-500
      'rgba(168, 85, 247, ', // purple-500
      'rgba(139, 92, 246, ', // violet-500
      'rgba(251, 113, 133, ' // rose-400
    ];

    const shapes: ('circle' | 'square' | 'triangle' | 'star')[] = ['circle', 'square', 'triangle', 'star'];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3; // explosion blast speed
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed - (Math.random() * 4 + 2), // blast slightly upwards
        size: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: Math.random() * 0.02 + 0.015, // lasts 1.5 - 3 seconds
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        gravity: 0.15,
        shape: shapes[Math.floor(Math.random() * shapes.length)]
      });
    }

    // Add some big "text fragments" or "document ashes"
    const textParticles = ['📄', '📝', '🗑️', '✨', '⚡'];
    interface EmojiParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      emoji: string;
      size: number;
      alpha: number;
      decay: number;
      rotation: number;
      rotationSpeed: number;
      gravity: number;
    }
    const emojiParticles: EmojiParticle[] = [];
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      emojiParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        emoji: textParticles[Math.floor(Math.random() * textParticles.length)],
        size: Math.random() * 12 + 12, // 12px to 24px
        alpha: 1,
        decay: Math.random() * 0.015 + 0.01,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        gravity: 0.1
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let active = false;

      // Draw normal particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.alpha <= 0) continue;
        
        active = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98; // air resistance
        p.vy *= 0.98;
        p.rotation += p.rotationSpeed;
        p.alpha -= p.decay;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color + p.alpha + ')';
        // Add subtle shadow glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color + p.alpha * 0.5 + ')';

        ctx.beginPath();
        if (p.shape === 'circle') {
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        } else if (p.shape === 'square') {
          ctx.rect(-p.size, -p.size, p.size * 2, p.size * 2);
        } else if (p.shape === 'triangle') {
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size, p.size);
          ctx.lineTo(-p.size, p.size);
          ctx.closePath();
        } else if (p.shape === 'star') {
          for (let j = 0; j < 5; j++) {
            ctx.lineTo(Math.cos((18 + j * 72) * Math.PI / 180) * p.size, Math.sin((18 + j * 72) * Math.PI / 180) * p.size);
            ctx.lineTo(Math.cos((54 + j * 72) * Math.PI / 180) * (p.size/2), Math.sin((54 + j * 72) * Math.PI / 180) * (p.size/2));
          }
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
      }

      // Draw emoji/document fragments
      for (let i = 0; i < emojiParticles.length; i++) {
        const p = emojiParticles[i];
        if (p.alpha <= 0) continue;

        active = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.rotation += p.rotationSpeed;
        p.alpha -= p.decay;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }

      if (active) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animate();
  };

  const showToast = (message: string, type: 'success' | 'delete' | 'info' = 'success') => {
    setToast({ isOpen: true, message, type });
    playSoundEffect(type);
    
    const timer = setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, 3000);
    return timer;
  };

  const handleLogout = async () => {
    setShowUserDropdown(false);
    setShowSettingsModal(false);
    await supabase.auth.signOut();
    // Set flag so login page can show logout success toast
    localStorage.setItem('logout_success', '1');
    sessionStorage.setItem('logout_success', '1');
    setUser(null);
    setFolders([]);
    setSummaries([]);
    setSelectedSummary(null);
    router.replace('/login');
  };

  // Handle onboarding survey completion — save data, start guided tour
  const handleOnboardingComplete = async (onboardingData: { role: string; university: string; major: string; find_source: string }) => {
    setShowOnboardingModal(false);
    if (user) {
      await saveOnboardingData(user.id, onboardingData);
    }
    // Start guided tour shortly after modal closes
    setTimeout(() => setShowDashboardTour(true), 500);
  };


  const handleUpdateProfile = async () => {
    try {
      setIsUpdatingProfile(true);
      const { error } = await supabase.auth.updateUser({
        data: { full_name: editingName }
      });
      if (error) throw error;
      showToast('Profil berhasil diperbarui!', 'success');
      // Update local state metadata
      setUser(prev => prev ? {
        ...prev,
        user_metadata: {
          ...prev.user_metadata,
          full_name: editingName
        }
      } : null);
    } catch (err: any) {
      console.error('Update profile error:', err);
      showToast(err.message || 'Gagal memperbarui profil.', 'delete');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const loadBillingData = async () => {
    if (!user) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const profile = await getUserProfile(user.id);
      if (profile) {
        setProfileTier(profile.subscription_tier || 'free');
      }
      const sub = await getUserSubscription(user.id);
      setSubscriptionData(sub);
    } catch (err: any) {
      console.error('Error loading billing data:', err);
      setBillingError('Gagal memuat status langganan.');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleUpgrade = async (tier: 'pro' | 'max') => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    setBillingError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Gagal memulai proses pembayaran.');
      }
      
      const { token } = data;

      if (token.startsWith('mock-snap-token-')) {
        // Mode Mock: Simulasikan pembayaran sukses offline
        console.log(`[Billing UI] Simulasikan pembayaran dummy untuk ${tier}...`);
        const orderId = data.order_id;
        const grossAmount = tier === 'max' ? '99000.00' : '49000.00';
        const webhookResponse = await fetch('/api/webhooks/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            transaction_status: 'settlement',
            status_code: '200',
            gross_amount: grossAmount,
            signature_key: 'dummy',
            payment_type: 'gopay'
          })
        });
        const webhookData = await webhookResponse.json();
        if (webhookResponse.ok && webhookData.status === 'success') {
          await loadBillingData();
          showToast(`Pembayaran berhasil! Notara ${tier === 'max' ? 'Max' : 'Pro'} Anda telah aktif. 🎉`, 'success');
        } else {
          throw new Error('Gagal memproses verifikasi sukses pembayaran.');
        }
      } else {
        // Mode Asli Sandbox/Production
        if (typeof window !== 'undefined' && (window as any).snap) {
          (window as any).snap.pay(token, {
            onSuccess: async (result: any) => {
              showToast(`Pembayaran berhasil! Akun ${tier === 'max' ? 'Max' : 'Pro'} Anda aktif. 🎉`, 'success');
              await loadBillingData();
            },
            onPending: async (result: any) => {
              showToast('Pembayaran pending. Selesaikan tagihan Anda.', 'info');
              await loadBillingData();
            },
            onError: async (result: any) => {
              setBillingError('Pembayaran gagal atau dibatalkan.');
              await loadBillingData();
            },
            onClose: () => {
              setIsProcessingPayment(false);
            }
          });
        } else {
          throw new Error('Snap SDK pembayaran belum termuat. Silakan muat ulang.');
        }
      }
    } catch (err: any) {
      console.error(`Upgrade ${tier} error:`, err);
      setBillingError(err.message || 'Gagal memulai transaksi pembayaran.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Load Midtrans Snap Script dynamically
  useEffect(() => {
    if (showSettingsModal && settingsTab === 'billing') {
      loadBillingData();
      
      const isProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true';
      const snapScriptUrl = isProduction
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js';
      const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-dummyClientKey12345';

      const existingScript = document.getElementById('midtrans-snap-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = snapScriptUrl;
        script.id = 'midtrans-snap-script';
        script.setAttribute('data-client-key', clientKey);
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, [showSettingsModal, settingsTab]);

  const openSettings = () => {
    if (user) {
      setEditingName(user.user_metadata?.full_name || '');
      setIgnorePendingSub(false);
      loadBillingData();
    }
    setSettingsTab('profile');
    setShowSettingsModal(true);
  };

  const triggerConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Hapus',
    cancelText = 'Batal'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // MFA functions (Sprint 13)
  const checkMfaStatus = async (currentUser: User) => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      
      const activeFactors = factorsData.all.filter(f => f.status === 'verified');
      const hasActiveMfa = activeFactors.length > 0;
      setMfaEnabled(hasActiveMfa);
      setMfaFactors(activeFactors);
      
      if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        setShowMfaChallengeBlock(true);
      } else {
        setShowMfaChallengeBlock(false);
      }
    } catch (err) {
      console.error('Error checking MFA status:', err);
    }
  };

  const handleMfaEnroll = async () => {
    setMfaLoading(true);
    setMfaError(null);
    setMfaSuccess(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Notara',
        friendlyName: 'Notara Authenticator'
      });
      if (error) throw error;
      
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
    } catch (err: any) {
      console.error('MFA Enroll Error:', err);
      setMfaError(err.message || 'Gagal memulai pendaftaran 2FA.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaVerificationCode || mfaVerificationCode.length !== 6) {
      setMfaError('Masukkan 6 digit kode yang valid.');
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    setMfaSuccess(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId
      });
      if (challengeError) throw challengeError;
      
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaVerificationCode
      });
      if (verifyError) throw verifyError;
      
      setMfaSuccess('Keamanan Dua Faktor (2FA) berhasil diaktifkan!');
      showToast('2FA berhasil diaktifkan! 🔐', 'success');
      setMfaVerificationCode('');
      
      if (user) {
        await checkMfaStatus(user);
      }
    } catch (err: any) {
      console.error('MFA Verify Error:', err);
      setMfaError(err.message || 'Kode salah atau kedaluwarsa. Silakan coba lagi.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    triggerConfirm(
      'Nonaktifkan Keamanan 2FA?',
      'Apakah Anda yakin ingin menonaktifkan Autentikasi Dua Faktor? Akun Anda akan menjadi kurang aman.',
      async () => {
        setMfaLoading(true);
        setMfaError(null);
        setMfaSuccess(null);
        try {
          const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
          if (factorsError) throw factorsError;
          
          const activeFactors = factorsData.all.filter(f => f.status === 'verified');
          for (const factor of activeFactors) {
            const { error: unenrollError } = await supabase.auth.mfa.unenroll({
              factorId: factor.id
            });
            if (unenrollError) throw unenrollError;
          }
          
          showToast('2FA telah dinonaktifkan.', 'info');
          setMfaFactorId('');
          setMfaQrCode('');
          setMfaSecret('');
          setMfaVerificationCode('');
          
          if (user) {
            await checkMfaStatus(user);
          }
        } catch (err: any) {
          console.error('MFA Unenroll Error:', err);
          setMfaError(err.message || 'Gagal menonaktifkan 2FA.');
        } finally {
          setMfaLoading(false);
        }
      },
      'Ya, Nonaktifkan',
      'Batal'
    );
  };

  const handleMfaChallengeVerify = async () => {
    if (!mfaVerificationCode || mfaVerificationCode.length !== 6) {
      setMfaError('Masukkan 6 digit kode yang valid.');
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      
      const verifiedFactor = factorsData.all.find(f => f.status === 'verified');
      if (!verifiedFactor) {
        setMfaError('Tidak ada faktor 2FA terverifikasi ditemukan.');
        return;
      }
      
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: verifiedFactor.id
      });
      if (challengeError) throw challengeError;
      
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: verifiedFactor.id,
        challengeId: challengeData.id,
        code: mfaVerificationCode
      });
      if (verifyError) throw verifyError;
      
      showToast('Verifikasi 2FA berhasil! Selamat datang kembali.', 'success');
      setMfaVerificationCode('');
      setShowMfaChallengeBlock(false);
    } catch (err: any) {
      console.error('MFA Challenge Verify Error:', err);
      setMfaError(err.message || 'Kode salah atau kedaluwarsa. Silakan coba lagi.');
    } finally {
      setMfaLoading(false);
    }
  };

  // Load User & listen to auth state changes
  useEffect(() => {
    let active = true;

    async function checkUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (active) {
          if (user) {
            setUser(user);
            // Check MFA status
            await checkMfaStatus(user);
            // Load database data
            const [fetchedFolders, fetchedSummaries, fetchedGroups] = await Promise.all([
              getFolders(),
              getAllSummaries(),
              getStudyGroups(user.id)
            ]);
            if (active) {
              setFolders(fetchedFolders);
              setSummaries(fetchedSummaries);
              setStudyGroups(fetchedGroups);

              // Auto-select forked summary if redirected from public view
              const forkedId = localStorage.getItem('notara_selected_summary_id');
              if (forkedId) {
                localStorage.removeItem('notara_selected_summary_id');
                const forkedSummary = fetchedSummaries.find(s => s.id === forkedId);
                if (forkedSummary) {
                  setSelectedSummary(forkedSummary);
                }
                const customToast = localStorage.getItem('notara_toast_message');
                if (customToast) {
                  localStorage.removeItem('notara_toast_message');
                  setTimeout(() => {
                    showToast(customToast, 'success');
                  }, 800);
                }
              }

              // ─── CHECK ONBOARDING STATUS ───
              // Show onboarding modal if user hasn't completed it yet
              const profile = await getUserProfile(user.id);
              const loginFlag = sessionStorage.getItem('login_success');
              if (profile && !profile.is_onboarded && active && !loginFlag) {
                setTimeout(() => setShowOnboardingModal(true), 1500);
              }
            }
          } else {
            router.replace('/login');
          }
        }
      } catch (err: any) {
        console.error('Error checking user/data:', err);
        setError('Gagal memuat data dari database. Pastikan koneksi internet stabil.');
      } finally {
        if (active) {
          setIsDataLoading(false);
        }
      }
    }

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        // Check MFA status
        await checkMfaStatus(currentUser);

        // SIGNED_IN fires when user actively logs in (both Google OAuth & email)
        // This is the most reliable way to detect a fresh login vs page refresh
        if (event === 'SIGNED_IN') {
          sessionStorage.setItem('login_success', '1');
        }

        setIsDataLoading(true);
        try {
          const [fetchedFolders, fetchedSummaries, fetchedGroups] = await Promise.all([
            getFolders(),
            getAllSummaries(),
            getStudyGroups(currentUser.id)
          ]);
          if (active) {
            setFolders(fetchedFolders);
            setSummaries(fetchedSummaries);
            setStudyGroups(fetchedGroups);
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (active) {
            setIsDataLoading(false);
          }
        }
      } else {
        setFolders([]);
        setSummaries([]);
        setSelectedSummary(null);
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Show login success screen when data loading is complete
  useEffect(() => {
    async function checkLoginSuccess() {
      if (!isDataLoading && user) {
        const loginFlag = localStorage.getItem('login_success') || sessionStorage.getItem('login_success');
        if (loginFlag) {
          localStorage.removeItem('login_success');
          sessionStorage.removeItem('login_success');
          try {
            const profile = await getUserProfile(user.id);
            const isFirst = profile ? !profile.is_onboarded : true;
            setIsFirstTimeLogin(isFirst);
            setShowLoginSuccess(true);
          } catch (e) {
            console.error('Error checking onboarding for login screen:', e);
            setIsFirstTimeLogin(false);
            setShowLoginSuccess(true);
          }
        }
      }
    }
    checkLoginSuccess();
  }, [isDataLoading, user]);

  // Sync loading step timeline
  useEffect(() => {
    if (!loading) {
      setLoadingStep(1);
      return;
    }
    const step2Timer = setTimeout(() => {
      setLoadingStep(2);
    }, 4500);

    const step3Timer = setTimeout(() => {
      setLoadingStep(3);
    }, 8500);

    return () => {
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
    };
  }, [loading]);

  // Recording cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Load chat threads when selectedSummary or user changes
  useEffect(() => {
    if (!user) return;
    
    const summaryId = selectedSummary ? selectedSummary.id : null;
    const userId = user.id;
    
    async function loadThreads() {
      try {
        const threads = await getChatThreads(summaryId, userId);
        setChatThreads(threads);
        if (threads.length > 0) {
          setActiveThreadId(threads[0].id);
          setShowChatHistory(false);
        } else {
          setActiveThreadId(null);
          setChatMessages([
            {
              id: 'welcome',
              summary_id: summaryId,
              thread_id: '',
              role: 'assistant',
              content: selectedSummary
                ? 'Halo! Aku Notara. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
                : 'Halo! Saya **Notara AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Notara, mencatat audio/rapat, atau informasi fitur lainnya?',
              created_at: new Date().toISOString()
            }
          ]);
        }
      } catch (err) {
        console.error('Failed to load chat threads:', err);
      }
    }
    
    loadThreads();
  }, [selectedSummary, user]);

  // Load chat messages when activeThreadId changes
  useEffect(() => {
    const summaryId = selectedSummary ? selectedSummary.id : null;
    if (!activeThreadId) {
      setChatMessages([
        {
          id: 'welcome',
          summary_id: summaryId,
          thread_id: '',
          role: 'assistant',
          content: selectedSummary
            ? 'Halo! Aku Notara. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
            : 'Halo! Saya **Notara AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Notara, mencatat audio/rapat, atau informasi fitur lainnya?',
          created_at: new Date().toISOString()
        }
      ]);
      return;
    }
    
    const threadId = activeThreadId;
    async function loadMessages() {
      try {
        const history = await getChatMessages(threadId);
        setChatMessages(history);
      } catch (err) {
        console.error('Failed to load chat messages:', err);
      }
    }
    
    loadMessages();
  }, [activeThreadId, selectedSummary]);

  // Create a new blank thread for the current scope
  const handleCreateNewThread = () => {
    setActiveThreadId(null);
    setShowChatHistory(false);
    const summaryId = selectedSummary ? selectedSummary.id : null;
    setChatMessages([
      {
        id: 'welcome',
        summary_id: summaryId,
        thread_id: '',
        role: 'assistant',
        content: selectedSummary
          ? 'Halo! Aku Notara. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
          : 'Halo! Saya **Notara AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Notara, mencatat audio/rapat, atau informasi fitur lainnya?',
        created_at: new Date().toISOString()
      }
    ]);
  };

  // Delete a specific chat thread
  const handleDeleteThread = async (threadId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    triggerConfirm(
      'Hapus Obrolan ini?',
      'Apakah Anda yakin ingin menghapus riwayat obrolan ini secara permanen?',
      async () => {
        try {
          const success = await deleteChatThread(threadId);
          if (success) {
            setChatThreads(prev => prev.filter(t => t.id !== threadId));
            if (activeThreadId === threadId) {
              setActiveThreadId(null);
            }
            showToast('Obrolan berhasil dihapus.', 'delete');
          } else {
            throw new Error('Gagal menghapus obrolan.');
          }
        } catch (err: any) {
          setError(err.message);
        }
      }
    );
  };

  // Send message to chatbot AI with streaming response
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isSendingChat || !user) return;

    const userMessageText = chatInput.trim();
    setChatInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsSendingChat(true);

    let currentThreadId = activeThreadId;
    const summaryId = selectedSummary ? selectedSummary.id : null;

    // Auto-create a thread if none exists in the active view
    if (!currentThreadId) {
      try {
        const title = userMessageText.slice(0, 30) + (userMessageText.length > 30 ? '...' : '');
        const newThread = await createChatThread(summaryId, user.id, title);
        if (newThread) {
          currentThreadId = newThread.id;
          setChatThreads(prev => [newThread, ...prev]);
          setActiveThreadId(newThread.id);
        } else {
          throw new Error('Gagal membuat thread chat baru.');
        }
      } catch (err: any) {
        console.error('Failed to auto-create thread:', err);
        setError('Gagal memulai obrolan baru.');
        setIsSendingChat(false);
        return;
      }
    }

    // 1. Add user message locally and write to database
    let savedUserMsg: ChatMessage | null = null;
    try {
      savedUserMsg = await createChatMessage(summaryId, currentThreadId, 'user', userMessageText);
    } catch (e) {
      console.error('Failed to save user message to DB:', e);
    }

    const userMessage: ChatMessage = savedUserMsg || {
      id: Math.random().toString(),
      summary_id: summaryId,
      thread_id: currentThreadId,
      role: 'user',
      content: userMessageText,
      created_at: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);

    // 2. Prep context transcript based on scope
    let contextTranscript = '';
    const activeScope = selectedSummary ? chatScope : 'global';

    if (activeScope === 'summary' && selectedSummary) {
      contextTranscript = selectedSummary.transcript;
    } else if (activeScope === 'folder' && selectedSummary) {
      const folderSummaries = summaries.filter(s => s.folder_id === selectedSummary.folder_id);
      contextTranscript = folderSummaries.map(s => `[Dokumen: ${s.title}]\n${s.transcript}`).join('\n\n---\n\n');
    } else {
      // Global Scope: Build Directory Map & Semantic Keyword Search across transcripts
      const directoryMap = folders.map(f => {
        const folderFiles = summaries.filter(s => s.folder_id === f.id);
        return `- Folder: ${f.icon} ${f.name}\n${folderFiles.map(s => `  * Rangkuman: ${s.title}`).join('\n')}`;
      }).join('\n') + `\n- Belum Dikategorikan:\n${summaries.filter(s => !s.folder_id).map(s => `  * Rangkuman: ${s.title}`).join('\n')}`;

      const queryWords = userMessageText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const relevantSummaries = summaries.filter(s => {
        const titleMatch = queryWords.some(w => s.title.toLowerCase().includes(w));
        const transcriptMatch = queryWords.some(w => s.transcript.toLowerCase().includes(w));
        const fName = s.folder_id ? (folders.find(f => f.id === s.folder_id)?.name || '') : '';
        const folderMatch = queryWords.some(w => fName.toLowerCase().includes(w));
        return titleMatch || folderMatch || (transcriptMatch && Math.random() < 0.35);
      }).slice(0, 3);

      const transcriptsContent = relevantSummaries.map(s => {
        const fName = s.folder_id ? (folders.find(f => f.id === s.folder_id)?.name || 'Mata Kuliah') : 'Belum Dikategorikan';
        return `[Dokumen: ${s.title} di Folder: ${fName}]\n${s.transcript}`;
      }).join('\n\n---\n\n');

      contextTranscript = `Daftar Struktur Berkas Mahasiswa (Henry):\n${directoryMap}\n\nTranskrip Berkas yang Relevan dengan Pertanyaan:\n${transcriptsContent || 'Tidak ada berkas yang relevan ditemukan untuk kata kunci tersebut.'}`;
    }

    // 3. Create temp assistant message for streaming display
    const tempAssistantId = Math.random().toString();
    const assistantPlaceholder: ChatMessage = {
      id: tempAssistantId,
      summary_id: summaryId,
      thread_id: currentThreadId,
      role: 'assistant',
      content: '', 
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, assistantPlaceholder]);

    try {
      // 4. Send request to api/chat
      const messageHistoryForApi = chatMessages
        .filter(m => m.id !== 'welcome' && m.id !== tempAssistantId)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessageText,
          contextTranscript,
          history: [...messageHistoryForApi, { role: 'user', content: userMessageText }],
          chatScope: activeScope,
          folderName: selectedSummary ? (folders.find(f => f.id === selectedSummary.folder_id)?.name || 'Mata Kuliah') : ''
        })
      });

      if (!response.ok) {
        throw new Error('Gagal memproses pesan ke chatbot AI.');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming tidak didukung oleh browser Anda.');

      const decoder = new TextDecoder();
      let assistantText = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') break;
            
            try {
              const dataObj = JSON.parse(dataStr);
               const content = dataObj.choices?.[0]?.delta?.content || '';
              if (content) {
                assistantText += content;
                setChatMessages(prev => prev.map(m => 
                  m.id === tempAssistantId ? { ...m, content: assistantText } : m
                ));
              }
            } catch (jsonErr) {
              // chunk incomplete
            }
          }
        }
      }

      // 6. Save completed assistant message to database
      if (assistantText.trim()) {
        try {
          const savedAssistantMsg = await createChatMessage(summaryId, currentThreadId, 'assistant', assistantText);
          if (savedAssistantMsg) {
            setChatMessages(prev => prev.map(m => 
              m.id === tempAssistantId ? savedAssistantMsg : m
            ));
          }
        } catch (dbErr) {
          console.error('Failed to save AI response to Supabase:', dbErr);
        }
      }

    } catch (chatErr: any) {
      console.error(chatErr);
      setChatMessages(prev => prev.map(m => 
        m.id === tempAssistantId 
          ? { ...m, content: '❌ Terjadi kesalahan: ' + (chatErr.message || 'Gagal merespon.') }
          : m
      ));
    } finally {
      setIsSendingChat(false);
    }
  };

  // Clear chat history for the active thread
  const handleClearChat = async () => {
    if (!activeThreadId) return;
    
    triggerConfirm(
      'Hapus Riwayat Chat?',
      'Apakah Anda yakin ingin menghapus semua pesan chat di obrolan ini secara permanen?',
      async () => {
        try {
          const success = await clearChatMessages(activeThreadId);
          if (success) {
            const summaryId = selectedSummary ? selectedSummary.id : null;
            setChatMessages([
              {
                id: 'welcome',
                summary_id: summaryId,
                thread_id: activeThreadId,
                role: 'assistant',
                content: selectedSummary
                  ? 'Halo! Aku Notara. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
                  : 'Halo! Saya **Notara AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Notara, mencatat audio/rapat, atau informasi fitur lainnya?',
                created_at: new Date().toISOString()
              }
            ]);
            showToast('Riwayat chat berhasil dihapus.', 'delete');
          } else {
            throw new Error('Gagal menghapus riwayat chat.');
          }
        } catch (err: any) {
          setError(err.message);
        }
      }
    );
  };

  // Combine sidebar states to determine if sidebar is fully opened
  const isSidebarOpen = sidebarExpanded || sidebarOpen;

  // Filter summaries based on sidebar navigation
  const filteredSummaries = summaries.filter(summary => {
    if (activeFolderId === 'all') return true;
    if (activeFolderId === 'uncategorized') return summary.folder_id === null;
    if (activeFolderId === 'recent') {
      const summaryDate = new Date(summary.created_at).getTime();
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return summaryDate >= sevenDaysAgo;
    }
    return summary.folder_id === activeFolderId;
  });

  // Get active folder details
  const activeFolder = folders.find(f => f.id === activeFolderId);

  // Search results calculation (Sprint 6)
  const searchResults = summaries.filter(s => {
    const matchesQuery = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         s.transcript.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = searchFolderFilter === 'all' || 
                          (searchFolderFilter === 'uncategorized' ? s.folder_id === null : s.folder_id === searchFolderFilter);
    return matchesQuery && matchesFolder;
  });

  // Listen for Ctrl+K & Arrow Keys (Sprint 6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
        setSearchQuery('');
        setSelectedSearchResultIdx(0);
      } else if (showSearchModal) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSearchResultIdx(prev => {
            const nextIdx = prev + 1;
            return nextIdx < searchResults.length ? nextIdx : prev;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSearchResultIdx(prev => {
            const nextIdx = prev - 1;
            return nextIdx >= 0 ? nextIdx : prev;
          });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (searchResults.length > 0 && searchResults[selectedSearchResultIdx]) {
            setSelectedSummary(searchResults[selectedSearchResultIdx]);
            setShowSearchModal(false);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowSearchModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSearchModal, searchResults, selectedSearchResultIdx]);

  // Recording triggers
  const startRecording = async () => {
    // Check monthly limit for Free tier
    const isPro = profileTier !== 'free';
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthSummariesCount = summaries.filter(s => {
      const date = new Date(s.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    if (!isPro && currentMonthSummariesCount >= 5) {
      showToast('Batas bulanan akun gratis tercapai (maksimal 5 rangkuman per bulan).', 'delete');
      setShowUpgradeModal(true);
      return;
    }

    audioChunksRef.current = [];
    setRecordingDuration(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    
    // Request notification permission early (Sprint 8)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
      
      mediaRecorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      
      startTimerInterval();
      
      setupVisualizer(stream);
      
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError('Gagal mengakses mikrofon. Pastikan Anda memberikan izin akses mikrofon.');
    }
  };

  const setupVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      source.connect(analyser);
      drawWaveform();
    } catch (e) {
      console.warn('Failed to setup Web Audio Visualizer:', e);
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!canvas || !analyser) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      ctx.fillStyle = '#0F0E17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#8B5CF6';
      ctx.beginPath();
      
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    
    draw();
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Helper to trigger 30-minute notifications (Sprint 8)
  const triggerReminderNotification = () => {
    showToast('Anda sudah merekam selama 30 menit. Pastikan browser tetap aktif.', 'info');
    playSoundEffect('info');
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Notara Perekam Suara', {
          body: 'Perekaman suara sudah berjalan selama 30 menit. Tab browser Anda masih aktif merekam.'
        });
      }
    }
  };

  // Helper to start the timer interval with safeguards (Sprint 8)
  const startTimerInterval = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(prev => {
        const nextSec = prev + 1;
        
        // Notification reminder every 30 minutes (1800 seconds)
        if (nextSec > 0 && nextSec % 1800 === 0) {
          triggerReminderNotification();
        }

        // Limit check: 30 mins (1800s) for Free, 120 mins (7200s) for Pro
        const isPro = profileTier !== 'free'; // disambung ke subscription_tier (19 Jul 2026)
        const limit = isPro ? 120 * 60 : 30 * 60;
        
        if (nextSec >= limit) {
          setTimeout(() => {
            pauseRecording();
            setShowUpgradeModal(true);
          }, 0);
        }

        return nextSec;
      });
    }, 1000);
  };

  const resumeRecording = () => {
    // Check limits before resuming (Sprint 8)
    const isPro = profileTier !== 'free';
    const limit = isPro ? 120 * 60 : 30 * 60;
    if (recordingDuration >= limit) {
      setShowUpgradeModal(true);
      return;
    }
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimerInterval();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Helper to add a log entry to the thinking panel
  const addThinkingLog = (msg: string) => {
    setThinkingLog(prev => [...prev, msg]);
  };

  // Start/stop the thinking timer
  const startThinkingTimer = () => {
    const startTime = Date.now();
    setThinkingStartTime(startTime);
    setThinkingElapsed(0);
    if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    thinkingTimerRef.current = setInterval(() => {
      setThinkingElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  };

  const stopThinkingTimer = () => {
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  };

  // Save pending summary (Sprint 7)
  const handleSavePendingSummary = async (folderId: string | null) => {
    if (!pendingSummary) return;

    // Check limit of 3 files per folder for Free tier
    const isPro = profileTier !== 'free';
    if (!isPro && folderId) {
      const folderSummariesCount = summaries.filter(s => s.folder_id === folderId).length;
      if (folderSummariesCount >= 3) {
        showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        setShowUpgradeModal(true);
        // Reset queue if limit reached
        setFiles([]);
        setProcessingQueueActive(false);
        return;
      }
    }

    setLoading(true);
    try {
      const newSummary = await createSummary({
        folder_id: folderId,
        title: pendingSummary.title,
        file_name: pendingSummary.file_name,
        duration_sec: pendingSummary.duration_sec,
        transcript: pendingSummary.transcript,
        summary: pendingSummary.summary,
        word_count: pendingSummary.word_count,
      }, user?.id || '');

      if (newSummary) {
        setSummaries(prev => [newSummary, ...prev]);
        setSelectedSummary(newSummary);
        showToast(`Rangkuman "${newSummary.title}" berhasil disimpan!`, 'success');
        
        // If we are processing a queue, go to the next file
        if (processingQueueActive && currentQueueIndex < files.length - 1) {
          const nextIndex = currentQueueIndex + 1;
          setCurrentQueueIndex(nextIndex);
          setPendingSummary(null);
          setShowSaveFolderModal(false);
          await startProcessing(files[nextIndex], files[nextIndex].name, nextIndex);
        } else {
          // Reset queue
          setFiles([]);
          setPendingSummary(null);
          setShowSaveFolderModal(false);
          setProcessingQueueActive(false);
          setCurrentQueueIndex(0);
        }
      } else {
        throw new Error('Gagal menyimpan rangkuman ke database.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal menyimpan rangkuman.');
      setFiles([]);
      setProcessingQueueActive(false);
    } finally {
      setLoading(false);
    }
  };

  // Process Large Audio / Video Files Slicing
  const processLargeAudio = async (largeFile: File | Blob, fileName: string, queueIndex: number | null = null) => {
    setLoading(true);
    setIsChunkProcessing(true);
    setThinkingLog([]);
    setShowThinkingPanel(false);
    startThinkingTimer();

    const isVideo = largeFile instanceof File && largeFile.type.startsWith('video/');
    const fileLabel = isVideo ? 'video' : 'audio';
    const queueLabel = queueIndex !== null ? ` (Berkas ${queueIndex + 1} dari ${files.length})` : '';

    addThinkingLog(`📂 Membaca berkas ${fileLabel} besar${queueLabel} ke memori browser...`);
    setChunkProgress(`Membaca berkas ${fileLabel} besar${queueLabel}...`);

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Browser Anda tidak mendukung Web Audio API.');
      
      const audioCtx = new AudioContextClass();
      const arrayBuffer = await largeFile.arrayBuffer();
      
      addThinkingLog(`🔊 Mengekstrak jalur audio dari berkas ${fileLabel}...`);
      setChunkProgress('Mendekode dan mengekstrak data audio...');

      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (decodeErr) {
        throw new Error(
          'Gagal mendekode audio dari berkas ' + fileLabel + '. ' +
          'Codec yang digunakan mungkin tidak didukung browser. ' +
          'Coba konversikan ke format MP3 atau WAV terlebih dahulu menggunakan aplikasi seperti VLC.'
        );
      }
      const totalDuration = audioBuffer.duration;
      const fileDurationSec = Math.round(totalDuration);
      
      const chunkDuration = 2 * 60; // 2 menit/chunk @16kHz mono ≈ 3.8MB — aman di bawah limit body Vercel (4.5MB)
      const totalChunks = Math.ceil(totalDuration / chunkDuration);
      setChunkTotal(totalChunks);
      addThinkingLog(`✂️ Audio akan dipotong menjadi ${totalChunks} bagian @ 2 menit...`);
      
      let concatenatedTranscript = '';
      
      for (let c = 0; c < totalChunks; c++) {
        setChunkCurrent(c + 1);
        const start = c * chunkDuration;
        const end = Math.min((c + 1) * chunkDuration, totalDuration);
        
        addThinkingLog(`🔪 Memotong bagian ${c + 1}/${totalChunks} (menit ${Math.floor(start/60)}–${Math.floor(end/60)})...`);
        setChunkProgress(`Memotong bagian ${c + 1} dari ${totalChunks}...`);
        
        const slicedBuffer = await sliceAudioBuffer(audioBuffer, start, end);
        
        setChunkProgress(`Mengubah bagian ${c + 1} menjadi WAV...`);
        const wavBlob = bufferToWav(slicedBuffer);
        const wavFile = new File([wavBlob], `chunk-${c + 1}.wav`, { type: 'audio/wav' });
        
        addThinkingLog(`🎙️ Notara mendengarkan bagian ${c + 1}/${totalChunks}...`);
        setChunkProgress(`Notara mendengarkan bagian ${c + 1} dari ${totalChunks}...`);
        
        const formData = new FormData();
        formData.append('file', wavFile);
        
        const response = await fetch('/api/summarize', {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Gagal memproses audio chunk ke-${c + 1}`);
        }
        
        addThinkingLog(`✅ Bagian ${c + 1} selesai ditranskripsi!`);
        concatenatedTranscript += (data.transcript + ' ');
      }
      
      addThinkingLog('📝 Semua bagian selesai! Notara sedang merangkum keseluruhan isi...');
      setChunkProgress('Semua bagian selesai! Notara sedang menyusun rangkuman final...');
      
      const summarizeResponse = await fetch('/api/summarize-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: concatenatedTranscript }),
      });
      
      const summarizeData = await summarizeResponse.json();
      if (!summarizeResponse.ok) {
        throw new Error(summarizeData.error || 'Gagal merangkum seluruh transkrip.');
      }
      
      const title = extractTitleFromSummary(summarizeData.summary);
      const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');
      
      setPendingSummary({
        title,
        file_name: fileName,
        duration_sec: fileDurationSec || null,
        transcript: concatenatedTranscript,
        summary: summarizeData.summary,
        word_count: concatenatedTranscript.split(/\s+/).length,
      });
      setChosenSaveFolderId(targetFolderId);
      setShowSaveFolderModal(true);
      
      if (queueIndex === null) {
        clearFile();
      }
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memproses file audio besar.');
      setProcessingQueueActive(false);
    } finally {
      setLoading(false);
      setIsChunkProcessing(false);
      setChunkProgress('');
      setStatusMessage('');
      stopThinkingTimer();
    }
  };

  // Main Audio Processor
  const startProcessing = async (sourceFile: File | Blob, name: string, queueIndex: number | null = null) => {
    // Check monthly limit for Free tier
    const isPro = profileTier !== 'free';
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthSummariesCount = summaries.filter(s => {
      const date = new Date(s.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    if (!isPro && currentMonthSummariesCount >= 5) {
      showToast('Batas bulanan akun gratis tercapai (maksimal 5 rangkuman per bulan).', 'delete');
      setShowUpgradeModal(true);
      setProcessingQueueActive(false);
      setFiles([]);
      return;
    }

    // Check folder limit early if a specific folder is targeted
    const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');
    if (!isPro && targetFolderId !== 'null') {
      const folderSummariesCount = summaries.filter(s => s.folder_id === targetFolderId).length;
      if (folderSummariesCount >= 3) {
        showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        setShowUpgradeModal(true);
        setProcessingQueueActive(false);
        setFiles([]);
        return;
      }
    }

    const isVideoFile = sourceFile instanceof File && sourceFile.type.startsWith('video/');
    const MAX_FILE_SIZE_LIMIT = 150 * 1024 * 1024; // 150MB — limit to prevent browser crash
    const CHUNK_THRESHOLD = 4 * 1024 * 1024; // 4MB — di atas ini WAJIB chunk di browser (limit body Vercel 4.5MB)

    // Block files larger than 150MB to prevent browser memory exhaust / tab crash
    if (sourceFile instanceof File && sourceFile.size > MAX_FILE_SIZE_LIMIT) {
      setError(
        'Ukuran berkas terlalu besar (>' + Math.round(sourceFile.size / 1024 / 1024) + 'MB). ' +
        'Batas maksimal unggahan langsung adalah 150MB. Silakan kompres video Anda atau ekstrak audio-nya menjadi MP3/M4A terlebih dahulu.'
      );
      setProcessingQueueActive(false);
      return;
    }

    // Any file > 20MB (audio or video) goes through browser chunking
    if (sourceFile instanceof File && sourceFile.size > CHUNK_THRESHOLD) {
      await processLargeAudio(sourceFile, name, queueIndex);
      return;
    }
    
    setLoading(true);
    setError(null);
    setThinkingLog([]);
    setShowThinkingPanel(false);
    startThinkingTimer();
    
    const fileLabel = queueIndex !== null ? ` (Berkas ${queueIndex + 1} dari ${files.length})` : '';
    addThinkingLog(`🎙️ Mulai mendengarkan rekaman${fileLabel}...`);
    setStatusMessage(`🎙️ Sedang mendengar dan menyalin audio${fileLabel}...`);

    try {
      let duration = 0;
      if (sourceFile instanceof File) {
        duration = await getAudioDuration(sourceFile);
      } else if (sourceFile instanceof Blob) {
        duration = recordingDuration;
      }
      
      const formData = new FormData();
      formData.append('file', sourceFile, name);

      const statusInterval = setTimeout(() => {
        addThinkingLog('📖 Transkripsi selesai! Sedang merangkum isi...');
        setStatusMessage('✨ Sedang membaca transkrip dan menyusun rangkuman...');
      }, 4500);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        body: formData,
      });

      clearTimeout(statusInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan saat memproses audio.');
      }

      // Auto-save to Supabase
      const title = extractTitleFromSummary(data.summary);
      const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');

      setPendingSummary({
        title,
        file_name: name,
        duration_sec: duration || null,
        transcript: data.transcript,
        summary: data.summary,
        word_count: data.transcript.split(/\s+/).length,
      });
      setChosenSaveFolderId(targetFolderId);
      setShowSaveFolderModal(true);

      if (queueIndex === null) {
        clearFile();
        setAudioBlob(null);
        setAudioUrl(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memproses audio. Silakan coba lagi.');
      setProcessingQueueActive(false);
    } finally {
      setLoading(false);
      setStatusMessage('');
      stopThinkingTimer();
    }
  };

  const handleSubmit = async () => {
    if (files.length > 0) {
      setProcessingQueueActive(true);
      setCurrentQueueIndex(0);
      await startProcessing(files[0], files[0].name, 0);
    } else if (audioBlob) {
      await startProcessing(audioBlob, `rekaman-${new Date().toISOString().slice(0, 10)}.webm`, null);
    }
  };

  // Convert Markdown to clean HTML for MS Word (Sprint 9)
  const convertMarkdownToHtml = (text: string): string => {
    const lines = text.split('\n');
    const htmlLines: string[] = [];
    let insideList = false;
    let insideTable = false;
    let tableRows: string[][] = [];

    const processInline = (str: string) => {
      return str
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px; color: #b91c1c;">$1</code>');
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const clean = line.trim();

      const isTableRow = clean.startsWith('|') && clean.endsWith('|') && (clean.match(/\|/g) || []).length >= 2;
      if (isTableRow) {
        if (insideList) {
          htmlLines.push('</ul>');
          insideList = false;
        }
        insideTable = true;
        const cols = clean.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cols);
        continue;
      }

      if (insideTable && !isTableRow) {
        if (tableRows.length >= 2) {
          const filteredRows = tableRows.filter(r => !r.every(c => /^[:\-\s]+$/.test(c)));
          let tblHtml = '<table style="border-collapse: collapse; width: 100%; margin: 16pt 0; font-family: Arial, sans-serif;">';
          filteredRows.forEach((row, rIdx) => {
            tblHtml += '<tr>';
            row.forEach(cell => {
              if (rIdx === 0) {
                tblHtml += `<th style="background-color: #f3f0ff; color: #5b21b6; border: 1px solid #ddd; padding: 8pt; text-align: left; font-weight: bold;">${processInline(cell)}</th>`;
              } else {
                tblHtml += `<td style="border: 1px solid #ddd; padding: 8pt; color: #333;">${processInline(cell)}</td>`;
              }
            });
            tblHtml += '</tr>';
          });
          tblHtml += '</table>';
          htmlLines.push(tblHtml);
        }
        tableRows = [];
        insideTable = false;
      }

      if (clean === '---' || clean === '***' || clean === '___') {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push('<hr style="border: 0; border-top: 1px solid #ddd; margin: 20pt 0;" />');
        continue;
      }

      if (clean.startsWith('# ')) {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push(`<h1 style="font-size: 20pt; font-family: Georgia, serif; color: #111; border-bottom: 1px solid #ddd; padding-bottom: 6pt; margin-top: 24pt; margin-bottom: 12pt;">${processInline(clean.substring(2))}</h1>`);
        continue;
      }

      if (clean.startsWith('## ')) {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push(`<h2 style="font-size: 16pt; font-family: Georgia, serif; color: #5b21b6; margin-top: 18pt; margin-bottom: 9pt;">${processInline(clean.substring(3))}</h2>`);
        continue;
      }

      if (clean.startsWith('### ')) {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push(`<h3 style="font-size: 13pt; font-family: Georgia, serif; color: #333; margin-top: 14pt; margin-bottom: 6pt;">${processInline(clean.substring(4))}</h3>`);
        continue;
      }

      if (clean.startsWith('> ')) {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push(`<blockquote style="border-left: 3px solid #7c3aed; background-color: #f5f3ff; padding: 8pt 12pt; margin: 12pt 0; font-style: italic; color: #555;">${processInline(clean.substring(2))}</blockquote>`);
        continue;
      }

      if (clean.startsWith('* ') || clean.startsWith('- ')) {
        if (!insideList) {
          htmlLines.push('<ul style="margin: 12pt 0; padding-left: 20pt; list-style-type: disc;">');
          insideList = true;
        }
        htmlLines.push(`<li style="font-size: 11pt; font-family: Arial, sans-serif; color: #333; margin-bottom: 4pt; line-height: 1.5;">${processInline(clean.substring(2))}</li>`);
        continue;
      }

      const olMatch = clean.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push(`<div style="margin: 6pt 0; font-size: 11pt; font-family: Arial, sans-serif; color: #333; line-height: 1.5;"><span style="font-weight: bold; color: #7c3aed; margin-right: 6pt;">${clean.match(/^\d+/)?.[0]}.</span>${processInline(olMatch[1])}</div>`);
        continue;
      }

      if (clean === '') {
        if (insideList) { htmlLines.push('</ul>'); insideList = false; }
        htmlLines.push('<div style="height: 6pt;"></div>');
        continue;
      }

      if (insideList) { htmlLines.push('</ul>'); insideList = false; }
      htmlLines.push(`<p style="font-size: 11pt; font-family: Arial, sans-serif; color: #333; line-height: 1.5; margin-bottom: 8pt;">${processInline(line)}</p>`);
    }

    if (insideList) htmlLines.push('</ul>');
    if (insideTable && tableRows.length >= 2) {
      const filteredRows = tableRows.filter(r => !r.every(c => /^[:\-\s]+$/.test(c)));
      let tblHtml = '<table style="border-collapse: collapse; width: 100%; margin: 16pt 0; font-family: Arial, sans-serif;">';
      filteredRows.forEach((row, rIdx) => {
        tblHtml += '<tr>';
        row.forEach(cell => {
          if (rIdx === 0) {
            tblHtml += `<th style="background-color: #f3f0ff; color: #5b21b6; border: 1px solid #ddd; padding: 8pt; text-align: left; font-weight: bold;">${processInline(cell)}</th>`;
          } else {
            tblHtml += `<td style="border: 1px solid #ddd; padding: 8pt; color: #333;">${processInline(cell)}</td>`;
          }
        });
        tblHtml += '</tr>';
      });
      tblHtml += '</table>';
      htmlLines.push(tblHtml);
    }

    return htmlLines.join('\n');
  };

  // Export Summary to Word Document (.doc) (Sprint 9)
  const handleExportWord = () => {
    if (!selectedSummary) return;
    try {
      const title = selectedSummary.title;
      const htmlContent = convertMarkdownToHtml(selectedSummary.summary);

      const documentHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <title>${title}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page {
              size: 8.5in 11in;
              margin: 1.0in 1.0in 1.0in 1.0in;
              mso-header-margin: .5in;
              mso-footer-margin: .5in;
              mso-paper-source: 0;
            }
            body {
              font-family: Arial, sans-serif;
            }
          </style>
        </head>
        <body>
          <div style="font-family: Arial, sans-serif;">
            ${htmlContent}
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff' + documentHtml], {
        type: 'application/msword;charset=utf-8'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanTitle = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
      link.download = `${cleanTitle}_Rangkuman_Notara.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast('File Word (.doc) berhasil diunduh!', 'success');
    } catch (e) {
      console.error('Word export error:', e);
      setError('Gagal mengekspor berkas ke Microsoft Word.');
    }
  };

  // Download raw recorded audio Blob (Sprint 9)
  const handleDownloadAudio = () => {
    if (!audioBlob) return;
    try {
      const url = URL.createObjectURL(audioBlob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `Rekaman_Notara_${dateStr}.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('File audio asli berhasil diunduh!', 'success');
    } catch (e) {
      console.error(e);
      setError('Gagal mengunduh berkas audio.');
    }
  };

  // Drag & Drop
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter(file => {
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        const hasValidExt = ['.mp3','.m4a','.wav','.mp4','.mov','.webm','.mkv','.ogg','.aac'].some(ext => file.name.toLowerCase().endsWith(ext));
        return isAudio || isVideo || hasValidExt;
      });

      if (validFiles.length > 0) {
        setFiles(prev => {
          const combined = [...prev, ...validFiles];
          if (combined.length > 3) {
            setError('Batas maksimal antrean adalah 3 file.');
            return combined.slice(0, 3);
          }
          setError(null);
          return combined;
        });
      } else {
        setError('Format tidak didukung. Silakan upload file audio atau video (MP3, MP4, M4A, WAV, WEBM, dll.)');
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(file => {
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        const hasValidExt = ['.mp3','.m4a','.wav','.mp4','.mov','.webm','.mkv','.ogg','.aac'].some(ext => file.name.toLowerCase().endsWith(ext));
        return isAudio || isVideo || hasValidExt;
      });

      if (validFiles.length > 0) {
        setFiles(prev => {
          const combined = [...prev, ...validFiles];
          if (combined.length > 3) {
            setError('Batas maksimal antrean adalah 3 file.');
            return combined.slice(0, 3);
          }
          setError(null);
          return combined;
        });
      } else {
        setError('Format tidak didukung. Silakan upload file audio atau video (MP3, MP4, M4A, WAV, WEBM, dll.)');
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setFiles([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Inline folder creation inside Save Folder Modal
  const handleCreateFolderInline = async () => {
    if (!inlineFolderName.trim()) return;
    try {
      const newFolder = await createFolder({
        name: inlineFolderName,
        color: inlineFolderColor,
        icon: inlineFolderIcon
      }, user?.id || '');
      if (newFolder) {
        setFolders(prev => [...prev, newFolder]);
        setChosenSaveFolderId(newFolder.id);
        setIsAddingFolderInline(false);
        setInlineFolderName('');
        showToast('Mata kuliah baru berhasil dibuat.', 'success');
      } else {
        throw new Error('Gagal membuat mata kuliah baru.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Folder CRUD Operations
  const handleSaveFolder = async () => {
    if (!folderName.trim()) return;

    try {
      if (editingFolder) {
        const success = await updateFolder(editingFolder.id, {
          name: folderName,
          color: folderColor,
          icon: folderIcon
        });
        if (success) {
          setFolders(prev => prev.map(f => f.id === editingFolder.id ? { ...f, name: folderName, color: folderColor, icon: folderIcon } : f));
          showToast('Mata kuliah berhasil diperbarui.', 'success');
        } else {
          throw new Error('Gagal mengupdate folder di Supabase.');
        }
      } else {
        const newFolder = await createFolder({
          name: folderName,
          color: folderColor,
          icon: folderIcon
        }, user?.id || '');
        if (newFolder) {
          setFolders(prev => [...prev, newFolder]);
          showToast('Mata kuliah baru berhasil dibuat! 📁', 'success');
        } else {
          throw new Error('Gagal membuat folder di Supabase.');
        }
      }
      
      setShowFolderModal(false);
      setEditingFolder(null);
      setFolderName('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteFolder = async (folderId: string, event?: React.MouseEvent) => {
    if (event) {
      deleteClickCoords.current = { x: event.clientX, y: event.clientY };
    } else {
      deleteClickCoords.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    triggerConfirm(
      'Hapus Mata Kuliah?',
      'Apakah Anda yakin ingin menghapus mata kuliah ini? Rangkuman di dalamnya akan dialihkan ke "Belum Dikategorikan".',
      async () => {
        try {
          const success = await deleteFolder(folderId);
          if (success) {
            setFolders(prev => prev.filter(f => f.id !== folderId));
            setSummaries(prev => prev.map(s => s.folder_id === folderId ? { ...s, folder_id: null } : s));
            if (activeFolderId === folderId) {
              setActiveFolderId('all');
            }
            setShowFolderModal(false);
            setEditingFolder(null);
            triggerParticleExplosion(deleteClickCoords.current.x, deleteClickCoords.current.y);
            showToast('Mata kuliah berhasil dihapus secara permanen.', 'delete');
          } else {
            throw new Error('Gagal menghapus folder dari Supabase.');
          }
        } catch (err: any) {
          setError(err.message);
        }
      }
    );
  };

  // Summary Actions
  const handleDeleteSummary = async (summaryId: string, event?: React.MouseEvent) => {
    if (event) {
      deleteClickCoords.current = { x: event.clientX, y: event.clientY };
    } else {
      deleteClickCoords.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    triggerConfirm(
      'Hapus Rangkuman?',
      'Apakah Anda yakin ingin menghapus rangkuman ini secara permanen?',
      async () => {
        try {
          const success = await deleteSummary(summaryId);
          if (success) {
            setSummaries(prev => prev.filter(s => s.id !== summaryId));
            setSelectedSummary(null);
            triggerParticleExplosion(deleteClickCoords.current.x, deleteClickCoords.current.y);
            showToast('Rangkuman berhasil dihapus secara permanen dari perpustakaan Anda 🗑️', 'delete');
          } else {
            throw new Error('Gagal menghapus rangkuman.');
          }
        } catch (err: any) {
          setError(err.message);
        }
      }
    );
  };

  const handleTogglePublic = async () => {
    if (!selectedSummary) return;
    try {
      const isPublicNew = !selectedSummary.is_public;
      const res = await toggleSummaryPublic(selectedSummary.id, isPublicNew, selectedSummary.public_slug);
      if (res) {
        const updatedSummary = { ...selectedSummary, is_public: res.is_public, public_slug: res.public_slug };
        setSummaries(prev => prev.map(s => s.id === selectedSummary.id ? updatedSummary : s));
        setSelectedSummary(updatedSummary);
        if (res.is_public) {
          showToast('Tautan berbagi publik berhasil diaktifkan! 🌐', 'success');
        } else {
          showToast('Rangkuman dikembalikan menjadi privat. 🔒', 'success');
        }
      } else {
        throw new Error('Gagal mengubah status berbagi.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ────────────────────────────────────────────────
  // VOICE INPUT (MIC) — Sprint 15
  // ────────────────────────────────────────────────
  const handleToggleMic = () => {
    // Cek dukungan browser
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNotSupported(true);
      showToast('Browser Anda tidak mendukung fitur input suara. Coba gunakan Chrome.', 'delete');
      return;
    }

    if (isListening) {
      // Hentikan perekaman
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // Mulai perekaman baru
    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setChatInput(transcript);
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(120, textareaRef.current.scrollHeight)}px`;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== 'aborted') {
        showToast('Gagal merekam suara. Pastikan mikrofon diizinkan.', 'delete');
      }
    };

    recognition.start();
  };

  // ────────────────────────────────────────────────
  // STUDY GROUP HANDLERS — Sprint 16
  // ────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    setStudyGroupLoading(true);
    try {
      const group = await createStudyGroup(newGroupName.trim(), newGroupDesc.trim(), user.id);
      if (group) {
        setStudyGroups(prev => [...prev, group]);
        setNewGroupName('');
        setNewGroupDesc('');
        setShowStudyGroupModal(false);
        showToast(`Kelompok "${group.name}" berhasil dibuat! 🎉 Kode undangan: ${group.invite_code}`, 'success');
      } else {
        throw new Error('Gagal membuat kelompok belajar.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStudyGroupLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!user || !joinCode.trim()) return;
    setStudyGroupLoading(true);
    try {
      const group = await joinStudyGroup(joinCode.trim(), user.id);
      if (group) {
        setStudyGroups(prev => {
          const exists = prev.find(g => g.id === group.id);
          return exists ? prev : [...prev, group];
        });
        setJoinCode('');
        setShowStudyGroupModal(false);
        showToast(`Berhasil bergabung ke kelompok "${group.name}"! 👥`, 'success');
      } else {
        throw new Error('Kode undangan tidak valid atau kelompok tidak ditemukan.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStudyGroupLoading(false);
    }
  };

  const handleLoadGroupMembers = async (groupId: string) => {
    if (activeGroupId === groupId) {
      setActiveGroupId(null);
      setGroupMembers([]);
      return;
    }
    setActiveGroupId(groupId);
    const members = await getGroupMembers(groupId);
    setGroupMembers(members);
  };

  const handleLeaveGroup = async (groupId: string, groupName: string) => {
    if (!user) return;
    const success = await leaveStudyGroup(groupId, user.id);
    if (success) {
      setStudyGroups(prev => prev.filter(g => g.id !== groupId));
      if (activeGroupId === groupId) {
        setActiveGroupId(null);
        setGroupMembers([]);
      }
      showToast(`Berhasil keluar dari kelompok "${groupName}".`, 'success');
    }
  };

  const handleShareFolderToGroup = async (folderId: string, groupId: string, folderName: string) => {
    const success = await shareFolderWithGroup(folderId, groupId);
    if (success) {
      showToast(`Folder "${folderName}" berhasil dibagikan ke kelompok! 📁`, 'success');
    }
  };

  // ────────────────────────────────────────────────
  // SHARE CARD (4.5C) — Sprint 17
  // ────────────────────────────────────────────────
  const handleGenerateShareCard = async () => {
    if (!selectedSummary || !shareCardRef.current) return;
    setIsGeneratingCard(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#0C0A12',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      const safeTitle = selectedSummary.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40).replace(/\s+/g, '_') || 'notara_card';
      link.download = `notara_${safeTitle}_${shareCardFormat}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Kartu berhasil diunduh! 🎉 Siap dibagikan ke sosmed.', 'success');
    } catch (err) {
      console.error('Share card error:', err);
      showToast('Gagal membuat kartu. Coba lagi.', 'delete');
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleStartRename = () => {

    if (!selectedSummary) return;
    setEditingTitleText(selectedSummary.title);
    setIsEditingTitle(true);
  };

  const handleSaveRename = async () => {
    if (!selectedSummary || !editingTitleText.trim()) return;
    try {
      const success = await renameSummary(selectedSummary.id, editingTitleText);
      if (success) {
        const updatedSummary = { ...selectedSummary, title: editingTitleText };
        setSummaries(prev => prev.map(s => s.id === selectedSummary.id ? updatedSummary : s));
        setSelectedSummary(updatedSummary);
        showToast('Judul rangkuman berhasil diubah.', 'success');
      } else {
        throw new Error('Gagal mengubah judul di database.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsEditingTitle(false);
    }
  };

  const handleMoveFolder = async (folderId: string | null) => {
    if (!selectedSummary) return;
    const targetFolderId = folderId === 'null' ? null : folderId;

    // Check limit of 3 files per folder for Free tier
    const isPro = profileTier !== 'free';
    if (!isPro && targetFolderId) {
      const folderSummariesCount = summaries.filter(s => s.folder_id === targetFolderId).length;
      if (folderSummariesCount >= 3) {
        showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        setShowUpgradeModal(true);
        return;
      }
    }

    try {
      const success = await moveSummaryToFolder(selectedSummary.id, targetFolderId);
      if (success) {
        const updatedSummary = { ...selectedSummary, folder_id: targetFolderId };
        setSummaries(prev => prev.map(s => s.id === selectedSummary.id ? updatedSummary : s));
        setSelectedSummary(updatedSummary);
        showToast(targetFolderId ? 'Rangkuman berhasil dimasukkan ke mata kuliah.' : 'Rangkuman dialihkan ke Belum Dikategorikan.', 'success');
      } else {
        throw new Error('Gagal memindahkan folder di database.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCopy = () => {
    if (!selectedSummary) return;
    const textToCopy = activeTab === 'summary' ? selectedSummary.summary : selectedSummary.transcript;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parser Markdown Premium (Regex-Based)
  const renderMarkdown = (text: string) => {
    const parseInline = (str: string) => {
      let html = str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-violet-300 font-mono text-xs font-semibold">$1</code>');
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-200">$1</em>');
      html = html.replace(/_([^_]+)_/g, '<em class="italic text-zinc-200">$1</em>');
      
      return html;
    };

    const lines = text.split('\n');
    let insideList = false;
    let listItems: React.ReactNode[] = [];
    const elements: React.ReactNode[] = [];

    // Table state
    let tableLines: string[] = [];
    let insideTable = false;

    const flushList = (keyPrefix: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`${keyPrefix}-list`} className="space-y-2.5 my-4 list-disc pl-6 text-zinc-300">
            {listItems}
          </ul>
        );
        listItems = [];
        insideList = false;
      }
    };

    const flushTable = (keyPrefix: string) => {
      if (tableLines.length < 2) {
        tableLines = [];
        insideTable = false;
        return;
      }
      // Parse rows — skip the separator line (line with only |---|---|)
      const rows = tableLines.filter(l => !l.replace(/[|\-:\s]/g, '').trim() === false || !/^[|\s\-:]+$/.test(l));
      const headerRow = rows[0];
      const dataRows = rows.slice(1);
      const parseRow = (row: string) =>
        row.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const headers = parseRow(headerRow);
      elements.push(
        <div key={`table-${keyPrefix}`} className="overflow-x-auto my-6 rounded-xl border border-white/[0.07] shadow-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-violet-600/10 border-b border-white/[0.07]">
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-4 py-3 text-left text-xs font-bold text-violet-300 uppercase tracking-wider"
                    dangerouslySetInnerHTML={{ __html: parseInline(h) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = parseRow(row);
                return (
                  <tr
                    key={ri}
                    className={ri % 2 === 0 ? 'bg-white/[0.01]' : 'bg-white/[0.03]'}
                  >
                    {cells.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-4 py-2.5 text-zinc-300 leading-relaxed border-t border-white/[0.04]"
                        dangerouslySetInnerHTML={{ __html: parseInline(cell) }}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      tableLines = [];
      insideTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = line.trim();

      // Table detection — a line containing | and at least 2 pipes is a table row
      const isTableRow = cleanLine.startsWith('|') && cleanLine.endsWith('|') && (cleanLine.match(/\|/g) || []).length >= 2;
      if (isTableRow) {
        flushList(`tbl-pre-${i}`);
        insideTable = true;
        tableLines.push(cleanLine);
        // Look ahead: if next line is NOT a table row, flush
        const nextLine = lines[i + 1]?.trim() || '';
        const nextIsTableRow = nextLine.startsWith('|') && nextLine.endsWith('|') && (nextLine.match(/\|/g) || []).length >= 2;
        if (!nextIsTableRow) {
          flushTable(`${i}`);
        }
        continue;
      }

      // Flush any in-progress table when we hit a non-table line
      if (insideTable) {
        flushTable(`flush-${i}`);
      }

      // Horizontal rule
      if (cleanLine === '---' || cleanLine === '***' || cleanLine === '___') {
        flushList(`hr-${i}`);
        elements.push(
          <hr key={`hr-${i}`} className="my-6 border-white/[0.07]" />
        );
        continue;
      }

      if (cleanLine.startsWith('# ')) {
        flushList(`h1-${i}`);
        elements.push(
          <h1 key={`h1-${i}`} className="text-2xl md:text-3xl font-extrabold text-white mt-8 mb-4 border-b border-white/10 pb-3 tracking-tight">
            {cleanLine.replace('# ', '')}
          </h1>
        );
        continue;
      }

      if (cleanLine.startsWith('## ')) {
        flushList(`h2-${i}`);
        elements.push(
          <h2 key={`h2-${i}`} className="text-xl md:text-2xl font-bold text-violet-400 mt-8 mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 inline-block"></span>
            {cleanLine.replace('## ', '')}
          </h2>
        );
        continue;
      }

      if (cleanLine.startsWith('### ')) {
        flushList(`h3-${i}`);
        elements.push(
          <h3 key={`h3-${i}`} className="text-lg md:text-xl font-semibold text-zinc-100 mt-6 mb-2">
            {cleanLine.replace('### ', '')}
          </h3>
        );
        continue;
      }

      if (cleanLine.startsWith('> ')) {
        flushList(`bq-${i}`);
        const content = cleanLine.replace(/^>\s+/, '');
        elements.push(
          <blockquote key={`bq-${i}`} className="border-l-4 border-violet-500 bg-violet-500/5 px-4 py-3 rounded-r-xl my-4 text-zinc-300 italic">
            <p dangerouslySetInnerHTML={{ __html: parseInline(content) }} />
          </blockquote>
        );
        continue;
      }

      if (cleanLine.startsWith('* ') || cleanLine.startsWith('- ')) {
        insideList = true;
        const content = cleanLine.replace(/^[\*\-]\s+/, '');
        listItems.push(
          <li 
            key={`li-${i}`} 
            className="leading-relaxed"
            dangerouslySetInnerHTML={{ __html: parseInline(content) }}
          />
        );
        continue;
      }

      const orderListMatch = cleanLine.match(/^\d+\.\s+(.+)$/);
      if (orderListMatch) {
        flushList(`ol-${i}`);
        const content = orderListMatch[1];
        const num = cleanLine.match(/^\d+/)?.[0] || '1';
        elements.push(
          <div key={`ol-${i}`} className="flex gap-3 items-start my-2.5 pl-2">
            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold text-xs flex items-center justify-center mt-0.5">
              {num}
            </span>
            <p 
              className="text-zinc-300 leading-relaxed flex-1"
              dangerouslySetInnerHTML={{ __html: parseInline(content) }}
            />
          </div>
        );
        continue;
      }

      if (cleanLine === '') {
        flushList(`empty-${i}`);
        elements.push(<div key={`empty-${i}`} className="h-3" />);
        continue;
      }

      flushList(`p-${i}`);
      elements.push(
        <p 
          key={`p-${i}`} 
          className="text-zinc-300 leading-relaxed mb-4"
          dangerouslySetInnerHTML={{ __html: parseInline(line) }}
        />
      );
    }

    if (insideList && listItems.length > 0) {
      elements.push(
        <ul key="end-list" className="space-y-2.5 my-4 list-disc pl-6 text-zinc-300">
          {listItems}
        </ul>
      );
    }

    if (insideTable) flushTable('end');

    return elements;
  };

  // getReadingTime helper removed in favor of Fokus Aktif timer & Word Count

  return (
    <div className="flex h-screen w-screen bg-[#08070B] text-zinc-100 font-sans overflow-hidden">
      
      {/* Dynamic Starry Space Background */}
      <StarryBackground />

      {/* ─── ONBOARDING SURVEY MODAL (First-time users) ─── */}
      {showOnboardingModal && user && (
        <OnboardingModal
          userName={user.user_metadata?.full_name || user.email || 'Pengguna'}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* ─── FULL-SCREEN LOGIN SUCCESS SCREEN ─── */}
      {showLoginSuccess && (
        <LoginSuccessScreen
          userName={user?.user_metadata?.full_name || user?.email || 'Pengguna'}
          isFirstTime={isFirstTimeLogin}
          type="login"
          onDismiss={() => {
            setShowLoginSuccess(false);
            if (isFirstTimeLogin) {
              setTimeout(() => {
                setShowOnboardingModal(true);
              }, 300);
            }
          }}
        />
      )}

      {/* ─── DASHBOARD GUIDED TOUR ─── */}
      {showDashboardTour && (
        <DashboardTour
          steps={DEFAULT_TOUR_STEPS}
          onComplete={() => setShowDashboardTour(false)}
          onSkip={() => setShowDashboardTour(false)}
        />
      )}

      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-40 bg-[#0F0E17] border-r border-white/[0.04] flex flex-col transition-all duration-300 shadow-2xl ${
          isSidebarOpen 
            ? 'w-72 translate-x-0' 
            : 'w-16 translate-x-0 -translate-x-full md:translate-x-0'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        
        {/* LOGO AREA */}
        {isSidebarOpen ? (
          <div className="p-4 border-b border-white/[0.04] flex items-center justify-between shrink-0">
            <div className="animate-in fade-in duration-300">
              <NotaraLogo variant="horizontal" size={36} showGlow />
            </div>
            {/* Lock Pin Button */}
            <button 
              onClick={() => setSidebarExpanded(!sidebarExpanded)} 
              className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 transition-colors hidden md:block"
              title={sidebarExpanded ? "Ciutkan Sidebar" : "Kunci Lebar Sidebar"}
            >
              <ChevronRight className={`h-4 w-4 transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        ) : (
          <div className="h-16 border-b border-white/[0.04] flex items-center justify-center shrink-0">
            <button 
              onClick={() => setSidebarExpanded(true)}
              className="hover:scale-105 active:scale-95 transition-all"
              title="Buka Menu Sidebar"
            >
              <NotaraLogo variant="icon" size={32} />
            </button>
          </div>
        )}

        {/* NEW SUMMARY BUTTON */}
        <div className="p-3 shrink-0 flex justify-center">
          {isSidebarOpen ? (
            <button
              onClick={() => {
                setSelectedSummary(null);
                setSidebarOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 group"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90 duration-300" />
              <span>Rangkuman Baru</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setSelectedSummary(null);
              }}
              className="h-10 w-10 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-md shadow-violet-500/15 hover:scale-105 active:scale-95 transition-all duration-200 group"
              title="Buat Rangkuman Baru"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90 duration-300" />
            </button>
          )}
        </div>

        {/* EXPANDED NAVIGATION CONTENT */}
        {isSidebarOpen ? (
          <div className="flex-1 overflow-y-auto px-3 space-y-6 pb-6 scrollbar-thin animate-in fade-in duration-300">
            {/* Library Section */}
            <div>
              <h3 className="px-3 text-[9px] font-bold text-zinc-500 tracking-widest uppercase mb-2">Perpustakaan</h3>
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    setActiveFolderId('all');
                    setSelectedSummary(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'all' 
                      ? 'bg-white/5 text-white font-bold' 
                      : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-violet-400" />
                    <span>Semua Rangkuman</span>
                  </div>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full font-mono text-zinc-400">
                    {summaries.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveFolderId('recent');
                    setSelectedSummary(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'recent' 
                      ? 'bg-white/5 text-white font-bold' 
                      : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                    <span>Baru Ditambahkan</span>
                  </div>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full font-mono text-zinc-400">
                    {summaries.filter(s => {
                      const summaryDate = new Date(s.created_at).getTime();
                      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                      return summaryDate >= sevenDaysAgo;
                    }).length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveFolderId('uncategorized');
                    setSelectedSummary(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'uncategorized' 
                      ? 'bg-white/5 text-white font-bold' 
                      : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Belum Dikategorikan</span>
                  </div>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full font-mono text-zinc-400">
                    {summaries.filter(s => !s.folder_id).length}
                  </span>
                </button>
              </div>
            </div>

            {/* Folders Section */}
            <div data-tour="sidebar-folders">
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase">Mata Kuliah</h3>
                <button 
                  onClick={() => {
                    setEditingFolder(null);
                    setFolderName('');
                    setFolderColor('#8B5CF6');
                    setFolderIcon('📁');
                    setShowFolderModal(true);
                  }}
                  className="text-zinc-500 hover:text-violet-400 p-0.5 rounded hover:bg-white/5 transition-all duration-200"
                  title="Tambah Folder Baru"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {isDataLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 animate-pulse">
                      <div className="h-4 w-4 bg-white/5 rounded-md" />
                      <div className="h-3 bg-white/5 rounded-md w-2/3" />
                    </div>
                  ))
                ) : (
                  <>
                    {folders.map(folder => {
                      const folderSummariesCount = summaries.filter(s => s.folder_id === folder.id).length;
                      const isActive = activeFolderId === folder.id;

                      return (
                        <div 
                          key={folder.id}
                          className={`group/folder flex items-center justify-between rounded-lg transition-all duration-200 ${
                            isActive 
                              ? 'bg-white/5 text-white font-bold' 
                              : 'text-zinc-400 hover:bg-white/[0.02]'
                          }`}
                        >
                          <button
                            onClick={() => {
                              setActiveFolderId(folder.id);
                              setSelectedSummary(null);
                            }}
                            className="flex-1 flex items-center gap-2.5 px-3 py-2 text-xs text-left truncate"
                          >
                            <span className="text-sm select-none">{folder.icon}</span>
                            <span className="truncate">{folder.name}</span>
                            <span 
                              className="h-1.5 w-1.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: folder.color }}
                            />
                          </button>

                          <div className="flex items-center gap-1 pr-2">
                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full font-mono text-zinc-500 group-hover/folder:hidden">
                              {folderSummariesCount}
                            </span>
                            <button
                              onClick={() => {
                                setEditingFolder(folder);
                                setFolderName(folder.name);
                                setFolderColor(folder.color);
                                setFolderIcon(folder.icon);
                                setShowFolderModal(true);
                              }}
                              className="hidden group-hover/folder:block text-zinc-500 hover:text-white p-0.5 rounded hover:bg-white/10"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {folders.length === 0 && (
                      <p className="px-3 py-2 text-[10px] text-zinc-600 italic">Belum ada mata kuliah</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ─── KELOMPOK BELAJAR (Study Groups) ─── */}
            <div className="mt-2">
              <div className="flex items-center justify-between px-3 mb-1.5">
                <span className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase">Kelompok Belajar</span>
                <button
                  onClick={() => setShowStudyGroupModal(true)}
                  className="text-zinc-500 hover:text-violet-400 p-0.5 rounded hover:bg-white/5 transition-all duration-200"
                  title="Buat atau Bergabung Kelompok"
                >
                  <Users className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {studyGroups.length === 0 ? (
                  <button
                    onClick={() => setShowStudyGroupModal(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.02] transition-all duration-200 text-xs"
                  >
                    <UserPlus className="h-3 w-3 flex-shrink-0" />
                    <span>Buat / Bergabung Kelompok</span>
                  </button>
                ) : (
                  studyGroups.map(group => (
                    <div key={group.id}>
                      <div
                        className={`group/sg flex items-center justify-between rounded-lg transition-all duration-200 ${
                          activeGroupId === group.id
                            ? 'bg-violet-900/20 text-violet-300'
                            : 'text-zinc-400 hover:bg-white/[0.02]'
                        }`}
                      >
                        <button
                          onClick={() => handleLoadGroupMembers(group.id)}
                          className="flex-1 flex items-center gap-2.5 px-3 py-2 text-xs text-left truncate"
                        >
                          <Hash className="h-3 w-3 flex-shrink-0 text-violet-500" />
                          <span className="truncate">{group.name}</span>
                          {group.user_role === 'owner' && (
                            <Crown className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" />
                          )}
                        </button>
                        <button
                          onClick={() => handleLeaveGroup(group.id, group.name)}
                          className="hidden group-hover/sg:block text-zinc-600 hover:text-red-400 p-0.5 rounded hover:bg-white/10 mr-2 flex-shrink-0"
                          title="Keluar dari kelompok"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Member list accordion */}
                      {activeGroupId === group.id && groupMembers.length > 0 && (
                        <div className="ml-6 mt-1 mb-2 space-y-1 animate-in slide-in-from-top-1 duration-200">
                          <div className="text-[9px] text-zinc-600 uppercase tracking-wider px-1 mb-1">
                            {groupMembers.length} Anggota
                          </div>
                          {groupMembers.slice(0, 5).map(m => (
                            <div key={m.user_id} className="flex items-center gap-2 text-[10px] text-zinc-500 px-1">
                              <div className="h-4 w-4 rounded-full bg-violet-900/40 border border-violet-700/30 flex items-center justify-center text-[8px] text-violet-400 font-bold flex-shrink-0">
                                {(m.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate">{m.email || m.user_id.slice(0, 8)}</span>
                              {m.role === 'owner' && <Crown className="h-2 w-2 text-amber-400 flex-shrink-0" />}
                            </div>
                          ))}
                          {/* Kode undangan */}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(group.invite_code);
                              showToast(`Kode undangan disalin: ${group.invite_code}`, 'success');
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] text-violet-500 hover:text-violet-300 transition-colors w-full text-left px-1"
                          >
                            <Link2 className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>Kode: <span className="font-mono font-bold">{group.invite_code}</span></span>
                            <Copy className="h-2 w-2 flex-shrink-0 ml-auto" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Summaries History List */}

            <div>
              <h3 className="px-3 text-[9px] font-bold text-zinc-500 tracking-widest uppercase mb-2">
                {activeFolderId === 'all' && "Semua Rangkuman"}
                {activeFolderId === 'recent' && "Baru Ditambahkan"}
                {activeFolderId === 'uncategorized' && "Belum Dikategorikan"}
                {activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'uncategorized' && `Rangkuman ${activeFolder?.name}`}
              </h3>
              <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                {isDataLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-white/[0.01] border border-transparent animate-pulse">
                      <div className="h-3 bg-white/5 rounded-md w-3/4" />
                      <div className="h-2 bg-white/5 rounded-md w-1/2" />
                    </div>
                  ))
                ) : (
                  filteredSummaries.map(summary => {
                    const isSelected = selectedSummary?.id === summary.id;
                    const isInlineEditing = inlineEditingSummaryId === summary.id;

                    if (isInlineEditing) {
                      return (
                        <div 
                          key={summary.id}
                          className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-violet-500/30 animate-in fade-in duration-200"
                        >
                          <input
                            type="text"
                            value={inlineEditingTitleText}
                            onChange={(e) => setInlineEditingTitleText(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                if (!inlineEditingTitleText.trim()) return;
                                try {
                                  const success = await renameSummary(summary.id, inlineEditingTitleText);
                                  if (success) {
                                    setSummaries(prev => prev.map(s => s.id === summary.id ? { ...s, title: inlineEditingTitleText } : s));
                                    if (selectedSummary?.id === summary.id) {
                                      setSelectedSummary(prev => prev ? { ...prev, title: inlineEditingTitleText } : null);
                                    }
                                    showToast('Judul rangkuman berhasil diubah.', 'success');
                                  }
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setInlineEditingSummaryId(null);
                                }
                              } else if (e.key === 'Escape') {
                                setInlineEditingSummaryId(null);
                              }
                            }}
                            className="bg-transparent text-xs text-white px-2 py-1 focus:outline-none w-full font-sans"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (!inlineEditingTitleText.trim()) return;
                              try {
                                const success = await renameSummary(summary.id, inlineEditingTitleText);
                                if (success) {
                                  setSummaries(prev => prev.map(s => s.id === summary.id ? { ...s, title: inlineEditingTitleText } : s));
                                  if (selectedSummary?.id === summary.id) {
                                    setSelectedSummary(prev => prev ? { ...prev, title: inlineEditingTitleText } : null);
                                  }
                                  showToast('Judul rangkuman berhasil diubah.', 'success');
                                }
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setInlineEditingSummaryId(null);
                              }
                            }}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setInlineEditingSummaryId(null)}
                            className="p-1 text-zinc-500 hover:text-zinc-300"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={summary.id}
                        className={`group/summary flex items-center justify-between rounded-lg transition-all duration-200 border ${
                          isSelected 
                            ? 'bg-violet-600/10 border-violet-500/30 text-white font-bold' 
                            : 'border-transparent text-zinc-400 hover:bg-white/[0.01] hover:text-zinc-200'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setSelectedSummary(summary);
                            setSidebarOpen(false);
                          }}
                          className="flex-1 text-left px-3 py-2 truncate min-w-0"
                        >
                          <span className="text-xs font-semibold block truncate text-zinc-200">
                            {summary.title}
                          </span>
                          <span className="text-[9px] text-zinc-500 flex items-center gap-1.5 mt-0.5 font-medium font-mono">
                            <Calendar className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>{new Date(summary.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                            {summary.duration_sec && (
                              <>
                                <span>•</span>
                                <span>{formatDuration(summary.duration_sec)}</span>
                              </>
                            )}
                          </span>
                        </button>

                        <div className="flex-shrink-0 pr-2 flex items-center gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInlineEditingSummaryId(summary.id);
                              setInlineEditingTitleText(summary.title);
                            }}
                            className="hidden group-hover/summary:block text-zinc-500 hover:text-violet-400 p-1.5 rounded hover:bg-violet-500/10 transition-colors"
                            title="Ubah Nama Rangkuman"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSummary(summary.id, e);
                            }}
                            className="hidden group-hover/summary:block text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors"
                            title="Hapus Rangkuman"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {filteredSummaries.length === 0 && (
                  <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-3 bg-white/[0.01] border border-white/[0.03] rounded-2xl mx-3 my-4 animate-in fade-in duration-300">
                    <NotaraLogo variant="icon" animated={true} motionState="thinking" size={32} className="opacity-40" />
                    <div>
                      <p className="text-zinc-400 font-extrabold text-xs">Belum Ada Rangkuman</p>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-[160px] mx-auto leading-normal">
                        Mata kuliah ini belum memiliki berkas. Yuk, unggah berkas audio pertamamu!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* COLLAPSED ICON ONLY NAVIGATION */
          <div className="flex-1 overflow-y-auto py-4 space-y-6 flex flex-col items-center">
            <div className="space-y-2">
              <button
                onClick={() => {
                  setActiveFolderId('all');
                  setSelectedSummary(null);
                }}
                className={`h-10 w-10 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
                  activeFolderId === 'all' ? 'bg-white/5 text-violet-400' : 'text-zinc-500'
                }`}
                title="Semua Rangkuman"
              >
                <BookOpen className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  setActiveFolderId('recent');
                  setSelectedSummary(null);
                }}
                className={`h-10 w-10 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
                  activeFolderId === 'recent' ? 'bg-white/5 text-violet-400' : 'text-zinc-500'
                }`}
                title="Baru Ditambahkan (7 hari terakhir)"
              >
                <Sparkles className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  setActiveFolderId('uncategorized');
                  setSelectedSummary(null);
                }}
                className={`h-10 w-10 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
                  activeFolderId === 'uncategorized' ? 'bg-white/5 text-white' : 'text-zinc-500'
                }`}
                title="Belum Dikategorikan"
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>

            <hr className="w-6 border-white/[0.04] shrink-0" />

            {/* Folder emoji icons */}
            <div className="space-y-2 w-full flex flex-col items-center">
              {folders.map(folder => {
                const isActive = activeFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setActiveFolderId(folder.id);
                      setSelectedSummary(null);
                    }}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all relative ${
                      isActive ? 'bg-white/5 border border-white/10 scale-105' : ''
                    }`}
                    title={folder.name}
                  >
                    <span className="text-base select-none">{folder.icon}</span>
                    <span 
                      className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-[#0F0E17]" 
                      style={{ backgroundColor: folder.color }}
                    />
                  </button>
                );
              })}
              
              <button
                onClick={() => {
                  setEditingFolder(null);
                  setFolderName('');
                  setFolderColor('#8B5CF6');
                  setFolderIcon('📁');
                  setShowFolderModal(true);
                }}
                className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-white/5 hover:text-violet-400 text-zinc-600 transition-all border border-dashed border-white/5"
                title="Tambah Folder Baru"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* SIDEBAR FOOTER */}
        <div className="border-t border-white/[0.04] bg-black/10 shrink-0">
          {/* Version Badge — shown when sidebar is expanded */}
          {isSidebarOpen && (
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Notara</span>
              <span className="text-[10px] font-mono font-bold text-violet-500/60 bg-violet-500/10 border border-violet-500/15 rounded-full px-2 py-0.5">
                v0.0.06
              </span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" title="Versi terkini" />
            </div>
          )}
          <div className="p-3">
            {isSidebarOpen ? (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 rounded-xl transition-all cursor-pointer text-left"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Keluar</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="h-9 w-9 mx-auto flex items-center justify-center rounded-xl text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition-all cursor-pointer"
                title="Keluar"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* RIGHT COLUMN AREA */}
      <div className="flex-1 h-full flex flex-col md:pl-16 transition-all duration-300">
        
        {/* HEADER BAR */}
        <header className="h-14 border-b border-white/[0.04] bg-[#0C0A12]/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 md:h-16">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-white md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-semibold tracking-wide">
                {selectedSummary ? 'Detil Rangkuman' : 'Mulai Rangkum'}
              </span>
              
              {activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'uncategorized' && activeFolder && (
                <>
                  <ChevronRight className="h-3 w-3 text-zinc-600" />
                  <span className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white font-bold flex items-center gap-1.5">
                    <span>{activeFolder.icon}</span>
                    <span>{activeFolder.name}</span>
                  </span>
                </>
              )}

              {activeFolderId === 'uncategorized' && (
                <>
                  <ChevronRight className="h-3 w-3 text-zinc-600" />
                  <span className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 font-bold">
                    📁 Belum Dikategorikan
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Chat Toggle */}
            <button
              onClick={() => setIsChatOpenMobile(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md md:hidden cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat AI</span>
            </button>

            {/* Desktop Chat Toggle */}
            <button
              onClick={() => {
                const nextState = !isChatPanelOpen;
                setIsChatPanelOpen(nextState);
                localStorage.setItem('isChatPanelOpen', String(nextState));
              }}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border transition-all active:scale-95 duration-200 cursor-pointer ${
                isChatPanelOpen 
                  ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/[0.06] hover:border-white/10' 
                  : 'bg-violet-600 hover:bg-violet-500 text-white border-transparent shadow-md shadow-violet-500/20'
              }`}
              title={isChatPanelOpen ? "Sembunyikan Chat Asisten" : "Tampilkan Chat Asisten"}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{isChatPanelOpen ? 'Tutup Chat' : 'Chat AI'}</span>
            </button>

            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold flex items-center gap-1 hidden sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Connected
            </span>

            {/* USER PROFILE & SETTINGS ACTIONS */}
            {user && (
              <div data-tour="global-search" className="flex items-center gap-2">
                <button
                  onClick={openSettings}
                  className="h-8 w-8 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer flex items-center justify-center text-zinc-400"
                  title="Pengaturan Akun"
                >
                  <Settings className="h-4 w-4" />
                </button>

                <button
                  onClick={openSettings}
                  className="relative h-8 w-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white border border-white/10 hover:ring-2 hover:ring-violet-500 transition-all outline-none cursor-pointer"
                  title={user.user_metadata?.full_name || user.email || 'Profil Saya'}
                >
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Avatar"
                      className="h-full w-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>
                      {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* SPLIT WORKSPACE WINDOW */}
        <div className="flex-1 flex flex-row overflow-hidden relative">
          
          {/* COLUMN 2: MIDDLE DOCUMENT AREA */}
          <div className="flex-1 overflow-y-auto p-6 md:p-10 select-text scrollbar-thin">
            
            {error && (
              <div className="max-w-3xl mx-auto mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 shadow-lg shadow-rose-950/20 animate-in fade-in">
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-white text-sm">Terjadi Kesalahan</h4>
                  <p className="text-sm mt-0.5 text-rose-300/90">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-zinc-500 hover:text-white p-0.5">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* UNIFIED NOTARA THINKING LOADER */}
            {loading && (
              <div className="max-w-xl mx-auto text-center py-16 flex flex-col items-center justify-center animate-in fade-in duration-300">

                {/* Notara Animated Logo — Orbit-to-Wave Loading */}
                <div className="relative flex items-center justify-center">
                  <NotaraLogo 
                    variant="icon" 
                    animated 
                    motionState="loading" 
                    size={112} 
                    showGlow 
                  />
                </div>

                {/* Title + Timer */}
                <div className="mt-8 flex flex-col items-center gap-1">
                  <h3 className="text-white font-black text-xl tracking-tight">Notara Thinking...</h3>
                  <p className="text-violet-300 font-mono text-xs font-bold">
                    {thinkingElapsed}s berlalu
                  </p>
                </div>

                {/* Current step message */}
                <p className="text-zinc-400 text-sm mt-3 px-6 leading-relaxed max-w-sm mx-auto min-h-8 animate-pulse">
                  {isChunkProcessing ? chunkProgress : statusMessage}
                </p>

                {/* Progress bar */}
                <div className="w-64 h-2 bg-white/5 border border-white/[0.08] rounded-full mt-5 overflow-hidden relative shadow-[0_0_15px_rgba(124,58,237,0.1)]">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-500 rounded-full animate-shimmer transition-all duration-700"
                    style={{
                      width: isChunkProcessing
                        ? `${Math.max(5, Math.round((chunkCurrent / chunkTotal) * 100))}%`
                        : loadingStep === 1 ? '35%' : loadingStep === 2 ? '75%' : '98%',
                      boxShadow: '0 0 10px #8B5CF6',
                      animationDuration: '2s',
                      animationIterationCount: 'infinite'
                    }}
                  />
                </div>

                {/* Collapsible Thinking Log */}
                {thinkingLog.length > 0 && (
                  <div className="mt-6 w-full max-w-xs">
                    <button
                      onClick={() => setShowThinkingPanel(v => !v)}
                      className="flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-300 font-semibold transition-colors duration-200 mx-auto"
                    >
                      <span className="flex items-center gap-1">
                        {showThinkingPanel ? '▾' : '▸'}
                        Lihat detail proses...
                      </span>
                    </button>

                    {showThinkingPanel && (
                      <div className="mt-2 bg-white/[0.015] border border-white/[0.05] rounded-xl p-3 text-left space-y-1.5 max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {thinkingLog.map((log, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[9px] font-mono text-zinc-600 pt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                            <p className="text-[10px] text-zinc-400 leading-relaxed">{log}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 1: UPLOAD AREA / RECORDER CHOOSE */}
            {!selectedSummary && !loading && (
              isDataLoading ? (
                <div className="max-w-xl mx-auto space-y-6 animate-pulse py-16 text-center">
                  <div className="h-6 bg-white/5 rounded-md w-1/3 mx-auto" />
                  <div className="h-10 bg-white/5 rounded-3xl w-full" />
                  <div className="h-28 bg-white/5 rounded-3xl w-full" />
                  <div className="space-y-3">
                    <div className="h-4 bg-white/5 rounded-md w-full" />
                    <div className="h-4 bg-white/5 rounded-md w-5/6 mx-auto" />
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto animate-in fade-in duration-300 relative">
                  
                  {/* Premium Ambient Dashboard Mesh Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-gradient-to-tr from-violet-600/15 via-indigo-600/10 to-transparent rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow" />
                
                  {/* Jumbotron banner */}
                  <div className="text-center max-w-xl mx-auto mb-8 relative">
                    <span className="px-3.5 py-1.5 rounded-full bg-violet-500/5 border border-violet-500/15 text-violet-300 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 mb-6">
                      <Sparkles className="h-3 w-3 text-violet-400" />
                      NEURAL NEXUS
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4 leading-tight">
                      Reduksi Kuliah 1 Jam <br />
                      <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">Jadi Rangkuman 1 Halaman</span>
                    </h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      Pilih antara mengunggah berkas audio/video rekaman atau merekam secara langsung dari browser laptopmu sekarang.
                    </p>
                  </div>

                  {/* Upload vs Recording Selector Toggle */}
                  <div className="bg-white/[0.02] p-1 rounded-2xl flex max-w-xs mx-auto mb-8 text-xs font-bold border border-white/[0.06] shadow-xl backdrop-blur-md">
                    <button
                      onClick={() => {
                        setIsRecordingMode(false);
                        clearFile();
                      }}
                      className={`flex-1 py-2 rounded-xl transition-all duration-300 cursor-pointer ${
                        !isRecordingMode 
                          ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20 border-t border-white/10' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      onClick={() => {
                        setIsRecordingMode(true);
                        clearFile();
                      }}
                      className={`flex-1 py-2 rounded-xl transition-all duration-300 cursor-pointer ${
                        isRecordingMode 
                          ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20 border-t border-white/10' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Rekam Suara
                    </button>
                  </div>

                {/* CONDITIONAL CONTROLLER */}
                {!isRecordingMode ? (
                  /* UPLOAD INTERFACE */
                  <div 
                    data-tour="upload-area"
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={files.length > 0 ? undefined : handleButtonClick}
                    className={`relative rounded-3xl border-2 border-dashed p-8 md:p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-sm hover:scale-[1.005] hover:animate-pulse-glow ${
                      dragActive 
                        ? 'border-violet-500 bg-violet-600/15 shadow-[0_0_40px_rgba(139,92,246,0.2)] scale-[1.01] animate-pulse-glow' 
                        : 'bg-white/[0.01] border-white/10 hover:border-violet-500/40'
                    }`}
                  >
                    <input 
                      key={files.length > 0 ? 'active' : 'empty'}
                      ref={fileInputRef}
                      type="file" 
                      multiple
                      accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm,.mkv,.ogg,.aac" 
                      className="hidden" 
                      onChange={handleFileChange}
                    />

                    {files.length === 0 ? (
                      <div className="flex flex-col items-center gap-5">
                        <div className="h-16 w-16 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-400 transition-all duration-300 hover:scale-105 animate-float relative group">
                          {/* Notara Animated Logo instead of simple upload cloud */}
                          <NotaraLogo variant="icon" animated={true} motionState={dragActive ? "loading" : "thinking"} size={36} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-white font-extrabold text-sm md:text-base tracking-wide transition-all duration-200">
                            {dragActive ? 'Lepaskan file untuk mengunggah' : 'Tarik & lepas file audio atau video di sini'}
                          </p>
                          <p className="text-zinc-500 text-xs">Atau klik untuk menjelajahi file di perangkat Anda</p>
                        </div>
                        <div className="text-[10px] px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-zinc-400 font-medium font-sans max-w-sm tracking-wide shadow-sm mx-auto animate-pulse">
                          🎧 MP3, M4A, WAV • 🎬 MP4, WEBM, MOV • Maks 3 file sekuensial
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto animate-in zoom-in-95 duration-200">
                        <div className="text-xs font-bold text-zinc-400 self-start">
                          Daftar File Antrean ({files.length}/3):
                        </div>
                        <div className="w-full space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                          {files.map((f, index) => (
                            <div 
                              key={`${f.name}-${index}`}
                              className="flex items-center justify-between p-3.5 rounded-2xl bg-violet-600/5 border border-violet-500/10 hover:border-violet-500/20 transition-all duration-200"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 shrink-0">
                                  <FileAudio className="h-4 w-4" />
                                </div>
                                <div className="text-left min-w-0">
                                  <p className="text-xs font-bold text-white truncate max-w-[200px]" title={f.name}>
                                    {f.name}
                                  </p>
                                  <span className="text-[9px] text-zinc-500 font-mono">
                                    {formatFileSize(f.size)}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFiles(prev => prev.filter((_, i) => i !== index));
                                }}
                                className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                title="Hapus dari antrean"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {files.length < 3 && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleButtonClick();
                            }}
                            className="mt-1 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-bold px-4 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 hover:border-violet-500/20 transition-all duration-200"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Tambah File Lain
                          </button>
                        )}

                        <button 
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            clearFile(); 
                          }}
                          className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 font-bold px-3.5 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/20 transition-all duration-300 active:scale-95 shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus Semua File
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* VOICE RECORD PANEL INTERFACE */
                  <div className="rounded-3xl border border-white/10 bg-white/[0.01] p-8 md:p-12 text-center flex flex-col items-center gap-6 relative overflow-hidden animate-in zoom-in-95 duration-200">
                    
                    {/* Visualizer audio canvas */}
                    <div className="w-full h-32 bg-black/40 rounded-2xl border border-white/[0.04] overflow-hidden relative flex items-center justify-center">
                      <canvas 
                        ref={canvasRef} 
                        className="absolute inset-0 w-full h-full"
                        width={600}
                        height={128}
                      />
                      
                      {!isRecording && !audioBlob && (
                        <div className="relative text-xs text-zinc-500 font-bold flex items-center gap-2">
                          <NotaraLogo variant="icon" animated motionState="thinking" size={18} />
                          Siap merekam suara...
                        </div>
                      )}

                      {audioBlob && !isRecording && (
                        <div className="relative text-xs text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full shadow-lg">
                          <Check className="h-4 w-4" />
                          Audio rekaman ter-cache di browser!
                        </div>
                      )}
                    </div>

                    {/* Timer view */}
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-3xl font-mono font-bold tracking-wider text-white select-none">
                        {formatDuration(recordingDuration)}
                      </span>
                      {isRecording && (
                        <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1.5 animate-pulse flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                          Recording Live
                        </span>
                      )}
                      {isPaused && (
                        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-1.5">
                          Recording Paused
                        </span>
                      )}
                    </div>

                    {/* Audio Preview controls */}
                    {audioUrl && !isRecording && (
                      <div className="w-full max-w-sm mt-1 animate-in fade-in duration-300">
                        <audio src={audioUrl} controls className="w-full focus:outline-none" />
                      </div>
                    )}

                    {/* Action buttons controls row */}
                    <div className="flex items-center gap-3">
                      {!isRecording && !audioBlob ? (
                        /* Initial state */
                        <button
                          onClick={startRecording}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-violet-500/20 transition-all duration-300 active:scale-95"
                        >
                          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                          Mulai Merekam
                        </button>
                      ) : isRecording ? (
                        /* Recording state */
                        <>
                          {isPaused ? (
                            <button
                              onClick={resumeRecording}
                              className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95"
                            >
                              Lanjutkan
                            </button>
                          ) : (
                            <button
                              onClick={pauseRecording}
                              className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95"
                            >
                              Jeda Merekam
                            </button>
                          )}
                          <button
                            onClick={stopRecording}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-rose-950/20 transition-all active:scale-95"
                          >
                            Hentikan & Simpan
                          </button>
                        </>
                      ) : (
                        /* Finished state */
                        <>
                          <button
                            onClick={startRecording}
                            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white font-bold text-xs transition-all active:scale-95"
                          >
                            Rekam Ulang
                          </button>
                          <button
                            onClick={handleDownloadAudio}
                            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <FileAudio className="h-3.5 w-3.5 text-violet-400" />
                            Unduh Audio
                          </button>
                          <button
                            onClick={() => {
                              setAudioBlob(null);
                              setAudioUrl(null);
                              setRecordingDuration(0);
                            }}
                            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/20 text-zinc-500 hover:text-rose-400 font-bold text-xs transition-all active:scale-95"
                          >
                            Batal
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* SUBMIT BUTTON CONTROL ACTION & FOLDER SELECTOR */}
                {(files.length > 0 || audioBlob) && (
                  <div className="mt-8 flex flex-col items-center gap-6 p-6 rounded-3xl bg-white/[0.015] border border-white/[0.04] backdrop-blur-md animate-in fade-in max-w-md mx-auto">
                    
                    {/* Folder Assignment Before Processing */}
                    <div className="w-full space-y-3.5 text-left">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                          <Folder className="h-3.5 w-3.5 text-violet-400" />
                          Simpan ke Mata Kuliah:
                        </label>
                        {!isAddingFolderInline && (
                          <button
                            onClick={() => {
                              setIsAddingFolderInline(true);
                              setInlineFolderName('');
                              setInlineFolderIcon('📚');
                              setInlineFolderColor('#A78BFA');
                            }}
                            className="text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Mata Kuliah Baru
                          </button>
                        )}
                      </div>

                      {isAddingFolderInline ? (
                        /* Inline Folder Form */
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-zinc-500">Nama Mata Kuliah</label>
                            <input
                              type="text"
                              value={inlineFolderName}
                              onChange={(e) => setInlineFolderName(e.target.value)}
                              placeholder="Contoh: Basis Data"
                              className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/40"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-zinc-500 block">Emoji Ikon</label>
                            <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
                              {folderEmojis.map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => setInlineFolderIcon(emoji)}
                                  className={`h-6 w-6 text-xs rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                                    inlineFolderIcon === emoji 
                                      ? 'bg-violet-600/20 border-violet-500 text-white' 
                                      : 'bg-white/[0.02] border-transparent text-zinc-400'
                                  }`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => setIsAddingFolderInline(false)}
                              className="px-2.5 py-1 rounded-lg border border-white/5 text-[9px] font-bold text-zinc-500 hover:text-zinc-300"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleCreateFolderInline}
                              disabled={!inlineFolderName.trim()}
                              className="px-2.5 py-1 rounded-lg bg-violet-600 text-white font-bold text-[9px] disabled:opacity-50"
                            >
                              Buat & Pilih
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Selector Dropdown */
                        <select
                          value={chosenSaveFolderId}
                          onChange={(e) => setChosenSaveFolderId(e.target.value)}
                          className="w-full bg-[#0F0E17] border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500/40 cursor-pointer font-sans"
                        >
                          <option value="null" className="text-zinc-400">📁 Belum Dikategorikan</option>
                          {folders.map(f => (
                            <option key={f.id} value={f.id} className="text-zinc-200">
                              {f.icon} {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <button
                      onClick={handleSubmit}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-violet-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                    >
                      <Sparkles className="h-4 w-4" />
                      Mulai Reduksi & Rangkum
                    </button>
                  </div>
                )}
              </div>
            )
          )}

            {/* SCREEN 2: SUMMARY DETAIL VIEW */}
            {selectedSummary && !loading && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
                
                {/* DETAILS METADATA CARD */}
                <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/[0.04] backdrop-blur-md shadow-2xl space-y-4 relative z-20">
                  
                  {/* Inline title rename & Actions */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                    <div className="flex-1 w-full">
                      {isEditingTitle ? (
                        <div className="flex gap-2 items-center w-full max-w-xl">
                          <input
                            type="text"
                            value={editingTitleText}
                            onChange={(e) => setEditingTitleText(e.target.value)}
                            className="bg-black/40 border border-violet-500/40 rounded-xl px-4 py-2 text-white font-bold text-base focus:outline-none focus:border-violet-500 flex-1 w-full font-sans"
                            placeholder="Masukkan judul rangkuman..."
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                          />
                          <button
                            onClick={handleSaveRename}
                            className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setIsEditingTitle(false)}
                            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title w-full">
                          <h2 className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight select-text">
                            {selectedSummary.title}
                          </h2>
                          <button
                            onClick={handleStartRename}
                            className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 opacity-0 group-hover/title:opacity-100 transition-all duration-200"
                            title="Ubah Judul"
                          >
                            <FileSignature className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:self-center shrink-0 relative">
                      {/* POP PANEL BERBAGI */}
                      <button
                        onClick={() => setShowSharePopover(!showSharePopover)}
                        className={`p-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2 text-xs font-bold ${
                          showSharePopover
                            ? 'bg-violet-600 border-violet-500 text-white shadow shadow-violet-500/20'
                            : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:border-white/20'
                        }`}
                        title="Bagikan Rangkuman"
                      >
                        <Share2 className="h-4 w-4" />
                        <span>Bagikan</span>
                      </button>

                      {showSharePopover && (
                        <>
                          <div 
                            className="fixed inset-0 z-30" 
                            onClick={() => setShowSharePopover(false)}
                          />
                          <div className="absolute right-0 mt-12 w-80 rounded-2xl bg-[#0F0E17]/95 border border-white/[0.08] backdrop-blur-xl p-4 shadow-2xl z-40 animate-in fade-in slide-in-from-top-2 duration-200 text-left space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                              <h4 className="text-sm font-black text-white">Bagikan Rangkuman</h4>
                              <button
                                onClick={() => setShowSharePopover(false)}
                                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                                  {selectedSummary.is_public ? (
                                    <>
                                      <Globe className="h-3.5 w-3.5 text-emerald-400" />
                                      <span className="text-emerald-400 font-bold">Publik</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3.5 w-3.5 text-zinc-500" />
                                      <span>Privat (Hanya Anda)</span>
                                    </>
                                  )}
                                </span>
                                
                                <button
                                  onClick={handleTogglePublic}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
                                    selectedSummary.is_public
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {selectedSummary.is_public ? 'Ubah ke Privat' : 'Aktifkan Link'}
                                </button>
                              </div>

                              {selectedSummary.is_public && selectedSummary.public_slug && (
                                <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                                  <p className="text-[10px] text-zinc-400 font-medium">Siapa saja yang memiliki link ini dapat membaca rangkuman:</p>
                                  <div className="flex gap-2 items-center bg-black/40 border border-white/[0.08] p-2 rounded-xl">
                                    <input
                                      type="text"
                                      readOnly
                                      value={typeof window !== 'undefined' ? `${window.location.origin}/s/${selectedSummary.public_slug}` : ''}
                                      className="bg-transparent text-xs text-zinc-300 font-mono focus:outline-none flex-1 select-all"
                                    />
                                    <button
                                      onClick={() => {
                                        const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/s/${selectedSummary.public_slug}` : '';
                                        navigator.clipboard.writeText(shareUrl);
                                        setCopiedShareLink(true);
                                        showToast('Link berhasil disalin! 📋', 'success');
                                        setTimeout(() => setCopiedShareLink(false), 2000);
                                      }}
                                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                      title="Salin Link"
                                    >
                                      {copiedShareLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                    <a
                                      href={`/s/${selectedSummary.public_slug}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                      title="Buka Halaman Publik"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Share Card (4.5C) Button */}
                      <button
                        onClick={() => setShowShareCardModal(true)}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-violet-500/10 border border-white/10 hover:border-violet-500/20 text-zinc-500 hover:text-violet-400 transition-all duration-200"
                        title="Buat Kartu untuk Sosmed"
                      >
                        <ImageDown className="h-4 w-4" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteSummary(selectedSummary.id, e)}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-zinc-500 hover:text-rose-400 transition-all duration-200"
                        title="Hapus Rangkuman"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>


                  {/* Prominent popover matkul selector & detail row */}
                  <div className="flex flex-wrap items-center gap-y-3 gap-x-5 text-xs text-zinc-400 border-t border-white/[0.04] pt-4">
                    
                    {/* PROMINENT CATEGORY POPULAR DROPDOWN */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowFolderSelectDropdown(!showFolderSelectDropdown)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-violet-500/40 text-xs font-semibold text-zinc-300 hover:text-white transition-all duration-200 shadow-sm"
                      >
                        <Folder className="h-3.5 w-3.5 text-violet-400" />
                        <span>Mata Kuliah:</span>
                        <span className="font-extrabold text-violet-300">
                          {selectedSummary.folder_id 
                            ? folders.find(f => f.id === selectedSummary.folder_id)?.name || 'Belum Dikategorikan'
                            : 'Belum Dikategorikan'}
                        </span>
                        <ChevronDown className="h-3 w-3 text-zinc-500" />
                      </button>

                      {showFolderSelectDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowFolderSelectDropdown(false)}
                          />
                          <div className="absolute left-0 mt-2 w-56 rounded-2xl bg-[#0F0E17] border border-white/[0.08] p-2 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="px-2.5 py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                              Pindahkan ke:
                            </p>
                            <button
                              onClick={() => {
                                handleMoveFolder('null');
                                setShowFolderSelectDropdown(false);
                              }}
                              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors ${
                                !selectedSummary.folder_id 
                                  ? 'bg-violet-600 text-white font-bold' 
                                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                              }`}
                            >
                              📁 Belum Dikategorikan
                            </button>
                            {folders.map(f => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  handleMoveFolder(f.id);
                                  setShowFolderSelectDropdown(false);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors ${
                                  selectedSummary.folder_id === f.id 
                                    ? 'bg-violet-600 text-white font-bold' 
                                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                                }`}
                              >
                                <span>{f.icon}</span>
                                <span className="truncate">{f.name}</span>
                                <span className="h-1.5 w-1.5 rounded-full ml-auto" style={{ backgroundColor: f.color }} />
                              </button>
                            ))}

                            {/* Tambah Mata Kuliah Baru Shortcut */}
                            <div className="border-t border-white/5 mt-1.5 pt-1.5">
                              <button
                                onClick={() => {
                                  setShowFolderSelectDropdown(false);
                                  setEditingFolder(null);
                                  setFolderName('');
                                  setFolderColor('#8B5CF6');
                                  setFolderIcon('📁');
                                  setShowFolderModal(true);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-colors font-bold"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Buat Mata Kuliah Baru</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {selectedSummary.file_name && (
                      <div className="flex items-center gap-1.5">
                        <FileAudio className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="truncate max-w-[160px]" title={selectedSummary.file_name}>{selectedSummary.file_name}</span>
                      </div>
                    )}

                    {selectedSummary.duration_sec && (
                      <div>
                        <span className="font-semibold text-zinc-500">Durasi:</span>{' '}
                        <span className="text-zinc-300 font-mono">{formatDuration(selectedSummary.duration_sec)}</span>
                      </div>
                    )}

                    {selectedSummary.word_count && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div>
                          <span className="font-semibold text-zinc-500">Total Kata:</span>{' '}
                          <span className="text-zinc-300 font-medium">{selectedSummary.word_count} kata</span>
                        </div>
                        <span className="text-zinc-600">•</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1 font-mono bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                          ⏱️ Fokus aktif: {formatDuration(studySeconds)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{new Date(selectedSummary.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>

                {/* TAB WINDOW DISPLAY CARD */}
                <div className="rounded-3xl bg-white/[0.01] border border-white/[0.04] backdrop-blur-md shadow-2xl flex flex-col overflow-hidden min-h-[500px]">
                  
                  <div className="bg-[#0C0A12]/40 px-6 py-4 border-b border-white/[0.04] flex items-center justify-between shrink-0">
                    <div className="bg-white/5 p-1 rounded-xl flex">
                      <button 
                        onClick={() => setActiveTab('summary')}
                        className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 ${
                          activeTab === 'summary' 
                            ? 'bg-violet-600 text-white shadow shadow-violet-500/10' 
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Rangkuman Materi
                      </button>
                      <button 
                        onClick={() => setActiveTab('transcript')}
                        className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 ${
                          activeTab === 'transcript' 
                            ? 'bg-violet-600 text-white shadow shadow-violet-500/10' 
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Salinan Transkrip
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const printStyle = document.createElement('style');
                          printStyle.id = 'notara-print-style';
                          printStyle.innerHTML = `
                            @media print {
                              body > * { display: none !important; }
                              #notara-print-area { display: block !important; }
                              #notara-print-area { font-family: Georgia, serif; color: #000; background: #fff; padding: 2rem; }
                              #notara-print-area h1 { font-size: 1.5rem; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem; }
                              #notara-print-area h2 { font-size: 1.2rem; font-weight: bold; margin-top: 1.5rem; color: #5b21b6; }
                              #notara-print-area table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
                              #notara-print-area th { background: #f3f0ff; padding: 8px; text-align: left; border: 1px solid #ddd; }
                              #notara-print-area td { padding: 8px; border: 1px solid #ddd; }
                              #notara-print-area blockquote { border-left: 3px solid #7c3aed; padding-left: 1rem; color: #555; }
                            }
                          `;
                          document.head.appendChild(printStyle);

                          const printArea = document.createElement('div');
                          printArea.id = 'notara-print-area';
                          printArea.style.display = 'none';
                          const titleEl = document.createElement('h1');
                          titleEl.textContent = selectedSummary.title;
                          printArea.appendChild(titleEl);
                          const contentEl = document.createElement('div');
                          // Render summary text as simple text for print
                          contentEl.innerHTML = convertMarkdownToHtml(selectedSummary.summary);
                          printArea.appendChild(contentEl);
                          document.body.appendChild(printArea);

                          window.print();

                          setTimeout(() => {
                            document.head.removeChild(printStyle);
                            document.body.removeChild(printArea);
                          }, 1000);
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.06] hover:border-white/10 active:scale-95 transition-all duration-200"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Export PDF
                      </button>

                      <button
                        onClick={handleExportWord}
                        className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.06] hover:border-white/10 active:scale-95 transition-all duration-200"
                      >
                        <FileSignature className="h-3.5 w-3.5 text-indigo-400" />
                        Export Word
                      </button>

                      {audioBlob && (
                        <button
                          onClick={handleDownloadAudio}
                          className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.06] hover:border-white/10 active:scale-95 transition-all duration-200"
                        >
                          <FileAudio className="h-3.5 w-3.5 text-violet-400" />
                          Unduh Audio
                        </button>
                      )}

                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs font-bold text-white px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all duration-200"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                            Tersalin!
                          </>
                        ) : (
                          <>
                            <Clipboard className="h-3.5 w-3.5" />
                            Salin Teks
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 p-6 md:p-8 select-text overflow-y-auto">
                    {activeTab === 'summary' ? (
                      <div className="prose prose-invert max-w-none text-zinc-300 select-text leading-relaxed text-sm">
                        {renderMarkdown(selectedSummary.summary)}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/5 pb-2">
                          <FileText className="h-4 w-4 text-violet-400" />
                          Salinan Suara (Transkrip)
                        </h3>
                        <div className="text-zinc-300 leading-relaxed font-sans text-sm whitespace-pre-wrap select-text p-4 rounded-2xl bg-black/25 border border-white/[0.02]">
                          {selectedSummary.transcript}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* COLUMN 3: RIGHT CHAT PANEL */}
          <>
            {isChatOpenMobile && (
              <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in"
                onClick={() => setIsChatOpenMobile(false)}
              />
            )}

            <div data-tour="chat-panel" className={`fixed inset-y-0 right-0 z-40 bg-[#0F0E17] flex flex-col transition-all duration-300 md:static md:translate-x-0 ${
              isChatOpenMobile 
                ? 'w-80 translate-x-0 border-l border-white/[0.04]' 
                : 'translate-x-full'
            } ${
              isChatPanelOpen 
                ? 'w-80 md:w-96 md:border-l md:border-white/[0.04]' 
                : 'w-0 md:w-0 md:border-l-0 overflow-hidden'
            }`}>
              <div className="w-80 md:w-[384px] h-full flex flex-col shrink-0">
                
                <div className="bg-[#0C0A12]/40 px-4 py-3.5 border-b border-white/[0.04] space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <NotaraLogo variant="icon" size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white leading-none">Neural Nexus</h4>
                        <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider block mt-0.5">Neural Nexus</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCreateNewThread}
                        className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-all duration-200"
                        title="Obrolan Baru"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => setShowChatHistory(!showChatHistory)}
                        className={`p-1.5 rounded-lg transition-all duration-200 ${
                          showChatHistory
                            ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                            : 'text-zinc-500 hover:text-white hover:bg-white/5'
                        }`}
                        title="Riwayat Obrolan"
                      >
                        <Clock className="h-4 w-4" />
                      </button>

                      {chatMessages.length > 0 && !showChatHistory && (
                        <button
                          onClick={handleClearChat}
                          className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-white/5 transition-all duration-200"
                          title="Hapus Riwayat Chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      
                      <button 
                        onClick={() => {
                          setIsChatOpenMobile(false);
                          setIsChatPanelOpen(false);
                          localStorage.setItem('isChatPanelOpen', 'false');
                        }}
                        className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 transition-all duration-200"
                        title="Tutup Chat"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {showChatHistory ? (
                    <div className="py-1 px-2.5 rounded-lg bg-violet-600/10 border border-violet-500/20 text-[9px] font-bold text-violet-300 uppercase tracking-widest text-center select-none font-mono">
                      🕒 Riwayat Percakapan
                    </div>
                  ) : selectedSummary ? (
                    <div className="bg-white/5 p-0.5 rounded-lg flex text-[9px] font-bold">
                      <button
                        onClick={() => setChatScope('summary')}
                        className={`flex-1 py-1 rounded-md transition-all duration-200 ${
                          chatScope === 'summary' 
                            ? 'bg-violet-600 text-white shadow shadow-violet-500/10' 
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        🎯 Rangkuman
                      </button>
                      <button
                        onClick={() => setChatScope('folder')}
                        className={`flex-1 py-1 rounded-md transition-all duration-200 ${
                          chatScope === 'folder' 
                            ? 'bg-violet-600 text-white shadow shadow-violet-500/10' 
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        📚 Folder
                      </button>
                      <button
                        onClick={() => setChatScope('global')}
                        className={`flex-1 py-1 rounded-md transition-all duration-200 ${
                          chatScope === 'global' 
                            ? 'bg-violet-600 text-white shadow shadow-violet-500/10' 
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        🤖 Global
                      </button>
                    </div>
                  ) : (
                    <div className="py-1 px-2.5 rounded-lg bg-white/5 text-[9px] font-bold text-violet-300 uppercase tracking-widest text-center select-none font-mono">
                      🤖 Asisten Notara (Global)
                    </div>
                  )}
                </div>

                {showChatHistory ? (
                  /* THREAD HISTORY VIEW */
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin">
                    {chatThreads.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 py-12 space-y-2">
                        <NotaraLogo variant="icon" animated={true} motionState="thinking" size={32} className="opacity-40" />
                        <div>
                          <p className="text-xs font-bold text-zinc-300">Belum Ada Riwayat Chat</p>
                          <p className="text-[10px] text-zinc-600 mt-1 max-w-[180px] mx-auto leading-normal">
                            Mulai obrolan baru untuk menyimpan riwayat chat Anda di sini.
                          </p>
                        </div>
                      </div>
                    ) : (
                      chatThreads.map((thread) => {
                        const isSelected = activeThreadId === thread.id;
                        return (
                          <div
                            key={thread.id}
                            onClick={() => {
                              setActiveThreadId(thread.id);
                              setShowChatHistory(false);
                            }}
                            className={`group/thread flex items-center justify-between p-3 rounded-2xl cursor-pointer border transition-all duration-200 ${
                              isSelected
                                ? 'bg-violet-600/10 border-violet-500/30 text-white font-bold'
                                : 'bg-white/[0.015] border-transparent hover:bg-white/[0.03] text-zinc-400'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm shrink-0">💬</span>
                                <h4 className="text-xs truncate font-semibold text-zinc-200 group-hover/thread:text-white">
                                  {thread.title}
                                </h4>
                              </div>
                              <span className="text-[9px] text-zinc-500 font-medium font-mono mt-0.5 block pl-6">
                                {formatRelativeTime(thread.created_at)}
                              </span>
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteThread(thread.id);
                              }}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover/thread:opacity-100 transition-all shrink-0"
                              title="Hapus Obrolan"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  /* ACTIVE CHAT MESSAGES VIEW */
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin select-text">
                      {selectedSummary ? (
                        <div className="bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl text-[10px] text-zinc-500 leading-relaxed italic">
                          {chatScope === 'summary' 
                            ? "AI siap menjawab pertanyaan berdasarkan transkrip ini. Data siap dibaca."
                            : chatScope === 'folder'
                              ? `AI akan menggabungkan semua transkrip di folder "${activeFolder?.name || 'Mata Kuliah'}" untuk menjawab pertanyaan secara komprehensif.`
                              : "AI akan menganalisis seluruh transkrip dan mata kuliah Anda untuk menjawab pertanyaan."}
                        </div>
                      ) : (
                        <div className="bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl text-[10px] text-zinc-500 leading-relaxed italic">
                          Tanya saya cara menggunakan Notara, unggah file besar hingga 150MB, atau kelola folder.
                        </div>
                      )}

                      {chatMessages.length === 0 ? (
                        <div className="flex gap-2.5 items-start max-w-[85%]">
                          <div className="h-6 w-6 shrink-0 flex items-center justify-center">
                            <NotaraLogo variant="icon" size={24} />
                          </div>
                          <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-2xl rounded-tl-none text-xs text-zinc-300 leading-relaxed font-sans">
                            {selectedSummary 
                              ? "Halo! Aku Notara. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?"
                              : "Halo! Saya Notara AI. Ada yang bisa saya bantu tentang cara menggunakan Notara, mencatat audio/rapat, atau informasi fitur lainnya?"}
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg) => (
                          msg.role === 'user' ? (
                            <div key={msg.id} className="flex gap-2.5 items-start max-w-[85%] ml-auto justify-end animate-in slide-in-from-right-2 duration-200">
                              <div className="bg-violet-600/20 border border-violet-500/25 p-3 rounded-2xl rounded-tr-none text-xs text-violet-200 leading-relaxed font-sans font-medium select-text break-words">
                                {msg.content}
                              </div>
                            </div>
                          ) : (
                            <div key={msg.id} className="flex gap-2.5 items-start max-w-[85%] animate-in slide-in-from-left-2 duration-200">
                              <div className="h-6 w-6 shrink-0 flex items-center justify-center">
                                <NotaraLogo variant="icon" size={24} animated={msg.content === ''} motionState="thinking" />
                              </div>
                              <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-2xl rounded-tl-none text-xs text-zinc-300 leading-relaxed select-text break-words w-full">
                                {msg.content ? (
                                  <div className="prose prose-invert max-w-none text-zinc-300 select-text leading-relaxed text-xs space-y-2">
                                    {renderMarkdown(msg.content)}
                                  </div>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-zinc-500 italic">
                                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                                    Notara sedang mengetik...
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        ))
                      )}
                    </div>

                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendChatMessage();
                      }}
                      className="p-4 border-t border-white/[0.04] bg-[#0C0A12]/40 shrink-0"
                    >
                      <div className="relative flex items-end">
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          value={chatInput}
                          onChange={handleChatInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendChatMessage();
                            }
                          }}
                          disabled={isSendingChat}
                          placeholder={
                            isListening
                              ? "🎙️ Sedang mendengarkan..."
                              : selectedSummary
                                ? (chatScope === 'summary' 
                                    ? "Tanya materi ulasan ini..." 
                                    : chatScope === 'folder' 
                                      ? `Tanya lintas materi ${activeFolder?.name || ''}...` 
                                      : "Tanya lintas seluruh rangkuman...")
                                : "Tanya asisten global Notara..."
                          }
                          className={`w-full bg-black/40 border rounded-2xl pl-4 pr-20 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50 font-sans resize-none max-h-[120px] overflow-y-auto transition-colors duration-300 ${
                            isListening 
                              ? 'border-rose-500/50 focus:border-rose-400' 
                              : 'border-white/10 focus:border-violet-500/50'
                          }`}
                        />
                        {/* Mic Button — Google-style wave animation when active */}
                        <button
                          type="button"
                          onClick={handleToggleMic}
                          disabled={isSendingChat || voiceNotSupported}
                          className={`absolute right-10 bottom-1 p-1.5 rounded-xl transition-all active:scale-95 duration-200 flex items-center justify-center ${
                            isListening 
                              ? 'w-9 h-8 bg-black/50 border border-rose-500/30' 
                              : 'text-zinc-500 hover:text-violet-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed'
                          }`}
                          title={isListening ? "Hentikan rekaman" : "Input suara (Bahasa Indonesia)"}
                        >
                          {isListening ? (
                            /* Google-style 5-bar wave */
                            <div className="flex items-center gap-[2px] h-5">
                              <div className="mic-bar-1 w-[3px] rounded-full bg-rose-400" style={{height: '4px'}} />
                              <div className="mic-bar-2 w-[3px] rounded-full bg-rose-500" style={{height: '8px'}} />
                              <div className="mic-bar-3 w-[3px] rounded-full bg-rose-400" style={{height: '14px'}} />
                              <div className="mic-bar-4 w-[3px] rounded-full bg-rose-500" style={{height: '6px'}} />
                              <div className="mic-bar-5 w-[3px] rounded-full bg-rose-400" style={{height: '10px'}} />
                            </div>
                          ) : (
                            <Mic className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {/* Send Button */}
                        <button 
                          type="submit"
                          disabled={isSendingChat || !chatInput.trim()}
                          className="absolute right-2 bottom-1.5 p-2 rounded-xl bg-violet-600 text-white disabled:bg-white/5 disabled:text-zinc-600 transition-all active:scale-95 duration-200"
                        >
                          {isSendingChat ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[9px] text-center text-zinc-600 mt-2.5 font-medium">
                        🚀 Notara AI — Tanya apa saja tentang materi ini
                      </p>
                    </form>
                  </>
                )}

              </div>
            </div>
          </>

        </div>

      </div>

      {/* FOLDER CRUD MODAL (CREATE / EDIT) */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowFolderModal(false)} />
          
          <div className="relative w-full max-w-md rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white">
                {editingFolder ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah Baru'}
              </h3>
              <button 
                onClick={() => setShowFolderModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400">Nama Mata Kuliah</label>
                <input 
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Contoh: Basis Data, AI & ML, dsb."
                  className="w-full bg-black/40 border border-white/10 focus:border-violet-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none placeholder-zinc-600 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 block mb-1 font-sans">Pilih Icon Emoji</label>
                <div className="grid grid-cols-6 gap-2">
                  {folderEmojis.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setFolderIcon(emoji)}
                      className={`text-lg p-2 rounded-xl border transition-all duration-150 ${
                        folderIcon === emoji 
                          ? 'bg-violet-600/20 border-violet-500/50 scale-105 shadow-inner shadow-violet-500/20' 
                          : 'bg-black/20 border-transparent hover:bg-white/5'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 block mb-1 font-sans">Warna Penanda</label>
                <div className="flex flex-wrap gap-2.5">
                  {folderColors.map(color => (
                    <button
                      key={color}
                      onClick={() => setFolderColor(color)}
                      className={`h-7 w-7 rounded-full border transition-all duration-150 relative ${
                        folderColor === color 
                          ? 'border-white scale-110 shadow-lg shadow-black/50' 
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {folderColor === color && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-black font-bold">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              {editingFolder ? (
                <button
                  onClick={(e) => handleDeleteFolder(editingFolder.id, e)}
                  className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors border border-transparent hover:border-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Folder
                </button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveFolder}
                  disabled={!folderName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/10 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                >
                  {editingFolder ? 'Simpan Perubahan' : 'Buat Folder'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
          />
          
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 z-50">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-extrabold text-white font-sans">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              {confirmModal.message}
            </p>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
              >
                {confirmModal.cancelText}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs tracking-wide shadow-md shadow-rose-950/20 transition-all duration-200"
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          PREMIUM TOAST NOTIFICATION — Center-bottom, dramatic 
          ════════════════════════════════════════════════════════ */}
      {toast.isOpen && (() => {
        const cfg = {
          success: {
            emoji: '✦',
            label: 'Berhasil!',
            iconGrad: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: 'rgba(16,185,129,0.35)',
            glow: 'rgba(16,185,129,0.18)',
            ring: 'rgba(16,185,129,0.12)',
            bar: '#10B981',
            barGhost: 'rgba(16,185,129,0.15)',
          },
          delete: {
            emoji: '🗑',
            label: 'Dihapus',
            iconGrad: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)',
            border: 'rgba(244,63,94,0.35)',
            glow: 'rgba(244,63,94,0.18)',
            ring: 'rgba(244,63,94,0.10)',
            bar: '#F43F5E',
            barGhost: 'rgba(244,63,94,0.15)',
          },
          info: {
            emoji: 'ℹ',
            label: 'Info',
            iconGrad: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            border: 'rgba(139,92,246,0.35)',
            glow: 'rgba(139,92,246,0.18)',
            ring: 'rgba(139,92,246,0.10)',
            bar: '#8B5CF6',
            barGhost: 'rgba(139,92,246,0.15)',
          },
        }[toast.type];

        return (
          <div
            style={{
              position: 'fixed',
              bottom: '28px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 99990,
              width: 'calc(100% - 48px)',
              maxWidth: '420px',
              animation: 'notara-toast-premium-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(145deg, rgba(18,12,40,0.97) 0%, rgba(10,8,28,0.97) 100%)',
                border: `1px solid ${cfg.border}`,
                borderRadius: '20px',
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 8px 40px rgba(0,0,0,0.55), 0 0 60px ${cfg.glow}`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Gradient top edge */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                background: `linear-gradient(90deg, transparent, ${cfg.bar}, transparent)`,
              }} />

              <div style={{ padding: '16px 18px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Animated icon with pulsing rings */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    position: 'absolute', inset: '-6px', borderRadius: '50%',
                    border: `1px solid ${cfg.ring}`,
                    animation: 'notara-toast-ring 2s ease-in-out infinite',
                  }} />
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '50%',
                    background: cfg.iconGrad,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px',
                    boxShadow: `0 4px 16px ${cfg.glow}`,
                  }}>
                    {cfg.emoji}
                  </div>
                </div>

                {/* Text content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: '13px', fontWeight: 800, color: '#F8FAFC',
                    margin: 0, letterSpacing: '-0.01em',
                  }}>
                    {cfg.label}
                  </p>
                  <p style={{
                    fontSize: '12px', color: 'rgba(248,250,252,0.6)',
                    margin: '3px 0 0', lineHeight: 1.5,
                  }}>
                    {toast.message}
                  </p>
                  {toast.subtitle && (
                    <p style={{
                      fontSize: '11px', color: 'rgba(248,250,252,0.38)',
                      margin: '2px 0 0', lineHeight: 1.4,
                    }}>
                      {toast.subtitle}
                    </p>
                  )}
                  {toast.action && (
                    <button
                      onClick={() => { toast.action!.onClick(); setToast(p => ({ ...p, isOpen: false })); }}
                      style={{
                        marginTop: '8px',
                        background: cfg.bar,
                        border: 'none',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#fff',
                        cursor: 'pointer',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => setToast(p => ({ ...p, isOpen: false }))}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    width: '28px', height: '28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'rgba(248,250,252,0.4)',
                    fontSize: '14px', flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.9)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,250,252,0.4)';
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Auto-dismiss progress bar */}
              <div style={{ height: '3px', background: cfg.barGhost }}>
                <div style={{
                  height: '100%',
                  background: cfg.bar,
                  animation: 'notara-toast-progress 3s linear forwards',
                  transformOrigin: 'left',
                }} />
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes notara-toast-premium-enter {
          0% { opacity: 0; transform: translateX(-50%) translateY(32px) scale(0.92); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes notara-toast-ring {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.18); opacity: 0; }
        }
        @keyframes notara-toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>


      {/* SEARCH COMMAND PALETTE MODAL (Sprint 6) */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
          <div 
            className="absolute inset-0 bg-black/75 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => setShowSearchModal(false)} 
          />
          
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#0F0E17]/95 border border-white/[0.08] p-5 shadow-2xl flex flex-col max-h-[60vh] backdrop-blur-xl animate-in zoom-in-95 duration-200 z-50">
            {/* Input & Filter Header */}
            <div className="flex items-center gap-3 border-b border-white/10 pb-4 shrink-0">
              <Search className="h-5 w-5 text-violet-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedSearchResultIdx(0);
                }}
                placeholder="Cari judul, kata kunci, atau rangkuman..."
                className="bg-transparent text-sm text-white focus:outline-none placeholder-zinc-600 flex-1 font-sans"
              />
              
              {/* Folder Filter */}
              <select
                value={searchFolderFilter}
                onChange={(e) => {
                  setSearchFolderFilter(e.target.value);
                  setSelectedSearchResultIdx(0);
                }}
                className="bg-white/5 border border-white/10 hover:border-violet-500/30 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none cursor-pointer font-sans"
              >
                <option value="all" className="bg-[#0F0E17] text-zinc-300">Semua Folder</option>
                <option value="uncategorized" className="bg-[#0F0E17] text-zinc-300">Belum Dikategorikan</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id} className="bg-[#0F0E17] text-zinc-300">
                    {f.icon} {f.name}
                  </option>
                ))}
              </select>
              
              <button 
                onClick={() => setShowSearchModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Split Results & Preview */}
            <div className="flex-1 min-h-0 flex gap-4 mt-4">
              {/* Left Column: Result List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin">
                {searchResults.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-zinc-500">
                    <p className="text-xs font-bold font-sans">Tidak ada hasil ditemukan</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Coba gunakan kata kunci pencarian yang lain.</p>
                  </div>
                ) : (
                  searchResults.map((result, idx) => {
                    const isSelected = idx === selectedSearchResultIdx;
                    return (
                      <div
                        key={result.id}
                        onMouseEnter={() => setSelectedSearchResultIdx(idx)}
                        onClick={() => {
                          setSelectedSummary(result);
                          setShowSearchModal(false);
                        }}
                        className={`p-3 rounded-2xl cursor-pointer border transition-all duration-200 ${
                          isSelected
                            ? 'bg-violet-600/10 border-violet-500/30 text-white'
                            : 'bg-white/[0.01] border-transparent hover:bg-white/[0.02] text-zinc-400'
                        }`}
                      >
                        <h4 className="text-xs font-bold truncate text-zinc-200">{result.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 font-mono">
                          <span>{new Date(result.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                          <span>•</span>
                          <span className="truncate max-w-[120px]">
                            {result.folder_id
                              ? folders.find(f => f.id === result.folder_id)?.name || 'Mata Kuliah'
                              : '📁 Belum Dikategorikan'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Premium Quick Preview Panel */}
              <div className="w-72 bg-white/[0.015] border border-white/[0.04] rounded-2xl p-4 overflow-y-auto scrollbar-thin hidden sm:flex flex-col select-none">
                {searchResults.length > 0 && searchResults[selectedSearchResultIdx] ? (
                  <div className="space-y-3 flex-1 flex flex-col">
                    <div className="shrink-0">
                      <span className="text-[9px] px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold uppercase tracking-wider">
                        Quick Preview
                      </span>
                      <h4 className="text-xs font-black text-white mt-2 leading-tight">
                        {searchResults[selectedSearchResultIdx].title}
                      </h4>
                      <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                        {searchResults[selectedSearchResultIdx].word_count ? `${searchResults[selectedSearchResultIdx].word_count} kata` : ''}
                      </p>
                    </div>
                    
                    <hr className="border-white/5 shrink-0" />
                    
                    <div className="flex-1 text-[10px] text-zinc-400 leading-relaxed overflow-y-auto scrollbar-none font-sans whitespace-pre-line">
                      {searchResults[selectedSearchResultIdx].summary.replace(/[#*`\-]/g, '').slice(0, 300)}...
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-center text-[10px] text-zinc-600 font-medium">
                    Sorot berkas untuk melihat preview
                  </div>
                )}
              </div>
            </div>

            {/* Footer keyboard guide */}
            <div className="flex items-center gap-4 text-[9px] text-zinc-600 border-t border-white/5 pt-3.5 mt-4 shrink-0 font-medium font-mono select-none">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px]">Esc</kbd> Tutup
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px]">↑↓</kbd> Navigasi
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px]">Enter</kbd> Buka
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SAVE FOLDER ASSIGNMENT MODAL (Sprint 7) */}
      {showSaveFolderModal && pendingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => {
              setShowSaveFolderModal(false);
              setPendingSummary(null);
              setIsAddingFolderInline(false);
            }} 
          />
          
          <div className="relative w-full max-w-md rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 z-50 font-sans">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <Folder className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Simpan Rangkuman Baru
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[280px]" title={pendingSummary.title}>
                  Konfigurasikan judul dan folder tujuan rangkuman Anda.
                </p>
              </div>
            </div>

            <hr className="border-white/5" />

            {/* Editable Title Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400">
                Judul Rangkuman:
              </label>
              <input
                type="text"
                value={pendingSummary.title}
                onChange={(e) => setPendingSummary({ ...pendingSummary, title: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500/50 transition-all font-semibold font-sans"
                placeholder="Nama rangkuman..."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-zinc-400">
                  Pilih Folder / Mata Kuliah:
                </p>
                {!isAddingFolderInline && (
                  <button
                    onClick={() => {
                      setIsAddingFolderInline(true);
                      setInlineFolderName('');
                      setInlineFolderIcon('📚');
                      setInlineFolderColor('#A78BFA');
                    }}
                    className="text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Mata Kuliah Baru
                  </button>
                )}
              </div>
              
              {isAddingFolderInline ? (
                /* Inline Folder Creation Form */
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3.5 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400">Nama Mata Kuliah</label>
                    <input
                      type="text"
                      value={inlineFolderName}
                      onChange={(e) => setInlineFolderName(e.target.value)}
                      placeholder="Contoh: Basis Data"
                      className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 block">Emoji Ikon</label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin max-w-full">
                      {folderEmojis.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setInlineFolderIcon(emoji)}
                          className={`h-7 w-7 text-xs rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                            inlineFolderIcon === emoji 
                              ? 'bg-violet-600/20 border-violet-500 text-white shadow shadow-violet-500/20 scale-105' 
                              : 'bg-white/[0.02] border-transparent hover:bg-white/[0.04] text-zinc-400'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 block">Warna Tema</label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin max-w-full">
                      {folderColors.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setInlineFolderColor(color)}
                          className={`h-6 w-6 rounded-full shrink-0 border transition-all flex items-center justify-center ${
                            inlineFolderColor === color 
                              ? 'border-white scale-110 shadow-lg' 
                              : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {inlineFolderColor === color && <span className="text-[8px] text-white">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingFolderInline(false)}
                      className="px-3 py-1.5 rounded-lg border border-white/5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateFolderInline}
                      disabled={!inlineFolderName.trim()}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold text-[10px] disabled:opacity-50 transition-all active:scale-95 shadow shadow-violet-500/10"
                    >
                      Buat & Pilih
                    </button>
                  </div>
                </div>
              ) : (
                /* Folders selection list */
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                  <button
                    onClick={() => setChosenSaveFolderId('null')}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs text-left transition-all duration-200 border ${
                      chosenSaveFolderId === 'null'
                        ? 'bg-violet-600/15 border-violet-500/40 text-violet-300 font-bold'
                        : 'bg-white/[0.015] border-transparent hover:bg-white/[0.03] text-zinc-400'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>📁</span>
                      <span>Belum Dikategorikan</span>
                    </span>
                    {chosenSaveFolderId === 'null' && <span className="text-[10px]">✓</span>}
                  </button>

                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setChosenSaveFolderId(f.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs text-left transition-all duration-200 border ${
                        chosenSaveFolderId === f.id
                          ? 'bg-violet-600/15 border-violet-500/40 text-violet-300 font-bold'
                          : 'bg-white/[0.015] border-transparent hover:bg-white/[0.03] text-zinc-400'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{f.icon}</span>
                        <span>{f.name}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.color }} />
                        {chosenSaveFolderId === f.id && <span className="text-[10px]">✓</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
              <button
                onClick={() => {
                  setShowSaveFolderModal(false);
                  setPendingSummary(null);
                  setIsAddingFolderInline(false);
                }}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
              >
                Batal
              </button>
              <button
                onClick={() => handleSavePendingSummary(chosenSaveFolderId === 'null' ? null : chosenSaveFolderId)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/20 transition-all duration-200"
              >
                Simpan Rangkuman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPGRADE PRO MODAL (Sprint 8) */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => setShowUpgradeModal(false)} 
          />
          
          <div className="relative w-full max-w-md rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 z-50 font-sans">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Upgrade ke Notara Pro 🚀
                </h3>
                <span className="text-[10px] text-zinc-500 font-bold block mt-0.5">DURASI REKAMAN GRATIS TERBATAS</span>
              </div>
            </div>

            <hr className="border-white/5" />

            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-violet-600/5 border border-violet-500/15 text-xs text-violet-300 leading-relaxed">
                Perekaman langsung untuk akun gratis dijeda otomatis pada menit ke-**30** per sesi. Upgrade ke Pro untuk merekam materi kuliah/rapat yang panjang tanpa jeda.
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-bold text-zinc-400">
                  Fitur Premium Notara Pro:
                </p>
                <ul className="space-y-2 text-xs text-zinc-300 pl-1">
                  <li className="flex items-start gap-2">
                    <span className="text-violet-400 font-bold">✓</span>
                    <span><strong>Durasi Rekam 120 Menit</strong> (Bebas rekam materi panjang tanpa jeda).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-400 font-bold">✓</span>
                    <span><strong>Asisten AI Global</strong> (Tanya jawab lintas semua berkas dan folder).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-400 font-bold">✓</span>
                    <span><strong>Kuota & Folder Unlimited</strong> (Simpan berkas sebanyak yang Anda mau).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-400 font-bold">✓</span>
                    <span><strong>Ekspor Lengkap & Audio Download</strong> (Ekspor Word `.docx` & unduh rekaman asli).</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.015] border border-white/[0.04] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 font-bold block">PAKET PRO</span>
                  <span className="text-sm font-black text-white mt-0.5">Rp 49.000 <span className="text-xs font-medium text-zinc-500">/ bulan</span></span>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold">
                  Sangat Hemat
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
              >
                Kembali
              </button>
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  showToast('Pembayaran Midtrans/Stripe akan diintegrasikan pada Phase 5!', 'info');
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/20 transition-all duration-200"
              >
                Upgrade Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE CARD MODAL (Sprint 17 — Phase 4.5C) */}
      {showShareCardModal && selectedSummary && (() => {
        // Ekstrak poin-poin utama dari summary markdown
        const extractKeyPoints = (md: string): string[] => {
          const lines = md.split('\n');
          const bullets: string[] = [];
          for (const line of lines) {
            const match = line.match(/^[-*•]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
            if (match) {
              bullets.push(match[1].replace(/\*\*/g, '').trim());
            }
            if (bullets.length >= 3) break;
          }
          if (bullets.length < 3) {
            // Fallback: ambil kalimat pertama dari paragraf
            const sentences = md.replace(/#+.*/g, '').replace(/\*\*/g, '').split(/\.\s+/);
            for (const s of sentences) {
              if (s.trim().length > 20 && bullets.length < 3) {
                bullets.push(s.trim().slice(0, 100) + (s.length > 100 ? '...' : ''));
              }
            }
          }
          return bullets.slice(0, 3);
        };
        const keyPoints = extractKeyPoints(selectedSummary.summary);
        const shareUrl = typeof window !== 'undefined' && selectedSummary.is_public && selectedSummary.public_slug
          ? `${window.location.origin}/s/${selectedSummary.public_slug}`
          : null;
        const isStory = shareCardFormat === 'story';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
            <div 
              className="absolute inset-0 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" 
              onClick={() => !isGeneratingCard && setShowShareCardModal(false)} 
            />
            <div className="relative w-full max-w-2xl rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ImageDown className="h-4 w-4 text-violet-400" />
                    Kartu Sosmed
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Download PNG untuk Instagram Story / WhatsApp / Twitter</p>
                </div>
                <button onClick={() => setShowShareCardModal(false)} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-all">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Format selector */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setShareCardFormat('story')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                    shareCardFormat === 'story'
                      ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-900/30'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Story (9:16)
                </button>
                <button
                  onClick={() => setShareCardFormat('square')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                    shareCardFormat === 'square'
                      ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-900/30'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <Square className="h-3.5 w-3.5" />
                  Feed (1:1)
                </button>
              </div>

              {/* Card Preview */}
              <div className="flex justify-center mb-5">
                <div 
                  ref={shareCardRef}
                  className="relative overflow-hidden rounded-2xl flex-shrink-0"
                  style={{
                    width: isStory ? '270px' : '300px',
                    height: isStory ? '480px' : '300px',
                    background: 'linear-gradient(135deg, #0C0A12 0%, #120F20 50%, #0C0A12 100%)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  {/* Background decoration */}
                  <div style={{
                    position: 'absolute', top: '-60px', right: '-60px',
                    width: '200px', height: '200px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: '-40px', left: '-40px',
                    width: '160px', height: '160px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                  }} />

                  {/* Content */}
                  <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
                    
                    {/* Notara Brand */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px',
                      }}>🧠</div>
                      <span style={{ color: '#A78BFA', fontSize: '13px', fontWeight: '700', letterSpacing: '0.05em' }}>NOTARA</span>
                    </div>

                    {/* Category badge */}
                    {selectedSummary.folder_id && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: '6px', padding: '3px 8px', marginBottom: '12px', alignSelf: 'flex-start',
                      }}>
                        <span style={{ color: '#A78BFA', fontSize: '10px', fontWeight: '600' }}>
                          {folders.find(f => f.id === selectedSummary.folder_id)?.icon || '📁'} {folders.find(f => f.id === selectedSummary.folder_id)?.name || 'Kuliah'}
                        </span>
                      </div>
                    )}

                    {/* Title */}
                    <h2 style={{
                      color: '#FFFFFF',
                      fontSize: isStory ? '15px' : '14px',
                      fontWeight: '800',
                      lineHeight: '1.3',
                      marginBottom: '16px',
                      flex: isStory ? '0 0 auto' : undefined,
                    }}>
                      {selectedSummary.title.slice(0, 80)}{selectedSummary.title.length > 80 ? '...' : ''}
                    </h2>

                    {/* Key Points */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {keyPoints.map((point, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                            background: `linear-gradient(135deg, ${['#8B5CF6','#6366F1','#EC4899'][i]}, ${['#6366F1','#8B5CF6','#A78BFA'][i]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '9px', color: 'white', fontWeight: '800',
                          }}>
                            {i + 1}
                          </div>
                          <p style={{
                            color: '#D1D5DB',
                            fontSize: '11px',
                            lineHeight: '1.4',
                            margin: 0,
                          }}>
                            {point.slice(0, 90)}{point.length > 90 ? '...' : ''}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '16px 0' }} />

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ color: '#6B7280', fontSize: '9px', margin: 0 }}>Dibuat dengan</p>
                        <p style={{ color: '#A78BFA', fontSize: '10px', fontWeight: '700', margin: 0 }}>notara.app</p>
                      </div>
                      {shareUrl ? (
                        <div style={{
                          background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                          borderRadius: '6px', padding: '4px 8px', fontSize: '9px', color: '#A78BFA', fontWeight: '600',
                        }}>
                          🔗 Baca Lengkap
                        </div>
                      ) : (
                        <div style={{ fontSize: '9px', color: '#4B5563', fontStyle: 'italic' }}>
                          Aktifkan link publik untuk QR
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info if not public */}
              {!shareUrl && (
                <div className="mb-4 p-3 bg-amber-900/10 border border-amber-700/20 rounded-xl">
                  <p className="text-[11px] text-amber-300 font-medium">
                    💡 <strong>Tips:</strong> Aktifkan &quot;Link Publik&quot; dari tombol Share di toolbar agar QR code terintegrasi di kartu.
                  </p>
                </div>
              )}

              {/* Download Button */}
              <button
                onClick={handleGenerateShareCard}
                disabled={isGeneratingCard}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-zinc-700 disabled:to-zinc-700 text-white text-sm font-semibold transition-all active:scale-[0.98] duration-200 flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30"
              >
                {isGeneratingCard ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Membuat kartu...</>
                ) : (
                  <><Download className="h-4 w-4" /> Unduh PNG — Siap Dibagikan!</>
                )}
              </button>

            </div>
          </div>
        );
      })()}

      {/* STUDY GROUP MODAL (Sprint 16) */}

      {showStudyGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => !studyGroupLoading && setShowStudyGroupModal(false)} 
          />
          <div className="relative w-full max-w-md rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-bold text-white">Kelompok Belajar</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Belajar bersama teman-teman</p>
              </div>
              <button
                onClick={() => setShowStudyGroupModal(false)}
                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-black/40 rounded-xl mb-5 border border-white/[0.04]">
              <button
                onClick={() => setStudyGroupTab('create')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  studyGroupTab === 'create'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                ✨ Buat Kelompok
              </button>
              <button
                onClick={() => setStudyGroupTab('join')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  studyGroupTab === 'join'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                🔗 Bergabung
              </button>
            </div>

            {studyGroupTab === 'create' ? (
              /* Create Group Form */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nama Kelompok *</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="cth: Kelompok Fisika A, Tim Basis Data..."
                    maxLength={50}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Deskripsi (opsional)</label>
                  <textarea
                    value={newGroupDesc}
                    onChange={e => setNewGroupDesc(e.target.value)}
                    placeholder="Tujuan kelompok, jadwal belajar, dll..."
                    rows={3}
                    maxLength={200}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                  />
                </div>
                <div className="p-3 bg-violet-900/10 border border-violet-700/20 rounded-xl">
                  <p className="text-[11px] text-violet-300 font-medium">💡 Setelah membuat kelompok, kamu akan mendapat <strong>kode undangan</strong> untuk dibagikan ke teman-teman.</p>
                </div>
                <button
                  onClick={handleCreateGroup}
                  disabled={studyGroupLoading || !newGroupName.trim()}
                  className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-zinc-600 text-white text-sm font-semibold transition-all active:scale-[0.98] duration-200 flex items-center justify-center gap-2"
                >
                  {studyGroupLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Membuat...</>
                  ) : (
                    <><Users className="h-4 w-4" /> Buat Kelompok</>
                  )}
                </button>
              </div>
            ) : (
              /* Join Group Form */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Kode Undangan</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toLowerCase())}
                    placeholder="Masukkan kode 8 karakter..."
                    maxLength={8}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors font-mono tracking-widest text-center uppercase"
                  />
                </div>
                <div className="p-3 bg-emerald-900/10 border border-emerald-700/20 rounded-xl">
                  <p className="text-[11px] text-emerald-300 font-medium">🔗 Minta kode undangan dari owner kelompok untuk bergabung. Kode terdiri dari 8 karakter.</p>
                </div>
                <button
                  onClick={handleJoinGroup}
                  disabled={studyGroupLoading || joinCode.trim().length < 4}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/5 disabled:text-zinc-600 text-white text-sm font-semibold transition-all active:scale-[0.98] duration-200 flex items-center justify-center gap-2"
                >
                  {studyGroupLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Bergabung...</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Bergabung Sekarang</>
                  )}
                </button>
              </div>
            )}

            {/* Existing Groups List */}
            {studyGroups.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/[0.05]">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Kelompok Saya ({studyGroups.length})</p>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  {studyGroups.map(g => (
                    <div key={g.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="h-3 w-3 text-violet-500 flex-shrink-0" />
                        <span className="text-xs text-zinc-300 truncate">{g.name}</span>
                        {g.user_role === 'owner' && <Crown className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" />}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(g.invite_code);
                          showToast(`Kode disalin: ${g.invite_code}`, 'success');
                        }}
                        className="text-[10px] font-mono text-violet-500 hover:text-violet-300 transition-colors flex-shrink-0 ml-2"
                        title="Salin kode undangan"
                      >
                        {g.invite_code}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
            onClick={() => {
              if (!mfaLoading && !isUpdatingProfile) setShowSettingsModal(false);
            }} 
          />
          
          <div className={`relative w-full ${settingsTab === 'billing' && profileTier === 'free' ? 'max-w-3xl' : 'max-w-md'} rounded-3xl bg-zinc-950/80 border border-white/[0.08] backdrop-blur-2xl p-6 shadow-2xl shadow-violet-950/10 flex flex-col space-y-5 animate-in zoom-in-95 duration-200 z-50 overflow-hidden transition-all duration-300`}>
            {/* Top gradient highlight border */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500" />
            {/* Background glowing orb */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Title */}
            <div className="relative flex items-center gap-3 text-left">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-wide">
                  Pengaturan Notara
                </h3>
                <span className="text-[9px] text-zinc-500 font-bold block mt-0.5 tracking-wider">PROFIL & KEAMANAN AKUN</span>
              </div>
            </div>

            {/* Tab Selectors */}
            <div className="flex bg-white/[0.02] border border-white/[0.04] p-1 rounded-xl text-xs font-bold shrink-0">
              <button
                onClick={() => setSettingsTab('profile')}
                className={`flex-1 py-2 rounded-lg transition-all duration-200 ${
                  settingsTab === 'profile'
                    ? 'bg-violet-600 text-white shadow shadow-violet-500/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                👤 Profil
              </button>
              <button
                onClick={() => setSettingsTab('security')}
                className={`flex-1 py-2 rounded-lg transition-all duration-200 ${
                  settingsTab === 'security'
                    ? 'bg-violet-600 text-white shadow shadow-violet-500/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔒 Keamanan
              </button>
              <button
                onClick={() => setSettingsTab('app')}
                className={`flex-1 py-2 rounded-lg transition-all duration-200 ${
                  settingsTab === 'app'
                    ? 'bg-violet-600 text-white shadow shadow-violet-500/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ✦ Aplikasi
              </button>
              <button
                onClick={() => setSettingsTab('billing')}
                className={`flex-1 py-2 rounded-lg transition-all duration-200 ${
                  settingsTab === 'billing'
                    ? 'bg-violet-600 text-white shadow shadow-violet-500/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                💳 Langganan
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
              {settingsTab === 'profile' ? (
                /* TAB 1: PROFILE FORM */
                <div className="space-y-4 text-left">
                  {user && (
                    <div className="flex items-center gap-4 bg-white/[0.01] border border-white/[0.03] p-3 rounded-2xl">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-base font-bold text-white border border-white/10 shrink-0">
                        {user.user_metadata?.avatar_url ? (
                          <img
                            src={user.user_metadata.avatar_url}
                            alt="Avatar"
                            className="h-full w-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span>
                            {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Email Terdaftar</p>
                        <p className="text-sm font-semibold text-white truncate mt-0.5">{user.email}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Nama Lengkap</label>
                    <input
                      type="text"
                      placeholder="Henry Nugraha"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      disabled={isUpdatingProfile}
                      className="w-full px-4 py-3 bg-zinc-950/60 border border-white/10 focus:border-violet-500/60 focus:ring-4 focus:ring-violet-500/10 rounded-2xl text-xs transition-all duration-200 outline-none text-zinc-200"
                    />
                  </div>

                  <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2 mr-auto rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 font-bold text-xs transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Keluar</span>
                    </button>

                    <button
                      onClick={() => setShowSettingsModal(false)}
                      disabled={isUpdatingProfile}
                      className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 disabled:opacity-50"
                    >
                      Tutup
                    </button>
                    <button
                      onClick={handleUpdateProfile}
                      disabled={isUpdatingProfile || !editingName.trim()}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                    >
                      {isUpdatingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Simpan Profil'}
                    </button>
                  </div>
                </div>
              ) : settingsTab === 'security' ? (
                /* TAB 2: TOTP Keamanan 2FA */
                <div className="space-y-4">
                  {mfaError && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2.5 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>{mfaError}</span>
                    </div>
                  )}

                  {mfaSuccess && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2.5 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{mfaSuccess}</span>
                    </div>
                  )}

                  {mfaEnabled ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-start gap-3.5 text-left">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
                        <div className="text-xs text-zinc-300 leading-relaxed">
                          <p className="font-extrabold text-emerald-400 tracking-wide text-xs">Autentikasi 2FA Aktif</p>
                          <p className="mt-1.5 text-[11px] text-zinc-400 font-medium leading-relaxed">Akun Anda saat ini dilindungi oleh aplikasi authenticator. Setiap login baru atau akses dashboard di perangkat lain wajib memverifikasi kode 6-digit.</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
                        >
                          Tutup
                        </button>
                        <button
                          onClick={handleMfaDisable}
                          disabled={mfaLoading}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs tracking-wide shadow-md shadow-rose-950/20 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                        >
                          {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Nonaktifkan 2FA'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {!mfaQrCode ? (
                        <div className="space-y-4 text-left">
                          <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                            Autentikasi Dua Faktor (2FA) memberikan tingkat keamanan tambahan dengan meminta kode verifikasi dari aplikasi authenticator (Google Authenticator, Authy, Microsoft Authenticator) saat masuk ke Notara.
                          </p>
                          <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
                            <button
                              onClick={() => setShowSettingsModal(false)}
                              className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
                            >
                              Tutup
                            </button>
                            <button
                              onClick={handleMfaEnroll}
                              disabled={mfaLoading}
                              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                            >
                              {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Mulai Konfigurasi'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 text-left">
                          <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                            Pindai kode QR di bawah ini dengan aplikasi authenticator Anda, lalu masukkan 6-digit kode verifikasi yang muncul untuk mengaktifkan.
                          </p>

                          <div className="relative p-4 bg-white/[0.02] border border-white/10 rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-inner">
                            <div className="absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t-2 border-l-2 border-violet-500/60 rounded-tl-md" />
                            <div className="absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t-2 border-r-2 border-violet-500/60 rounded-tr-md" />
                            <div className="absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b-2 border-l-2 border-violet-500/60 rounded-bl-md" />
                            <div className="absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b-2 border-r-2 border-violet-500/60 rounded-br-md" />

                            <div className="bg-white p-2.5 rounded-2xl shadow-xl shadow-black/40 w-44 h-44 flex items-center justify-center transition-all duration-300 hover:scale-[1.03]">
                              <img 
                                src={mfaQrCode} 
                                alt="MFA QR Code" 
                                className="w-full h-full object-contain select-none"
                                draggable={false}
                              />
                            </div>
                            
                            <div className="w-full text-center">
                              <span className="text-[9px] text-zinc-500 font-bold block uppercase tracking-wider">Kode Manual</span>
                              <code className="text-xs font-mono bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 text-violet-300 block select-all mt-1 tracking-wide">
                                {mfaSecret}
                              </code>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Kode Verifikasi 6-Digit</label>
                            <div className="relative">
                              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                              <input
                                type="text"
                                maxLength={6}
                                placeholder="000 000"
                                value={mfaVerificationCode}
                                onChange={(e) => setMfaVerificationCode(e.target.value.replace(/\D/g, ''))}
                                className="w-full pl-11 pr-4 py-3.5 bg-zinc-950/60 border border-white/10 focus:border-violet-500/60 focus:ring-4 focus:ring-violet-500/10 rounded-2xl text-base transition-all duration-200 outline-none text-zinc-100 font-mono tracking-[0.4em] text-center font-bold"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2.5 justify-end pt-3 border-t border-white/5">
                            <button
                              onClick={() => {
                                setMfaQrCode('');
                                setMfaSecret('');
                                setMfaFactorId('');
                                setMfaVerificationCode('');
                                setMfaError(null);
                              }}
                              disabled={mfaLoading}
                              className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 disabled:opacity-50"
                            >
                              Kembali
                            </button>
                            <button
                              onClick={handleMfaVerify}
                              disabled={mfaLoading || mfaVerificationCode.length !== 6}
                              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                            >
                              {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Aktifkan 2FA'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : settingsTab === 'app' ? (
                /* TAB 3: APP INFO */
                <div className="space-y-4 text-left">
                  {/* Version Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/5 to-indigo-500/5 border border-violet-500/15">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <NotaraLogo variant="icon" size={20} showGlow />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-white">Notara</p>
                        <p className="text-[11px] text-zinc-500 font-mono">Versi v0.0.06 · Early Testing</p>
                      </div>
                      <span className="ml-auto text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
                        ✓ Terkini
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[11px] text-zinc-500 font-medium">
                      <div className="flex items-center justify-between">
                        <span>Platform</span>
                        <span className="text-zinc-400">Web App (Next.js 16)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Database</span>
                        <span className="text-zinc-400">Supabase</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>AI Engine</span>
                        <span className="text-zinc-400">Groq (GPT-OSS 120B)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Update Mode</span>
                        <span className="text-zinc-400">Auto (Focus Check)</span>
                      </div>
                    </div>
                  </div>

                  {/* Re-trigger onboarding */}
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-xs font-bold text-zinc-300 mb-1">Survei Onboarding</p>
                    <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">Perbarui informasi institusi/perusahaan dan peranmu di Notara.</p>
                    <button
                      onClick={() => {
                        setShowSettingsModal(false);
                        setTimeout(() => setShowOnboardingModal(true), 300);
                      }}
                      className="w-full py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 text-xs font-bold transition-all cursor-pointer"
                    >
                      ✦ Isi Ulang Survei
                    </button>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setShowSettingsModal(false)}
                      className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              ) : (
                /* TAB 4: LANGGANAN */
                <div className="space-y-4 text-left">
                  {billingLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                      <span className="text-[10px] text-zinc-500 font-bold tracking-wider">Memuat Status Langganan...</span>
                    </div>
                  ) : billingError ? (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-2.5">
                      <div className="flex items-center gap-2 text-rose-400 font-extrabold text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Terjadi Kesalahan</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{billingError}</p>
                      <button onClick={loadBillingData} className="px-3.5 py-1.5 bg-rose-500/20 text-rose-300 font-bold rounded-xl text-[10px] hover:bg-rose-500/30 transition-all duration-200 cursor-pointer">
                        Coba Lagi
                      </button>
                    </div>
                  ) : profileTier === 'pro' ? (
                    /* SUCCESS STATE: PRO ACTIVE */
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-gradient-to-tr from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            <Crown className="h-5 w-5 animate-pulse" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-emerald-400 tracking-wide">Notara Pro Aktif</h4>
                            <span className="text-[9px] text-zinc-400 font-bold block mt-0.5">TERIMA KASIH TELAH MENDUKUNG KAMI</span>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Metode Pembayaran</span>
                            <span className="font-semibold text-zinc-200 uppercase">{subscriptionData?.payment_type || 'Instant Verification'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Periode Aktif</span>
                            <span className="font-semibold text-zinc-200">
                              {subscriptionData?.current_period_end 
                                ? new Date(subscriptionData.current_period_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                                : 'Selamanya'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Anda sekarang memiliki akses tanpa batas untuk durasi rekam suara (hingga 120 menit), kuota rangkuman tak terbatas, ekspor Microsoft Word (.docx), dan chatbot lintas folder (Global Chat).
                        </p>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                    </div>
                  ) : profileTier === 'max' ? (
                    /* SUCCESS STATE: MAX ACTIVE */
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                            <Crown className="h-5 w-5 animate-[spin_4s_linear_infinite]" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-amber-400 tracking-wide">Notara Max Aktif 👑</h4>
                            <span className="text-[9px] text-zinc-400 font-bold block mt-0.5">PAKET TERTINGGI DENGAN AKSES MAKSIMAL</span>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Metode Pembayaran</span>
                            <span className="font-semibold text-zinc-200 uppercase">{subscriptionData?.payment_type || 'Instant Verification'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Periode Aktif</span>
                            <span className="font-semibold text-zinc-200">
                              {subscriptionData?.current_period_end 
                                ? new Date(subscriptionData.current_period_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                                : 'Selamanya'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Anda sekarang memiliki akses super premium untuk durasi rekam suara (hingga 240 menit), antrean AI prioritas, terjemahan audio otomatis, dan kustomisasi prompt template AI.
                        </p>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                    </div>
                  ) : (profileTier === 'free' && subscriptionData?.status === 'pending' && subscriptionData?.snap_token && !ignorePendingSub) ? (
                    /* PENDING PAYMENT STATE */
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div className="p-5 rounded-2xl bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-amber-400 tracking-wide flex items-center gap-1.5">
                              Pembayaran Tertunda ⏳
                            </h4>
                            <span className="text-[9px] text-zinc-400 font-bold block mt-0.5 uppercase">
                              SELESAIKAN PEMBAYARAN UNTUK MENGAKTIFKAN TIER ANDA
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-white/5 space-y-3 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Paket Dipilih</span>
                            <span className="font-bold text-zinc-200">
                              Notara {subscriptionData.amount === 99000 ? 'Max 👑' : 'Pro 🚀'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Nominal Tagihan</span>
                            <span className="font-extrabold text-amber-400">
                              Rp {subscriptionData.amount.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-400">ID Invoice</span>
                            <span className="font-mono text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/[0.04] select-all">
                              {subscriptionData.order_id}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Anda memilih pembayaran via Midtrans. Jika Anda menggunakan Bank Transfer atau e-Wallet dan menutup popup, pembayaran Anda tetap valid selama 24 jam. Klik tombol di bawah untuk melanjutkan pembayaran Anda.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3.5 pt-2">
                        <button
                          onClick={() => {
                            setIgnorePendingSub(true);
                          }}
                          className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 cursor-pointer text-center"
                        >
                          Pilih Paket Lain
                        </button>
                        
                        <button
                          onClick={loadBillingData}
                          disabled={billingLoading}
                          className="px-4 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-violet-400 hover:text-violet-300 font-bold text-xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {billingLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span>Perbarui Status</span>
                        </button>

                        <button
                          onClick={() => {
                            const tier = subscriptionData.amount === 99000 ? 'max' : 'pro';
                            if (typeof window !== 'undefined' && (window as any).snap) {
                              (window as any).snap.pay(subscriptionData.snap_token, {
                                onSuccess: async (result: any) => {
                                  showToast(`Pembayaran berhasil! Akun ${tier === 'max' ? 'Max' : 'Pro'} Anda aktif. 🎉`, 'success');
                                  await loadBillingData();
                                },
                                onPending: async (result: any) => {
                                  showToast('Pembayaran pending. Selesaikan tagihan Anda.', 'info');
                                  await loadBillingData();
                                },
                                onError: async (result: any) => {
                                  setBillingError('Pembayaran gagal atau dibatalkan.');
                                  await loadBillingData();
                                },
                                onClose: () => {
                                  setIsProcessingPayment(false);
                                }
                              });
                            } else {
                              showToast('Snap SDK belum termuat. Silakan muat ulang.', 'delete');
                            }
                          }}
                          className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-xl text-xs font-extrabold text-center transition-all duration-200 shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Lanjutkan Pembayaran →</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* EMPTY STATE: 3-TIER COMPARISON */
                    <div className="space-y-5">
                      <div className="text-center md:text-left space-y-1">
                        <h4 className="text-sm font-extrabold text-white tracking-wide">Pilih Paket Langganan Notara</h4>
                        <p className="text-xs text-zinc-400">Pilih tier terbaik yang sesuai dengan kebutuhan belajar atau bisnis Anda.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                        {/* CARD 1: FREE */}
                        <div className="bg-zinc-900/40 border border-white/[0.04] p-5 rounded-2xl flex flex-col justify-between h-full space-y-4">
                          <div className="space-y-3">
                            <div>
                              <h5 className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">Free</h5>
                              <div className="mt-1 flex items-baseline text-white">
                                <span className="text-xl font-black">Rp 0</span>
                                <span className="ml-1 text-[10px] font-medium text-zinc-500">/ selamanya</span>
                              </div>
                            </div>
                            <ul className="space-y-2 text-[11px] text-zinc-300">
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
                                <span>Rekam 30 menit / sesi</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
                                <span>Maksimal 3 folder</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
                                <span>Standard transcription</span>
                              </li>
                            </ul>
                          </div>
                          <button
                            disabled
                            className="w-full py-2 bg-zinc-800/40 border border-zinc-700/20 text-zinc-500 rounded-xl text-xs font-bold text-center cursor-default"
                          >
                            Paket Aktif
                          </button>
                        </div>

                        {/* CARD 2: PRO */}
                        <div className="bg-violet-950/20 border border-violet-500/25 p-5 rounded-2xl flex flex-col justify-between h-full space-y-4 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-xl pointer-events-none" />
                          <div className="space-y-3">
                            <div>
                              <h5 className="text-xs font-extrabold text-violet-400 uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Pro
                              </h5>
                              <div className="mt-1 flex items-baseline text-white">
                                <span className="text-xl font-black">Rp 49.000</span>
                                <span className="ml-1 text-[10px] font-medium text-zinc-500">/ bulan</span>
                              </div>
                            </div>
                            <ul className="space-y-2 text-[11px] text-zinc-300">
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                                <span>Rekam 120 menit / sesi</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                                <span>Kuota & folder tanpa batas</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                                <span>Global Chat lintas folder</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                                <span>Ekspor Word & Unduh audio</span>
                              </li>
                            </ul>
                          </div>
                          <button
                            onClick={() => handleUpgrade('pro')}
                            disabled={isProcessingPayment}
                            className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold text-center transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-violet-500/10 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {isProcessingPayment ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Memproses...</span>
                              </>
                            ) : (
                              <span>Pilih Pro</span>
                            )}
                          </button>
                        </div>

                        {/* CARD 3: MAX */}
                        <div className="bg-amber-950/20 border border-amber-500/30 p-5 rounded-2xl flex flex-col justify-between h-full space-y-4 relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
                          <div className="absolute top-3 right-3 text-[7px] bg-amber-500/20 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                            Terbaik
                          </div>
                          <div className="space-y-3">
                            <div>
                              <h5 className="text-xs font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                <Crown className="h-3 w-3" /> Max
                              </h5>
                              <div className="mt-1 flex items-baseline text-white">
                                <span className="text-xl font-black">Rp 99.000</span>
                                <span className="ml-1 text-[10px] font-medium text-zinc-500">/ bulan</span>
                              </div>
                            </div>
                            <ul className="space-y-2 text-[11px] text-zinc-300">
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <span>Rekam 240 menit / sesi</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <span>Antrean AI prioritas (Instant)</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <span>Terjemahan audio otomatis</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <span>Kustomisasi template AI</span>
                              </li>
                            </ul>
                          </div>
                          <button
                            onClick={() => handleUpgrade('max')}
                            disabled={isProcessingPayment}
                            className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-xl text-xs font-extrabold text-center transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {isProcessingPayment ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Memproses...</span>
                              </>
                            ) : (
                              <span>Pilih Max</span>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-between items-center text-[10px] text-zinc-500">
                        <span>Sistem pembayaran aman menggunakan enkripsi Midtrans SSL</span>
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          disabled={isProcessingPayment}
                          className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white font-bold text-xs transition-all duration-200 cursor-pointer disabled:opacity-50"
                        >
                          Kembali
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2FA LOGIN CHALLENGE BLOCKER (Sprint 13) */}
      {showMfaChallengeBlock && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-[#030206]/98 backdrop-blur-2xl animate-in fade-in duration-300 font-sans">
          {/* Dynamic Background Glows */}
          <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse duration-4000" />
          <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-fuchsia-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse duration-5000" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          
          <div className="relative w-full max-w-md rounded-3xl bg-zinc-950/60 border border-white/[0.08] p-6 md:p-8 shadow-2xl shadow-violet-950/20 text-center animate-in zoom-in-95 duration-300 backdrop-blur-2xl space-y-6 overflow-hidden">
            {/* Top gradient highlight border */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500" />

            <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-violet-900/30 relative group">
              <div className="absolute inset-0 rounded-2xl bg-violet-500/20 animate-ping duration-1500 opacity-75" />
              <Shield className="h-6 w-6 relative z-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-extrabold tracking-tight text-white">
                Autentikasi Dua Faktor (2FA)
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed font-medium">
                Akun Anda dilindungi keamanan tingkat tinggi. Silakan masukkan kode 6-digit dari aplikasi authenticator Anda untuk melanjutkan ke Notara.
              </p>
            </div>

            {mfaError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2.5 text-left animate-in fade-in duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{mfaError}</span>
              </div>
            )}

            <div className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Kode Autentikasi</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000 000"
                    value={mfaVerificationCode}
                    onChange={(e) => setMfaVerificationCode(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && mfaVerificationCode.length === 6) {
                        handleMfaChallengeVerify();
                      }
                    }}
                    className="w-full pl-11 pr-4 py-3.5 bg-zinc-950/60 border border-white/10 focus:border-violet-500/60 focus:ring-4 focus:ring-violet-500/10 rounded-2xl text-base transition-all duration-200 outline-none text-zinc-100 font-mono tracking-[0.4em] text-center font-bold"
                  />
                </div>
              </div>

              <button
                onClick={handleMfaChallengeVerify}
                disabled={mfaLoading || mfaVerificationCode.length !== 6}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 active:opacity-90 rounded-xl font-semibold text-sm text-white shadow-lg shadow-violet-900/20 hover:shadow-violet-900/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {mfaLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <span>Verifikasi Keamanan</span>
                )}
              </button>

              <div className="text-center pt-2 border-t border-white/5">
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                    setFolders([]);
                    setSummaries([]);
                    setSelectedSummary(null);
                    setShowMfaChallengeBlock(false);
                    setMfaVerificationCode('');
                    router.replace('/login');
                  }}
                  className="w-full text-center text-xs text-rose-400 hover:text-rose-300 font-semibold tracking-wide transition-colors duration-200 cursor-pointer outline-none bg-transparent border-none mt-2"
                >
                  Keluar dari Notara / Ganti Akun
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Particle Explosion Canvas */}
      <canvas
        ref={particleCanvasRef}
        className="fixed inset-0 pointer-events-none z-[9999]"
      />

      {/* ─── VERSION UPDATE BANNER ─── */}
      {/* Detects new Vercel deployments on window focus — shows update prompt */}
      <VersionUpdateBanner appVersion="v0.0.06" />

    </div>
  );
}
