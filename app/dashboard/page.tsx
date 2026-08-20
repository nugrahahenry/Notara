'use client';

import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import packageJson from '../../package.json';
import {
  BILLING_PLANS,
  formatMidtransGrossAmount,
  getBillingPlanByAmount,
} from '@/lib/billing/plans';
import { 
  Sparkles,
  Check, Loader2, AlertCircle, Trash2, BookOpen,
  Plus, FolderPlus, Folder, Edit3, X,
  Calendar, Menu, MessageSquare, Send, Search, LogOut,
  Shield, Key, Share2, Copy,
  Mic, Users, UserPlus, Link2, Crown, Hash,
  ImageDown, Smartphone, Square, Download, Clock, Settings, RefreshCw,
  House, GraduationCap
} from 'lucide-react';
import { NaliraBrand } from '../components/brand/NaliraBrand';
import { OnboardingModal } from '../components/ui/OnboardingModal';
import { VersionUpdateBanner } from '../components/ui/VersionUpdateBanner';
import { CaptureSourceTabs } from '../components/capture/CaptureSourceTabs';
import { CaptureTaskList } from '../components/capture/CaptureTaskList';
import { ProcessingView } from '../components/capture/ProcessingView';
import { RecordingPanel } from '../components/capture/RecordingPanel';
import {
  UploadQueuePanel,
  type CaptureDragState,
} from '../components/capture/UploadQueuePanel';
import {
  AppShellRoot,
  AppShellSidebar,
  AppShellTopbar,
  AppShellWorkspace,
  SidebarToggle,
} from '../components/shell/AppShell';
import { ThemeSwitcher } from '../components/theme/ThemeSwitcher';
import { HomeWorkspace } from '../components/workspace/HomeWorkspace';
import { CoursesWorkspace } from '../components/workspace/CoursesWorkspace';
import { SharedWorkspace } from '../components/workspace/SharedWorkspace';
import { NotaraWorkspace } from '../components/workspace/NotaraWorkspace';
import { WorkspaceAmbientHeader } from '../components/workspace/WorkspaceAmbientHeader';
import { StudyGuideWorkspace } from '../components/study-guide/StudyGuideWorkspace';
import { TranscriptEvidenceReview } from '../components/transcript/TranscriptEvidenceReview';
import type { WorkspaceView } from '../components/workspace/types';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getAllSummaries,
  createSummary,
  persistTranscriptEvidence,
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
  leaveStudyGroup,
  getChatThreads,
  createChatThread,
  deleteChatThread,
  getUserProfile,
  saveOnboardingData,
  getUserSubscription,
  type Subscription
} from '@/lib/db';
import type { Folder as FolderType, Summary as SummaryType, ChatMessage, ChatThread, StudyGroup, GroupMember } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { bufferToWav, getAudioDuration, sliceAudioBuffer } from '@/lib/capture/audio';
import {
  CHUNK_DURATION_SECONDS,
  CHUNK_THRESHOLD_BYTES,
  MAX_QUEUE_FILES,
} from '@/lib/capture/constants';
import {
  exceedsMaxFileSize,
  getCaptureLimits,
  isSupportedMediaFile,
  mergeCaptureQueue,
} from '@/lib/capture/policy';
import {
  getRecordingBoundaryAction,
  stopActiveRecorder,
} from '@/lib/capture/recording';
import {
  CapturePipelineError,
  requestCaptureJson,
  requestCaptureJsonWithRateLimitRetry,
  toCapturePipelineError,
} from '@/lib/capture/pipeline';
import {
  createSelectedCaptureTask,
  getNextQueuedCaptureTask,
  isCaptureQueueBusy,
  patchCaptureTask,
  removeCaptureTask,
  shouldWarnBeforeLeaving,
  startCaptureTaskAttempt,
  type CaptureTask,
  type CaptureTaskError,
  type CaptureTaskProgress,
  type CaptureTaskStatus,
} from '@/lib/capture/task';
import { shouldLoadChatThreadHistory } from '@/lib/chat/thread-state';
import type { BrowserWindow, SpeechRecognitionLike } from '@/lib/browser';
import { getErrorMessage } from '@/lib/api/boundary';
import { getPostAuthExperience } from '@/lib/auth/post-auth-experience';
import type {
  TranscriptQualityReport,
  TranscriptSegment,
} from '@/lib/transcript/contract';
import {
  offsetTranscriptSegments,
  type TranscriptEvidenceInput,
  type TranscriptProcessingMetadata,
} from '@/lib/transcript/persistence';

// Dipakai hanya oleh `next dev` saat Supabase tidak tersedia. Guard NODE_ENV
// membuat flag ini mati otomatis pada build/deploy production, sekalipun ada
// environment variable yang keliru di Vercel.
const DEV_BYPASS_AUTH =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_NOTARA_DEV_BYPASS_AUTH === 'true';

const DEV_BYPASS_USER = {
  id: 'local-recording-test',
  email: 'local@notara.test',
  app_metadata: {},
  user_metadata: { full_name: 'Mode Tes Lokal' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
} as User;

const USE_INLINE_MATERIAL_TUTOR = true;

interface CaptureTranscriptionResponse {
  transcript: string;
  segments: TranscriptSegment[];
  quality: TranscriptQualityReport;
  processing: TranscriptProcessingMetadata & {
    transcriptionModel: string;
  };
}

interface CaptureSummaryResponse extends CaptureTranscriptionResponse {
  summary: string;
  processing: TranscriptProcessingMetadata & {
    transcriptionModel: string;
    summaryModel: string;
  };
}

interface AggregateSummaryResponse {
  summary: string;
  quality: TranscriptQualityReport;
  processing: TranscriptProcessingMetadata & {
    summaryModel: string;
  };
}

const createCaptureTaskId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  } catch {
    return 'Baru saja';
  }
};

// ==========================================
// HOME COMPONENT
// ==========================================

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [captureTasks, setCaptureTasks] = useState<CaptureTask<File>[]>([]);
  const files = captureTasks
    .filter((task) => task.source === 'upload')
    .map((task) => task.reference);
  const [captureDragState, setCaptureDragState] = useState<CaptureDragState>('idle');
  const [captureInputNotice, setCaptureInputNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Database States
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [summaries, setSummaries] = useState<SummaryType[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all'); // 'all', 'recent', 'uncategorized', or folder_id
  const [selectedSummary, setSelectedSummary] = useState<SummaryType | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('home');
  
  // Chatbot States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(true);
  
  // Chatbot Thread States
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [showChatHistory, setShowChatHistory] = useState<boolean>(false);
  const locallyInitializedChatThreadIdRef = useRef<string | null>(null);
  
  // Sidebar Expansion States
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false); // Mobile sidebar open
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false); // Desktop locked expansion
  const mobileSidebarTriggerRef = useRef<HTMLButtonElement>(null);
  
  // Chatbot Drawer States
  const [isChatOpenMobile, setIsChatOpenMobile] = useState<boolean>(false); // Mobile chatbot active
  const [chatScope, setChatScope] = useState<'summary' | 'folder' | 'global'>('summary'); // Chat context scope
  const [isChatPanelOpen, setIsChatPanelOpen] = useState<boolean>(false); // Material tutor opens only from Study Dock

  // Folder Form Modal States
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [folderName, setFolderName] = useState<string>('');
  const [folderColor, setFolderColor] = useState<string>('#8B5CF6');
  const [folderIcon, setFolderIcon] = useState<string>('📁');
  const folderNameInputRef = useRef<HTMLInputElement>(null);
  const folderModalReturnFocusRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      if (showFolderModal) {
        folderNameInputRef.current?.focus();
        return;
      }

      const returnFocus = folderModalReturnFocusRef.current;
      folderModalReturnFocusRef.current = null;
      returnFocus?.();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [showFolderModal]);

  // Summary Edit States
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');
  const [copied, setCopied] = useState<boolean>(false);

  // Thinking Panel States
  const [thinkingLog, setThinkingLog] = useState<string[]>([]);
  const [showThinkingPanel, setShowThinkingPanel] = useState<boolean>(false);
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
  const [chunkTotal, setChunkTotal] = useState<number>(0);
  const [chunkCurrent, setChunkCurrent] = useState<number>(0);
  const [chunkCompleted, setChunkCompleted] = useState<number>(0);
  const [chunkProgress, setChunkProgress] = useState<string>('');
  const [isChunkProcessing, setIsChunkProcessing] = useState<boolean>(false);

  // Audio References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingLimitReachedRef = useRef<boolean>(false);
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
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchWasOpenRef = useRef<boolean>(false);

  // Pending summary states for folder assignment (Sprint 7)
  const [pendingSummary, setPendingSummary] = useState<{
    captureTaskId: string;
    title: string;
    file_name: string | null;
    duration_sec: number | null;
    transcript: string;
    summary: string;
    word_count: number;
    evidence: TranscriptEvidenceInput;
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
  const captureDragDepthRef = useRef<number>(0);
  const [, setCurrentQueueIndex] = useState<number>(0);
  const [inlineEditingSummaryId, setInlineEditingSummaryId] = useState<string | null>(null);
  const [inlineEditingTitleText, setInlineEditingTitleText] = useState<string>('');
  const [studySeconds, setStudySeconds] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keamanan Dua Faktor (2FA) States (Sprint 13)
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'security' | 'app' | 'billing'>('profile');
  const [editingName, setEditingName] = useState<string>('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
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
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Study Group States (Sprint 16)
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [showStudyGroupModal, setShowStudyGroupModal] = useState<boolean>(false);
  const [studyGroupTab, setStudyGroupTab] = useState<'create' | 'join'>('create');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [studyGroupLoading, setStudyGroupLoading] = useState<boolean>(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);

  // Share Card States (Sprint 17 — Phase 4.5C)
  const [showShareCardModal, setShowShareCardModal] = useState<boolean>(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState<boolean>(false);
  const [shareCardFormat, setShareCardFormat] = useState<'story' | 'square'>('story');
  const shareCardRef = useRef<HTMLDivElement>(null);

  // Onboarding & Dashboard Tour States
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);

  // Subscription & Billing States (Phase 5)
  const [profileTier, setProfileTier] = useState<'free' | 'pro' | 'max'>('free');
  const captureLimits = getCaptureLimits(profileTier);
  const recordingStoppedAtLimit =
    audioBlob !== null &&
    !isRecording &&
    recordingDuration >= captureLimits.recordingLimitSeconds;
  const [subscriptionData, setSubscriptionData] = useState<Subscription | null>(null);
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [ignorePendingSub, setIgnorePendingSub] = useState<boolean>(false);

  // Persistent Desktop Chat Panel State
  useEffect(() => {
    const saved = localStorage.getItem('isMaterialTutorPanelOpen');
    if (saved !== null) {
      setIsChatPanelOpen(saved === 'true');
    }
  }, []);

  useEffect(() => {
    const savedSidebarState = localStorage.getItem('notara-shell-sidebar-expanded');
    if (savedSidebarState !== null) {
      setSidebarExpanded(savedSidebarState === 'true');
    }
  }, []);

  const updateSidebarExpanded = (expanded: boolean) => {
    setSidebarExpanded(expanded);
    localStorage.setItem('notara-shell-sidebar-expanded', String(expanded));
  };

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
  const playSoundEffect = useCallback((type: 'success' | 'delete' | 'info') => {
    try {
      const browserWindow = window as BrowserWindow;
      const AudioContextClass = browserWindow.AudioContext || browserWindow.webkitAudioContext;
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
  }, []);

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

  const showToast = useCallback((message: string, type: 'success' | 'delete' | 'info' = 'success') => {
    setToast({ isOpen: true, message, type });
    playSoundEffect(type);
    
    const timer = setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, 3000);
    return timer;
  }, [playSoundEffect]);

  const handleLogout = async () => {
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

  // Save onboarding without interrupting the first workspace visit.
  const handleOnboardingComplete = async (onboardingData: { role: string; university: string; major: string; find_source: string }) => {
    if (!user) throw new Error('Sesi pengguna tidak tersedia.');
    const saved = await saveOnboardingData(user.id, onboardingData);
    if (!saved) throw new Error('Profil onboarding belum berhasil disimpan.');
    setShowOnboardingModal(false);
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
    } catch (err: unknown) {
      console.error('Update profile error:', err);
      showToast(getErrorMessage(err, 'Gagal memperbarui profil.'), 'delete');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const loadBillingData = useCallback(async () => {
    if (!user) return;
    if (DEV_BYPASS_AUTH) {
      setProfileTier('free');
      setSubscriptionData(null);
      setBillingError(null);
      setBillingLoading(false);
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    try {
      const profile = await getUserProfile(user.id);
      if (profile) {
        setProfileTier(profile.subscription_tier || 'free');
      }
      const sub = await getUserSubscription(user.id);
      setSubscriptionData(sub);
    } catch (err: unknown) {
      console.error('Error loading billing data:', err);
      setBillingError('Gagal memuat status langganan.');
    } finally {
      setBillingLoading(false);
    }
  }, [user]);

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
        const grossAmount = formatMidtransGrossAmount(tier);
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
          showToast(`Pembayaran berhasil! Nalira ${tier === 'max' ? 'Max' : 'Pro'} Anda telah aktif. 🎉`, 'success');
        } else {
          throw new Error('Gagal memproses verifikasi sukses pembayaran.');
        }
      } else {
        // Mode Asli Sandbox/Production
        const snap = typeof window !== 'undefined' ? (window as BrowserWindow).snap : undefined;
        if (snap) {
          snap.pay(token, {
            onSuccess: async () => {
              showToast(`Pembayaran berhasil! Akun ${tier === 'max' ? 'Max' : 'Pro'} Anda aktif. 🎉`, 'success');
              await loadBillingData();
            },
            onPending: async () => {
              showToast('Pembayaran pending. Selesaikan tagihan Anda.', 'info');
              await loadBillingData();
            },
            onError: async () => {
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
    } catch (err: unknown) {
      console.error(`Upgrade ${tier} error:`, err);
      setBillingError(getErrorMessage(err, 'Gagal memulai transaksi pembayaran.'));
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
  }, [showSettingsModal, settingsTab, loadBillingData]);

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
  const checkMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      
      const activeFactors = factorsData.all.filter(f => f.status === 'verified');
      const hasActiveMfa = activeFactors.length > 0;
      setMfaEnabled(hasActiveMfa);
      
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
        issuer: 'Nalira',
        friendlyName: 'Nalira Authenticator'
      });
      if (error) throw error;
      
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
    } catch (err: unknown) {
      console.error('MFA Enroll Error:', err);
      setMfaError(getErrorMessage(err, 'Gagal memulai pendaftaran 2FA.'));
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
        await checkMfaStatus();
      }
    } catch (err: unknown) {
      console.error('MFA Verify Error:', err);
      setMfaError(getErrorMessage(err, 'Kode salah atau kedaluwarsa. Silakan coba lagi.'));
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
            await checkMfaStatus();
          }
        } catch (err: unknown) {
          console.error('MFA Unenroll Error:', err);
          setMfaError(getErrorMessage(err, 'Gagal menonaktifkan 2FA.'));
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
    } catch (err: unknown) {
      console.error('MFA Challenge Verify Error:', err);
      setMfaError(getErrorMessage(err, 'Kode salah atau kedaluwarsa. Silakan coba lagi.'));
    } finally {
      setMfaLoading(false);
    }
  };

  // Load User & listen to auth state changes
  useEffect(() => {
    let active = true;
    let initialAuthCheckPending = true;
    let hydratedUserId: string | null = null;
    let deferredAuthSync: ReturnType<typeof setTimeout> | null = null;

    if (DEV_BYPASS_AUTH) {
      setUser(DEV_BYPASS_USER);
      setFolders([]);
      setSummaries([]);
      setStudyGroups([]);
      setIsDataLoading(false);
      return () => {
        active = false;
      };
    }

    async function checkUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (active) {
          if (user) {
            setUser(user);
            // Check MFA status
            await checkMfaStatus();
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
              hydratedUserId = user.id;

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
              if (getPostAuthExperience(profile) === 'onboarding' && active) {
                setTimeout(() => {
                  if (active) setShowOnboardingModal(true);
                }, 500);
              }
            }
          } else {
            router.replace('/login');
          }
        }
      } catch (err: unknown) {
        console.error('Error checking user/data:', err);
        setError('Gagal memuat data dari database. Pastikan koneksi internet stabil.');
      } finally {
        initialAuthCheckPending = false;
        if (active) {
          setIsDataLoading(false);
        }
      }
    }

    checkUser();

    async function syncAuthenticatedWorkspace(currentUser: User) {
      await checkMfaStatus();

      if (!active) return;
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
          hydratedUserId = currentUser.id;
        }
      } catch (err) {
        console.error('Error refreshing authenticated workspace:', err);
        if (active) {
          setError('Gagal memperbarui ruang belajar. Coba muat ulang halaman.');
        }
      } finally {
        if (active) {
          setIsDataLoading(false);
        }
      }
    }

    // Keep this callback synchronous. Supabase can deadlock when another auth or
    // database request is awaited while onAuthStateChange still holds its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // checkUser owns initial hydration. Token refreshes can happen in the
        // background and must not blank an already usable workspace.
        const isRestoredUser = hydratedUserId === currentUser.id;
        if (
          initialAuthCheckPending ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          (event === 'SIGNED_IN' && isRestoredUser)
        ) {
          return;
        }

        if (deferredAuthSync) clearTimeout(deferredAuthSync);
        deferredAuthSync = setTimeout(() => {
          deferredAuthSync = null;
          if (active) void syncAuthenticatedWorkspace(currentUser);
        }, 0);
      } else {
        hydratedUserId = null;
        if (deferredAuthSync) {
          clearTimeout(deferredAuthSync);
          deferredAuthSync = null;
        }
        setFolders([]);
        setSummaries([]);
        setStudyGroups([]);
        setSelectedSummary(null);
        setIsDataLoading(false);
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      if (deferredAuthSync) clearTimeout(deferredAuthSync);
      subscription.unsubscribe();
    };
  }, [router, showToast]);

  // Capture jobs are still browser-bound. Protect work that would otherwise
  // disappear when the tab is closed or refreshed mid-process.
  useEffect(() => {
    if (!shouldWarnBeforeLeaving(captureTasks)) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [captureTasks]);

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
    locallyInitializedChatThreadIdRef.current = null;

    if (DEV_BYPASS_AUTH) {
      setChatThreads([]);
      setActiveThreadId(null);
      setShowChatHistory(false);
      setChatMessages([
        {
          id: 'welcome',
          summary_id: summaryId,
          thread_id: '',
          role: 'assistant',
          content: selectedSummary
            ? 'Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
            : 'Halo! Saya **Nalira AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?',
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }
    
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
                ? 'Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
                : 'Halo! Saya **Nalira AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?',
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
            ? 'Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
            : 'Halo! Saya **Nalira AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?',
          created_at: new Date().toISOString()
        }
      ]);
      return;
    }

    if (!shouldLoadChatThreadHistory(
      activeThreadId,
      locallyInitializedChatThreadIdRef.current,
    )) {
      return;
    }
    
    const threadId = activeThreadId;
    let cancelled = false;
    async function loadMessages() {
      try {
        const history = await getChatMessages(threadId);
        if (!cancelled) {
          setChatMessages(history);
        }
      } catch (err) {
        console.error('Failed to load chat messages:', err);
      }
    }
    
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, selectedSummary]);

  // Create a new blank thread for the current scope
  const handleCreateNewThread = () => {
    locallyInitializedChatThreadIdRef.current = null;
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
          ? 'Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
          : 'Halo! Saya **Nalira AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?',
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
            if (locallyInitializedChatThreadIdRef.current === threadId) {
              locallyInitializedChatThreadIdRef.current = null;
            }
            if (activeThreadId === threadId) {
              setActiveThreadId(null);
            }
            showToast('Obrolan berhasil dihapus.', 'delete');
          } else {
            throw new Error('Gagal menghapus obrolan.');
          }
        } catch (err: unknown) {
          setError(getErrorMessage(err, 'Gagal menghapus obrolan.'));
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
          locallyInitializedChatThreadIdRef.current = newThread.id;
          setChatThreads(prev => [newThread, ...prev]);
          setActiveThreadId(newThread.id);
        } else {
          throw new Error('Gagal membuat thread chat baru.');
        }
      } catch (err: unknown) {
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
            } catch {
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

    } catch (chatErr: unknown) {
      console.error(chatErr);
      setChatMessages(prev => prev.map(m => 
        m.id === tempAssistantId 
          ? { ...m, content: '❌ Terjadi kesalahan: ' + (getErrorMessage(chatErr, 'Gagal merespon.')) }
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
                  ? 'Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?'
                  : 'Halo! Saya **Nalira AI**. 🚀\n\nAda yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?',
                created_at: new Date().toISOString()
              }
            ]);
            showToast('Riwayat chat berhasil dihapus.', 'delete');
          } else {
            throw new Error('Gagal menghapus riwayat chat.');
          }
        } catch (err: unknown) {
          setError(getErrorMessage(err, 'Gagal menghapus riwayat chat.'));
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

  useEffect(() => {
    if (!showSearchModal) {
      if (searchWasOpenRef.current) searchTriggerRef.current?.focus();
      searchWasOpenRef.current = false;
      return;
    }

    searchWasOpenRef.current = true;
    const handleSearchFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusableElements = Array.from(
        searchDialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleSearchFocusTrap);
    return () => document.removeEventListener('keydown', handleSearchFocusTrap);
  }, [showSearchModal]);

  // Recording triggers
  const startRecording = async () => {
    // Check monthly limit for Free tier
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthSummariesCount = summaries.filter(s => {
      const date = new Date(s.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    if (
      captureLimits.monthlySummaryLimit !== null &&
      currentMonthSummariesCount >= captureLimits.monthlySummaryLimit
    ) {
      showToast('Batas bulanan akun gratis tercapai (maksimal 5 rangkuman per bulan).', 'delete');
      setShowUpgradeModal(true);
      return;
    }

    audioChunksRef.current = [];
    recordingLimitReachedRef.current = false;
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
        setIsRecording(false);
        setIsPaused(false);

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        if (recordingLimitReachedRef.current) {
          showToast(
            `Batas ${formatDuration(captureLimits.recordingLimitSeconds)} tercapai. Rekaman dihentikan otomatis dan tersimpan sementara di tab ini.`,
            'info',
          );
          setShowUpgradeModal(true);
        }
        
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
      
    } catch (err: unknown) {
      console.error('Error starting recording:', err);
      setError('Gagal mengakses mikrofon. Pastikan Anda memberikan izin akses mikrofon.');
    }
  };

  const setupVisualizer = (stream: MediaStream) => {
    try {
      const browserWindow = window as BrowserWindow;
      const AudioContextClass = browserWindow.AudioContext || browserWindow.webkitAudioContext;
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
    const themeStyles = getComputedStyle(document.documentElement);
    const waveformColor = themeStyles.getPropertyValue('--brand-primary').trim() || '#7058E8';
    
    const draw = () => {
      if (!canvas || !analyser) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = waveformColor;
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
        new Notification('Nalira Perekam Suara', {
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
        
        const limit = captureLimits.recordingLimitSeconds;
        const boundaryAction = getRecordingBoundaryAction(nextSec, limit);

        if (boundaryAction === 'stop' && !recordingLimitReachedRef.current) {
          recordingLimitReachedRef.current = true;
          setTimeout(() => {
            stopRecording();
          }, 0);
        } else if (boundaryAction === 'remind') {
          triggerReminderNotification();
        }

        return nextSec;
      });
    }, 1000);
  };

  const resumeRecording = () => {
    // Check limits before resuming (Sprint 8)
    const limit = captureLimits.recordingLimitSeconds;
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
    if (stopActiveRecorder(mediaRecorderRef.current)) {
      setIsRecording(false);
      setIsPaused(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  // Helper to add a log entry to the thinking panel
  const addThinkingLog = (msg: string) => {
    setThinkingLog(prev => [...prev, msg]);
  };

  // Start/stop the thinking timer
  const startThinkingTimer = () => {
    const startTime = Date.now();
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

  const setCaptureTaskStage = (
    taskId: string,
    status: CaptureTaskStatus,
    options: {
      progress?: CaptureTaskProgress;
      stageLabel?: string;
      stageDescription?: string;
      destinationLabel?: string;
    } = {},
  ) => {
    const patch: Partial<CaptureTask<File>> = {
      status,
      progress: options.progress,
      error: undefined,
      stageLabel: options.stageLabel,
      stageDescription: options.stageDescription,
    };
    if (options.destinationLabel !== undefined) {
      patch.destinationLabel = options.destinationLabel;
    }
    setCaptureTasks((current) => patchCaptureTask(current, taskId, patch));
  };

  const markCaptureTaskFailed = (
    taskId: string,
    error: unknown,
    fallbackMessage: string,
  ) => {
    const pipelineError = toCapturePipelineError(error, fallbackMessage);
    const taskError: CaptureTaskError = {
      code: pipelineError.code,
      message: pipelineError.retryable
        ? `${pipelineError.message} Coba lagi akan memulai ulang file ini dari awal.`
        : pipelineError.message,
      retryable: pipelineError.retryable,
    };

    setCaptureTasks((current) => patchCaptureTask(current, taskId, {
      status: 'failed',
      progress: undefined,
      error: taskError,
      stageLabel: undefined,
      stageDescription: undefined,
    }));
    setError(null);
  };

  async function completeSavedCaptureTask(taskId: string) {
    const next = getNextQueuedCaptureTask(captureTasks, taskId);
    setCaptureTasks((current) => patchCaptureTask(current, taskId, {
      status: 'succeeded',
      progress: undefined,
      error: undefined,
      stageLabel: undefined,
      stageDescription: undefined,
    }));
    setPendingSummary(null);
    setShowSaveFolderModal(false);

    if (next) {
      setSelectedSummary(null);
      setCurrentQueueIndex(next.index);
      await startProcessing(
        next.task.reference,
        next.task.name,
        next.task.source === 'upload' ? next.index : null,
        next.task.id,
      );
      return;
    }

    setCurrentQueueIndex(0);
  }

  // Save pending summary (Sprint 7)
  const handleSavePendingSummary = async (folderId: string | null) => {
    if (!pendingSummary) return;
    const captureTaskId = pendingSummary.captureTaskId;
    const destinationFolder = folderId
      ? folders.find((folder) => folder.id === folderId) ?? null
      : null;

    setCaptureTaskStage(captureTaskId, 'saving', {
      progress: { kind: 'indeterminate' },
      destinationLabel: destinationFolder
        ? `Mata kuliah • ${destinationFolder.name}`
        : 'Belum Dikategorikan',
    });

    // Dalam mode tes lokal, hasil tetap bisa dibuka dan diuji tanpa menulis
    // ke Supabase. Data ini hanya hidup selama tab browser masih terbuka.
    if (DEV_BYPASS_AUTH) {
      const localSummary: SummaryType = {
        id: `local-${Date.now()}`,
        folder_id: folderId,
        title: pendingSummary.title,
        file_name: pendingSummary.file_name,
        duration_sec: pendingSummary.duration_sec,
        transcript: pendingSummary.transcript,
        summary: pendingSummary.summary,
        word_count: pendingSummary.word_count,
        created_at: new Date().toISOString(),
        user_id: DEV_BYPASS_USER.id,
      };

      setSummaries((previous) => [localSummary, ...previous]);
      setSelectedSummary(localSummary);
      showToast('Rangkuman disimpan sementara di tab ini.', 'success');
      await completeSavedCaptureTask(captureTaskId);
      return;
    }

    // Check limit of 3 files per folder for Free tier
    if (captureLimits.folderSummaryLimit !== null && folderId) {
      const folderSummariesCount = summaries.filter(s => s.folder_id === folderId).length;
      if (folderSummariesCount >= captureLimits.folderSummaryLimit) {
        showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        setShowUpgradeModal(true);
        markCaptureTaskFailed(captureTaskId, new CapturePipelineError({
          code: 'folder-limit',
          message: 'Tujuan ini sudah mencapai batas tiga rangkuman paket gratis.',
          retryable: false,
        }), 'Batas penyimpanan tercapai.');
        setPendingSummary(null);
        setShowSaveFolderModal(false);
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
        const evidenceStored = await persistTranscriptEvidence(
          newSummary.id,
          pendingSummary.evidence,
        );

        showToast(
          evidenceStored
            ? `Rangkuman "${newSummary.title}" dan bukti waktunya berhasil disimpan!`
            : `Rangkuman "${newSummary.title}" tersimpan, tetapi bukti waktunya belum tersimpan.`,
          evidenceStored ? 'success' : 'info',
        );
        
        await completeSavedCaptureTask(captureTaskId);
      } else {
        throw new Error('Gagal menyimpan rangkuman ke database.');
      }
    } catch (err: unknown) {
      console.error(err);
      markCaptureTaskFailed(captureTaskId, new CapturePipelineError({
        code: 'save-failed',
        message: err instanceof Error ? err.message : 'Gagal menyimpan rangkuman.',
        retryable: true,
      }), 'Gagal menyimpan rangkuman.');
      setPendingSummary(null);
      setShowSaveFolderModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Process Large Audio / Video Files Slicing
  const processLargeAudio = async (
    largeFile: File,
    fileName: string,
    queueIndex: number | null,
    taskId: string,
  ) => {
    setLoading(true);
    setIsChunkProcessing(true);
    setChunkTotal(0);
    setChunkCurrent(0);
    setChunkCompleted(0);
    setThinkingLog([]);
    setShowThinkingPanel(false);
    startThinkingTimer();

    const isVideo = largeFile.type.startsWith('video/');
    const fileLabel = isVideo ? 'video' : 'audio';
    const queueLabel = queueIndex !== null ? ` (Berkas ${queueIndex + 1} dari ${captureTasks.length})` : '';
    let audioCtx: AudioContext | null = null;

    addThinkingLog(`📂 Membaca berkas ${fileLabel} besar${queueLabel} ke memori browser...`);
    setChunkProgress(`Membaca berkas ${fileLabel} besar${queueLabel}...`);
    setCaptureTaskStage(taskId, 'preparing', {
      progress: { kind: 'indeterminate' },
      stageDescription: `Browser sedang membaca dan mendekode ${fileLabel}.`,
    });

    try {
      const browserWindow = window as BrowserWindow;
      const AudioContextClass = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      if (!AudioContextClass) {
        throw new CapturePipelineError({
          code: 'browser-audio-unsupported',
          message: 'Browser Anda tidak mendukung Web Audio API.',
          retryable: false,
        });
      }
      
      const decodingContext = new AudioContextClass();
      audioCtx = decodingContext;
      const arrayBuffer = await largeFile.arrayBuffer();
      
      addThinkingLog(`🔊 Mengekstrak jalur audio dari berkas ${fileLabel}...`);
      setChunkProgress('Mendekode dan mengekstrak data audio...');

      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await decodingContext.decodeAudioData(arrayBuffer);
      } catch {
        throw new CapturePipelineError({
          code: 'unsupported-codec',
          message: `Gagal mendekode ${fileLabel}. Codec mungkin tidak didukung browser; ganti dengan MP3 atau WAV.`,
          retryable: false,
        });
      }
      const totalDuration = audioBuffer.duration;
      const fileDurationSec = Math.round(totalDuration);
      
      const chunkDuration = CHUNK_DURATION_SECONDS; // 2 menit/chunk @16kHz mono ≈ 3.8MB — aman di bawah limit body Vercel (4.5MB)
      const totalChunks = Math.ceil(totalDuration / chunkDuration);
      setChunkTotal(totalChunks);
      addThinkingLog(`✂️ Audio akan dipotong menjadi ${totalChunks} bagian @ 2 menit...`);
      
      let concatenatedTranscript = '';
      const concatenatedSegments: TranscriptSegment[] = [];
      let transcriptionModel: string | null = null;
      
      for (let c = 0; c < totalChunks; c++) {
        const activePart = c + 1;
        setChunkCurrent(activePart);
        const start = c * chunkDuration;
        const end = Math.min((c + 1) * chunkDuration, totalDuration);
        const partProgress: CaptureTaskProgress = {
          kind: 'parts',
          completedParts: c,
          totalParts: totalChunks,
          activePart,
        };
        
        addThinkingLog(`🔪 Memotong bagian ${activePart}/${totalChunks} (menit ${Math.floor(start / 60)}–${Math.floor(end / 60)})...`);
        setChunkProgress(`Menyiapkan bagian ${activePart} dari ${totalChunks}...`);
        setCaptureTaskStage(taskId, 'preparing', {
          progress: partProgress,
          stageLabel: `Menyiapkan bagian ${activePart}`,
          stageDescription: 'Decode dan resample di browser tidak memiliki persentase byte yang akurat.',
        });
        
        const slicedBuffer = await sliceAudioBuffer(audioBuffer, start, end);
        
        setChunkProgress(`Mengubah bagian ${activePart} menjadi WAV...`);
        const wavBlob = bufferToWav(slicedBuffer);
        const wavFile = new File([wavBlob], `chunk-${activePart}.wav`, { type: 'audio/wav' });
        
        addThinkingLog(`🎙️ Nalira mendengarkan bagian ${activePart}/${totalChunks}...`);
        setChunkProgress(`Nalira mendengarkan bagian ${activePart} dari ${totalChunks}...`);
        setCaptureTaskStage(taskId, 'transcribing', {
          progress: partProgress,
          stageDescription: `Bagian ${activePart} sedang dikirim dan ditranskrip.`,
        });
        
        const formData = new FormData();
        formData.append('file', wavFile);
        // Chunk besar cukup ditranskrip. Rangkuman baru dibuat SEKALI setelah
        // seluruh transkrip digabung; kalau tidak, rekaman 18 menit meminta
        // banyak rangkuman penuh sekaligus dan gampang kena limit Groq.
        formData.append('transcribeOnly', 'true');
        
        const data = await requestCaptureJsonWithRateLimitRetry<CaptureTranscriptionResponse>(
          '/api/summarize',
          { body: formData },
          {
            maxRateLimitRetries: 2,
            onRateLimited: ({ attempt, retryAfterSeconds }) => {
              const waitLabel = retryAfterSeconds >= 60
                ? `${Math.ceil(retryAfterSeconds / 60)} menit`
                : `${retryAfterSeconds} detik`;
              addThinkingLog(
                `⏳ Batas aman API tercapai. Bagian ${activePart} disimpan dan dilanjutkan otomatis dalam ${waitLabel} (percobaan ${attempt}/2).`,
              );
              setChunkProgress(
                `Menunggu ${waitLabel}, lalu melanjutkan bagian ${activePart} dari ${totalChunks}...`,
              );
              setCaptureTaskStage(taskId, 'transcribing', {
                progress: partProgress,
                stageLabel: 'Menunggu giliran aman',
                stageDescription: `Bagian ${activePart} tetap aktif dan akan dicoba kembali otomatis.`,
              });
            },
          },
        );

        addThinkingLog(`✅ Bagian ${activePart} selesai ditranskripsi!`);
        concatenatedTranscript += `${data.transcript} `;
        concatenatedSegments.push(...offsetTranscriptSegments(
          data.segments,
          Math.round(start * 1000),
          `part-${activePart}`,
        ));
        transcriptionModel ??= data.processing.transcriptionModel;
        setChunkCompleted(activePart);
        setCaptureTaskStage(taskId, 'transcribing', {
          progress: {
            kind: 'parts',
            completedParts: activePart,
            totalParts: totalChunks,
          },
        });
      }
      
      addThinkingLog('📝 Semua bagian selesai! Nalira sedang merangkum keseluruhan isi...');
      setChunkProgress('Semua bagian selesai! Nalira sedang menyusun rangkuman final...');
      setCaptureTaskStage(taskId, 'summarizing', {
        progress: { kind: 'indeterminate' },
      });

      const summarizeData = await requestCaptureJson<AggregateSummaryResponse>(
        '/api/summarize-transcript',
        {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: concatenatedTranscript,
            durationSec: fileDurationSec,
            segments: concatenatedSegments,
          }),
        },
      );
      
      const title = extractTitleFromSummary(summarizeData.summary);
      const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');

      if (!transcriptionModel) {
        throw new CapturePipelineError({
          code: 'invalid-response',
          message: 'Metadata model transkripsi tidak tersedia.',
          retryable: true,
        });
      }
      
      setPendingSummary({
        captureTaskId: taskId,
        title,
        file_name: fileName,
        duration_sec: fileDurationSec || null,
        transcript: concatenatedTranscript,
        summary: summarizeData.summary,
        word_count: concatenatedTranscript.split(/\s+/).length,
        evidence: {
          clientRequestId: taskId,
          provider: summarizeData.processing.provider,
          transcriptionModel,
          summaryModel: summarizeData.processing.summaryModel,
          quality: summarizeData.quality,
          segments: concatenatedSegments,
        },
      });
      setChosenSaveFolderId(targetFolderId);
      setCaptureTaskStage(taskId, 'awaiting_save');
      setShowSaveFolderModal(true);

    } catch (err: unknown) {
      console.error(err);
      markCaptureTaskFailed(taskId, err, 'Gagal memproses file audio besar.');
    } finally {
      setLoading(false);
      setIsChunkProcessing(false);
      setChunkProgress('');
      setStatusMessage('');
      stopThinkingTimer();
      void audioCtx?.close();
    }
  };

  // Main Audio Processor
  async function startProcessing(
    sourceFile: File,
    name: string,
    queueIndex: number | null,
    taskId: string,
  ) {
    setCaptureTasks((current) => startCaptureTaskAttempt(current, taskId));
    setError(null);

    // Check monthly limit for Free tier
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthSummariesCount = summaries.filter(s => {
      const date = new Date(s.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    if (
      captureLimits.monthlySummaryLimit !== null &&
      currentMonthSummariesCount >= captureLimits.monthlySummaryLimit
    ) {
      showToast('Batas bulanan akun gratis tercapai (maksimal 5 rangkuman per bulan).', 'delete');
      setShowUpgradeModal(true);
      markCaptureTaskFailed(taskId, new CapturePipelineError({
        code: 'monthly-limit',
        message: 'Batas rangkuman bulanan paket gratis sudah tercapai.',
        retryable: false,
      }), 'Batas bulanan tercapai.');
      return;
    }

    // Check folder limit early if a specific folder is targeted
    const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');
    if (captureLimits.folderSummaryLimit !== null && targetFolderId !== 'null') {
      const folderSummariesCount = summaries.filter(s => s.folder_id === targetFolderId).length;
      if (folderSummariesCount >= captureLimits.folderSummaryLimit) {
        showToast('Batas 3 rangkuman per mata kuliah tercapai untuk paket gratis.', 'delete');
        setShowUpgradeModal(true);
        markCaptureTaskFailed(taskId, new CapturePipelineError({
          code: 'folder-limit',
          message: 'Tujuan ini sudah mencapai batas tiga rangkuman paket gratis.',
          retryable: false,
        }), 'Batas penyimpanan tercapai.');
        return;
      }
    }

    // Block files larger than 150MB to prevent browser memory exhaust / tab crash
    if (exceedsMaxFileSize(sourceFile)) {
      markCaptureTaskFailed(taskId, new CapturePipelineError({
        code: 'file-too-large',
        message: `Ukuran berkas ${Math.round(sourceFile.size / 1024 / 1024)} MB melebihi batas 150 MB.`,
        retryable: false,
      }), 'Ukuran berkas terlalu besar.');
      return;
    }

    // Any file >4 MB (audio or video) goes through browser chunking.
    if (sourceFile.size > CHUNK_THRESHOLD_BYTES) {
      await processLargeAudio(sourceFile, name, queueIndex, taskId);
      return;
    }
    
    setLoading(true);
    setError(null);
    setThinkingLog([]);
    setShowThinkingPanel(false);
    startThinkingTimer();
    
    const fileLabel = queueIndex !== null ? ` (Berkas ${queueIndex + 1} dari ${files.length})` : '';
    addThinkingLog(`🎙️ Mulai mendengarkan rekaman${fileLabel}...`);
    setStatusMessage(`Audio sedang dikirim untuk ditranskrip dan dirangkum${fileLabel}.`);

    try {
      const duration = sourceFile.size > 0
        ? await getAudioDuration(sourceFile)
        : recordingDuration;
      
      const formData = new FormData();
      formData.append('file', sourceFile, name);

      setCaptureTaskStage(taskId, 'uploading', {
        progress: {
          kind: 'bytes',
          completedBytes: 0,
          totalBytes: sourceFile.size,
        },
      });

      const data = await requestCaptureJson<CaptureSummaryResponse>(
        '/api/summarize',
        {
          body: formData,
          onUploadProgress: ({ completedBytes, totalBytes }) => {
            setCaptureTaskStage(taskId, 'uploading', {
              progress: { kind: 'bytes', completedBytes, totalBytes },
            });
          },
          onUploadComplete: () => {
            setCaptureTaskStage(taskId, 'transcribing', {
              progress: { kind: 'indeterminate' },
              stageLabel: 'Memproses audio',
              stageDescription: 'File sudah terkirim. Endpoint ini mentranskrip dan merangkum dalam satu proses yang tidak dapat diukur terpisah.',
            });
          },
        },
      );

      // Auto-save to Supabase
      const title = extractTitleFromSummary(data.summary);
      const targetFolderId = chosenSaveFolderId !== 'null' ? chosenSaveFolderId : (activeFolderId !== 'all' && activeFolderId !== 'uncategorized' && activeFolderId !== 'recent' ? activeFolderId : 'null');

      setPendingSummary({
        captureTaskId: taskId,
        title,
        file_name: name,
        duration_sec: duration || null,
        transcript: data.transcript,
        summary: data.summary,
        word_count: data.transcript.split(/\s+/).length,
        evidence: {
          clientRequestId: taskId,
          provider: data.processing.provider,
          transcriptionModel: data.processing.transcriptionModel,
          summaryModel: data.processing.summaryModel,
          quality: data.quality,
          segments: data.segments,
        },
      });
      setChosenSaveFolderId(targetFolderId);
      setCaptureTaskStage(taskId, 'awaiting_save');
      setShowSaveFolderModal(true);

      if (queueIndex === null) {
        setAudioBlob(null);
        setAudioUrl(null);
      }
    } catch (err: unknown) {
      console.error(err);
      markCaptureTaskFailed(taskId, err, 'Gagal memproses audio. Silakan coba lagi.');
    } finally {
      setLoading(false);
      setStatusMessage('');
      stopThinkingTimer();
    }
  }

  const handleSubmit = async () => {
    if (files.length > 0) {
      const firstTaskIndex = captureTasks.findIndex(
        (task) => task.status === 'selected' || task.status === 'queued',
      );
      if (firstTaskIndex < 0) return;
      const firstTask = captureTasks[firstTaskIndex];
      setCaptureTasks((current) => current.map((task) =>
        task.status === 'selected' || task.status === 'queued'
          ? { ...task, destinationLabel: captureDestinationLabel }
          : task,
      ));
      setCurrentQueueIndex(firstTaskIndex);
      await startProcessing(firstTask.reference, firstTask.name, firstTaskIndex, firstTask.id);
    } else if (audioBlob) {
      const name = `rekaman-${new Date().toISOString().slice(0, 10)}.webm`;
      const recordingFile = new File([audioBlob], name, {
        type: audioBlob.type || 'audio/webm',
      });
      const task = createSelectedCaptureTask({
        id: createCaptureTaskId(),
        reference: recordingFile,
        file: recordingFile,
        source: 'recording',
        destinationLabel: captureDestinationLabel,
        durationSeconds: recordingDuration,
      });
      setCaptureTasks([task]);
      setCurrentQueueIndex(0);
      await startProcessing(recordingFile, name, null, task.id);
    }
  };

  const handleRetryCaptureTask = async (taskId: string) => {
    const taskIndex = captureTasks.findIndex((task) => task.id === taskId);
    if (taskIndex < 0) return;
    const task = captureTasks[taskIndex];
    if (task.status !== 'failed' || task.error?.retryable !== true) return;

    setPendingSummary(null);
    setShowSaveFolderModal(false);
    setCurrentQueueIndex(taskIndex);
    await startProcessing(
      task.reference,
      task.name,
      task.source === 'upload' ? taskIndex : null,
      task.id,
    );
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

  const handleExportPdf = () => {
    if (!selectedSummary) return;

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
    const title = document.createElement('h1');
    title.textContent = selectedSummary.title;
    printArea.appendChild(title);
    const content = document.createElement('div');
    content.innerHTML = convertMarkdownToHtml(selectedSummary.summary);
    printArea.appendChild(content);
    document.body.appendChild(printArea);

    window.print();
    window.setTimeout(() => {
      printStyle.remove();
      printArea.remove();
    }, 1000);
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
      link.download = `${cleanTitle}_Rangkuman_Nalira.doc`;
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
      link.download = `Rekaman_Nalira_${dateStr}.webm`;
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

    if (e.type === 'dragenter') {
      captureDragDepthRef.current += 1;
    }

    if (e.type === 'dragleave') {
      captureDragDepthRef.current = Math.max(0, captureDragDepthRef.current - 1);
      if (captureDragDepthRef.current === 0) setCaptureDragState('idle');
      return;
    }

    const fileItems = Array.from(e.dataTransfer.items).filter((item) => item.kind === 'file');
    const itemFiles = fileItems
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const candidateFiles = itemFiles.length > 0
      ? itemFiles
      : Array.from(e.dataTransfer.files);
    const candidateCount = candidateFiles.length || fileItems.length;
    const queueWouldOverflow = files.length + candidateCount > MAX_QUEUE_FILES;
    const candidatesAreValid = candidateFiles.length > 0
      ? candidateFiles.every(
          (file) => isSupportedMediaFile(file) && !exceedsMaxFileSize(file),
        )
      : fileItems.length > 0 && fileItems.every(
          (item) => item.type.startsWith('audio/') || item.type.startsWith('video/'),
        );

    setCaptureDragState(
      candidateCount > 0 && !queueWouldOverflow && candidatesAreValid
        ? 'valid'
        : 'invalid',
    );
  };

  const addCaptureCandidates = (candidateFiles: File[]) => {
    const unsupportedFiles = candidateFiles.filter((file) => !isSupportedMediaFile(file));
    const oversizedFiles = candidateFiles.filter(
      (file) => isSupportedMediaFile(file) && exceedsMaxFileSize(file),
    );
    const validFiles = candidateFiles.filter(
      (file) => isSupportedMediaFile(file) && !exceedsMaxFileSize(file),
    );
    const queueResult = mergeCaptureQueue(files, validFiles);
    const availableSlots = Math.max(0, MAX_QUEUE_FILES - files.length);
    const overflowCount = Math.max(0, validFiles.length - availableSlots);
    const notices: string[] = [];

    if (unsupportedFiles.length > 0) {
      notices.push(`${unsupportedFiles.length} file dilewati karena formatnya belum didukung.`);
    }
    if (oversizedFiles.length > 0) {
      notices.push(`${oversizedFiles.length} file dilewati karena ukurannya melebihi 150 MB.`);
    }
    if (overflowCount > 0 || queueResult.queueLimitReached) {
      notices.push('Antrean hanya menampung tiga file. File sisanya belum ditambahkan.');
    }

    if (validFiles.length > 0 && availableSlots > 0) {
      const addedFiles = queueResult.files.slice(files.length);
      const addedTasks = addedFiles.map((file) => createSelectedCaptureTask({
        id: createCaptureTaskId(),
        reference: file,
        file,
        destinationLabel: captureDestinationLabel,
      }));
      setCaptureTasks((current) => [...current, ...addedTasks]);
      addedTasks.forEach((task) => {
        void getAudioDuration(task.reference).then((durationSeconds) => {
          if (durationSeconds <= 0) return;
          setCaptureTasks((current) => patchCaptureTask(current, task.id, {
            durationSeconds,
          }));
        });
      });
      setError(null);
    }

    if (candidateFiles.length === 0) {
      notices.push('Tidak ada file yang dapat dibaca dari pilihan ini.');
    }

    setCaptureInputNotice(notices.length > 0 ? notices.join(' ') : null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    captureDragDepthRef.current = 0;
    setCaptureDragState('idle');
    addCaptureCandidates(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    addCaptureCandidates(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleReplaceCaptureFile = (index: number, replacement: File) => {
    if (!isSupportedMediaFile(replacement)) {
      setCaptureInputNotice('File pengganti belum didukung. Pilih file audio atau video.');
      return;
    }
    if (exceedsMaxFileSize(replacement)) {
      setCaptureInputNotice('File pengganti melebihi batas 150 MB. Pilih file yang lebih kecil.');
      return;
    }

    const currentTask = captureTasks[index];
    if (!currentTask) return;
    const replacementTask = createSelectedCaptureTask({
      id: createCaptureTaskId(),
      reference: replacement,
      file: replacement,
      source: currentTask.source,
      destinationLabel: captureDestinationLabel,
    });
    setCaptureTasks((current) =>
      current.map((task, taskIndex) => taskIndex === index ? replacementTask : task),
    );
    void getAudioDuration(replacement).then((durationSeconds) => {
      if (durationSeconds <= 0) return;
      setCaptureTasks((current) => patchCaptureTask(current, replacementTask.id, {
        durationSeconds,
      }));
    });
    setCaptureInputNotice(null);
    setError(null);
  };

  const handleRemoveCaptureFile = (index: number) => {
    const removedTask = captureTasks[index];
    if (!removedTask) return;
    setCaptureTasks((current) => removeCaptureTask(current, removedTask.id));
    if (removedTask?.source === 'recording') {
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingDuration(0);
    }
    setCaptureInputNotice(null);
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setCaptureTasks([]);
    setPendingSummary(null);
    setShowSaveFolderModal(false);
    setCurrentQueueIndex(0);
    setError(null);
    setCaptureInputNotice(null);
    setCaptureDragState('idle');
    captureDragDepthRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectedCaptureFolder =
    chosenSaveFolderId === 'null'
      ? null
      : folders.find((folder) => folder.id === chosenSaveFolderId) ?? null;
  const captureDestinationLabel = selectedCaptureFolder
    ? `Mata kuliah • ${selectedCaptureFolder.name}`
    : 'Belum Dikategorikan';
  const captureTasksForDisplay = captureTasks.map((task) =>
    task.status === 'selected'
      ? { ...task, destinationLabel: captureDestinationLabel }
      : task,
  );
  const uploadCaptureTasks = captureTasksForDisplay.filter(
    (task) => task.source === 'upload',
  );
  const recordingCaptureTasks = captureTasksForDisplay.filter(
    (task) => task.source === 'recording',
  );
  const captureQueueBusy = isCaptureQueueBusy(captureTasksForDisplay);
  const captureActionsDisabled = loading || captureQueueBusy;
  const canSubmitCapture = isRecordingMode
    ? !captureActionsDisabled && Boolean(audioBlob) && recordingCaptureTasks.length === 0
    : !captureActionsDisabled &&
      uploadCaptureTasks.some(
        (task) => task.status === 'selected' || task.status === 'queued',
      );

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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal membuat mata kuliah baru.'));
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal memperbarui mata kuliah.'));
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
        } catch (err: unknown) {
          setError(getErrorMessage(err, 'Gagal menghapus mata kuliah.'));
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
        } catch (err: unknown) {
          setError(getErrorMessage(err, 'Gagal menghapus rangkuman.'));
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal mengubah status berbagi.'));
    }
  };

  // ────────────────────────────────────────────────
  // VOICE INPUT (MIC) — Sprint 15
  // ────────────────────────────────────────────────
  const handleToggleMic = () => {
    // Cek dukungan browser
    const browserWindow = window as BrowserWindow;
    const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
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

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
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

    recognition.onerror = (event) => {
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal membuat kelompok belajar.'));
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Kode undangan tidak valid atau kelompok tidak ditemukan.'));
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
      const safeTitle = selectedSummary.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40).replace(/\s+/g, '_') || 'nalira_card';
      link.download = `nalira_${safeTitle}_${shareCardFormat}.png`;
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

  const handleRenameSummaryTitle = async (nextTitle: string): Promise<boolean> => {
    if (!selectedSummary || !nextTitle.trim()) return false;
    try {
      const success = await renameSummary(selectedSummary.id, nextTitle);
      if (success) {
        const updatedSummary = { ...selectedSummary, title: nextTitle };
        setSummaries(prev => prev.map(s => s.id === selectedSummary.id ? updatedSummary : s));
        setSelectedSummary(updatedSummary);
        showToast('Judul rangkuman berhasil diubah.', 'success');
        return true;
      } else {
        throw new Error('Gagal mengubah judul di database.');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal mengubah judul.'));
      return false;
    }
  };

  const handleMoveFolder = async (folderId: string | null) => {
    if (!selectedSummary) return;
    const targetFolderId = folderId === 'null' ? null : folderId;

    // Check limit of 3 files per folder for Free tier
    if (captureLimits.folderSummaryLimit !== null && targetFolderId) {
      const folderSummariesCount = summaries.filter(s => s.folder_id === targetFolderId).length;
      if (folderSummariesCount >= captureLimits.folderSummaryLimit) {
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Gagal memindahkan mata kuliah.'));
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
          <ul key={`${keyPrefix}-list`} className="my-4 list-disc space-y-2.5 pl-6 text-[var(--text-secondary)]">
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
        <div key={`table-${keyPrefix}`} className="my-6 overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--nav-selected)]">
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
                        className="border-t border-[var(--border-subtle)] px-4 py-2.5 leading-relaxed text-[var(--text-secondary)]"
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
          <hr key={`hr-${i}`} className="my-6 border-[var(--border-subtle)]" />
        );
        continue;
      }

      if (cleanLine.startsWith('# ')) {
        flushList(`h1-${i}`);
        elements.push(
          <h1 key={`h1-${i}`} className="mb-4 mt-8 border-b border-[var(--border-subtle)] pb-3 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-3xl">
            {cleanLine.replace('# ', '')}
          </h1>
        );
        continue;
      }

      if (cleanLine.startsWith('## ')) {
        flushList(`h2-${i}`);
        elements.push(
          <h2 key={`h2-${i}`} className="mb-4 mt-8 flex items-center gap-2 text-xl font-bold text-[var(--brand-primary)] md:text-2xl">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 inline-block"></span>
            {cleanLine.replace('## ', '')}
          </h2>
        );
        continue;
      }

      if (cleanLine.startsWith('### ')) {
        flushList(`h3-${i}`);
        elements.push(
          <h3 key={`h3-${i}`} className="mb-2 mt-6 text-lg font-semibold text-[var(--text-primary)] md:text-xl">
            {cleanLine.replace('### ', '')}
          </h3>
        );
        continue;
      }

      if (cleanLine.startsWith('> ')) {
        flushList(`bq-${i}`);
        const content = cleanLine.replace(/^>\s+/, '');
        elements.push(
          <blockquote key={`bq-${i}`} className="my-4 rounded-r-xl border-l-4 border-[var(--brand-primary)] bg-[var(--nav-selected)] px-4 py-3 italic text-[var(--text-secondary)]">
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
              className="flex-1 leading-relaxed text-[var(--text-secondary)]"
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
          className="mb-4 leading-relaxed text-[var(--text-secondary)]"
          dangerouslySetInnerHTML={{ __html: parseInline(line) }}
        />
      );
    }

    if (insideList && listItems.length > 0) {
      elements.push(
        <ul key="end-list" className="my-4 list-disc space-y-2.5 pl-6 text-[var(--text-secondary)]">
          {listItems}
        </ul>
      );
    }

    if (insideTable) flushTable('end');

    return elements;
  };

  // getReadingTime helper removed in favor of Fokus Aktif timer & Word Count

  const openWorkspace = (view: WorkspaceView) => {
    setWorkspaceView(view);
    setSelectedSummary(null);
    setSidebarOpen(false);
    setIsChatOpenMobile(false);
    setShowChatHistory(false);
  };

  const openCaptureWorkspace = (recording: boolean) => {
    openWorkspace('capture');
    setIsRecordingMode(recording);
    clearFile();
  };

  const openSummaryInCanvas = (summary: SummaryType) => {
    setSelectedSummary(summary);
    setActiveTab('summary');
    setSidebarOpen(false);
    setIsChatOpenMobile(false);
    setIsChatPanelOpen(false);
  };

  const handleCopySharedLink = async (summary: SummaryType) => {
    if (!summary.public_slug) return;
    try {
      const link = `${window.location.origin}/s/${summary.public_slug}`;
      await navigator.clipboard.writeText(link);
      showToast('Link publik berhasil disalin.', 'success');
    } catch {
      setError('Browser tidak mengizinkan Nalira menyalin link. Buka link lalu salin dari address bar.');
    }
  };

  const handleDisableSharedLink = async (summary: SummaryType) => {
    try {
      const result = await toggleSummaryPublic(summary.id, false, summary.public_slug);
      if (!result) throw new Error('Gagal menonaktifkan link publik.');
      const updatedSummary = {
        ...summary,
        is_public: result.is_public,
        public_slug: result.public_slug,
      };
      setSummaries(previous => previous.map(item => item.id === summary.id ? updatedSummary : item));
      setSelectedSummary(previous => previous?.id === summary.id ? updatedSummary : previous);
      showToast('Link publik dinonaktifkan.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menonaktifkan link publik.');
    }
  };

  return (
    <>
      {/* ─── ONBOARDING SURVEY MODAL (First-time users) ─── */}
      {showOnboardingModal && user && (
        <OnboardingModal
          userName={user.user_metadata?.full_name || user.email || 'Pengguna'}
          onComplete={handleOnboardingComplete}
        />
      )}

      <AppShellRoot blocked={showOnboardingModal}>

      {/* ─── DASHBOARD GUIDED TOUR ─── */}

      <AppShellSidebar
        mobileOpen={sidebarOpen}
        expanded={isSidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        triggerRef={mobileSidebarTriggerRef}
      >
        
        {/* LOGO AREA */}
        {isSidebarOpen ? (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] p-4">
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center gap-2.5" aria-label="Nalira">
                <NaliraBrand variant="horizontal" size={32} />
              </div>
            </div>
            <SidebarToggle
              expanded
              label={sidebarOpen ? 'Tutup navigasi' : 'Ciutkan sidebar'}
              onToggle={() => {
                if (sidebarOpen) setSidebarOpen(false);
                else updateSidebarExpanded(false);
              }}
            />
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-[var(--border-subtle)]">
            <SidebarToggle
              expanded={false}
              onToggle={() => updateSidebarExpanded(true)}
            />
          </div>
        )}

        {/* GLOBAL WORKSPACE NAVIGATION */}
        <nav className="shrink-0 space-y-1 p-3" aria-label="Ruang utama Nalira">
          {([
            ['notara', 'Tanya Nalira', MessageSquare],
            ['home', 'Beranda', House],
            ['courses', 'Mata Kuliah', GraduationCap],
            ['shared', 'Dibagikan', Share2],
          ] as const).map(([view, label, Icon]) => {
            const isActive = workspaceView === view && !selectedSummary;
            return (
              <button
                key={view}
                type="button"
                onClick={() => openWorkspace(view)}
                aria-current={isActive ? 'page' : undefined}
                title={label}
                className={`flex min-h-11 w-full items-center rounded-xl text-xs font-bold transition-colors ${
                  isSidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0'
                } ${
                  isActive
                    ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && <span>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* EXPANDED NAVIGATION CONTENT */}
        {isSidebarOpen ? (
          <div className="flex-1 overflow-y-auto px-3 space-y-6 pb-6 scrollbar-thin animate-in fade-in duration-300">
            {/* Library Section */}
            <div>
              <p className="px-3 text-[9px] font-bold text-zinc-500 tracking-widest uppercase mb-2">Perpustakaan</p>
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    setActiveFolderId('all');
                    setSelectedSummary(null);
                    setWorkspaceView('courses');
                  }}
                  className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'all' 
                      ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-violet-400" />
                    <span>Semua Rangkuman</span>
                  </div>
                  <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {summaries.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveFolderId('recent');
                    setSelectedSummary(null);
                    setWorkspaceView('courses');
                  }}
                  className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'recent' 
                      ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                    <span>Baru Ditambahkan</span>
                  </div>
                  <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
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
                    setWorkspaceView('courses');
                  }}
                  className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    activeFolderId === 'uncategorized' 
                      ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Belum Dikategorikan</span>
                  </div>
                  <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {summaries.filter(s => !s.folder_id).length}
                  </span>
                </button>
              </div>
            </div>

            {/* Folders Section */}
            <div data-tour="sidebar-folders">
              <div className="flex items-center justify-between px-3 mb-2">
                <p className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase">Mata Kuliah</p>
                <button 
                  onClick={() => {
                    setEditingFolder(null);
                    setFolderName('');
                    setFolderColor('#8B5CF6');
                    setFolderIcon('📁');
                    setShowFolderModal(true);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-violet-400"
                  title="Tambah Folder Baru"
                  aria-label="Tambah mata kuliah baru"
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
                              ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)] font-bold'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
                          }`}
                        >
                          <button
                            onClick={() => {
                              setActiveFolderId(folder.id);
                              setSelectedSummary(null);
                              setWorkspaceView('courses');
                            }}
                            className="flex min-h-11 flex-1 items-center gap-2.5 truncate px-3 py-2 text-left text-xs"
                          >
                            <span className="text-sm select-none">{folder.icon}</span>
                            <span className="truncate">{folder.name}</span>
                            <span 
                              className="h-1.5 w-1.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: folder.color }}
                            />
                          </button>

                          <div className="flex items-center gap-1 pr-2">
                            <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)] group-hover/folder:hidden">
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
                              aria-label={`Edit mata kuliah ${folder.name}`}
                              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/10 hover:text-white md:hidden md:group-hover/folder:flex"
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
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-violet-400"
                  title="Buat atau Bergabung Kelompok"
                  aria-label="Buat atau bergabung kelompok belajar"
                >
                  <Users className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {studyGroups.length === 0 ? (
                  <button
                    onClick={() => setShowStudyGroupModal(true)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-600 transition-colors hover:bg-white/[0.02] hover:text-zinc-400"
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
                          className="flex min-h-11 flex-1 items-center gap-2.5 truncate px-3 py-2 text-left text-xs"
                        >
                          <Hash className="h-3 w-3 flex-shrink-0 text-violet-500" />
                          <span className="truncate">{group.name}</span>
                          {group.user_role === 'owner' && (
                            <Crown className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" />
                          )}
                        </button>
                        <button
                          onClick={() => handleLeaveGroup(group.id, group.name)}
                          className="mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/10 hover:text-red-400 md:hidden md:group-hover/sg:flex"
                          title="Keluar dari kelompok"
                          aria-label={`Keluar dari kelompok ${group.name}`}
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
                            className="mt-2 flex min-h-11 w-full items-center gap-1.5 px-1 text-left text-[10px] text-violet-500 transition-colors hover:text-violet-300"
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
              <p className="px-3 text-[9px] font-bold text-zinc-500 tracking-widest uppercase mb-2">
                {activeFolderId === 'all' && "Semua Rangkuman"}
                {activeFolderId === 'recent' && "Baru Ditambahkan"}
                {activeFolderId === 'uncategorized' && "Belum Dikategorikan"}
                {activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'uncategorized' && `Rangkuman ${activeFolder?.name}`}
              </p>
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
                            ? 'bg-[var(--nav-selected)] border-[var(--brand-primary)] text-[var(--nav-selected-text)] font-bold'
                            : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setSelectedSummary(summary);
                            setSidebarOpen(false);
                          }}
                          className="flex-1 text-left px-3 py-2 truncate min-w-0"
                        >
                          <span className="block truncate text-xs font-semibold text-current">
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
                    <NaliraBrand variant="icon" animated={true} motionState="thinking" size={32} className="opacity-40" />
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
                  setWorkspaceView('courses');
                }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
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
                  setWorkspaceView('courses');
                }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
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
                  setWorkspaceView('courses');
                }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all ${
                  activeFolderId === 'uncategorized' ? 'bg-[var(--nav-selected)] text-[var(--nav-selected-text)]' : 'text-[var(--text-tertiary)]'
                }`}
                title="Belum Dikategorikan"
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>

            <hr className="w-6 shrink-0 border-[var(--border-subtle)]" />

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
                      setWorkspaceView('courses');
                    }}
                    className={`h-11 w-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all relative ${
                      isActive ? 'bg-[var(--nav-selected)] border border-[var(--brand-primary)] scale-105' : ''
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
                className="h-11 w-11 rounded-xl flex items-center justify-center hover:bg-white/5 hover:text-violet-400 text-zinc-600 transition-all border border-dashed border-white/5"
                title="Tambah Folder Baru"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* CAPTURE UTILITY */}
        <div className="shrink-0 px-3 pb-3">
          <button
            type="button"
            onClick={() => openCaptureWorkspace(false)}
            title="Rekam atau upload materi baru"
            className={`group flex min-h-11 w-full items-center rounded-xl bg-[var(--action-primary)] text-xs font-bold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)] ${
              isSidebarOpen ? 'justify-center gap-2 px-4' : 'justify-center px-0'
            }`}
          >
            <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:rotate-90" />
            {isSidebarOpen && <span>Rekam / Upload</span>}
          </button>
        </div>

        {/* SIDEBAR FOOTER */}
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-sidebar)]">
          {user && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={openSettings}
                title={user.user_metadata?.full_name || user.email || 'Profil Saya'}
                className={`flex min-h-11 w-full items-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] ${
                  isSidebarOpen ? 'gap-2.5 px-2.5 text-left' : 'justify-center px-0'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-black text-[var(--text-on-brand)]">
                  {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </span>
                {isSidebarOpen && (
                  <span className="min-w-0">
                    <strong className="block truncate text-xs text-[var(--text-primary)]">{user.user_metadata?.full_name || 'Profil saya'}</strong>
                    <small className="block truncate text-[10px] text-[var(--text-tertiary)]">{user.email}</small>
                  </span>
                )}
              </button>
            </div>
          )}
          {/* Version Badge — shown when sidebar is expanded */}
          {isSidebarOpen && (
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Nalira</span>
              <span className="text-[10px] font-mono font-bold text-violet-500/60 bg-violet-500/10 border border-violet-500/15 rounded-full px-2 py-0.5">
                v{packageJson.version}
              </span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" title="Versi terkini" />
            </div>
          )}
          <div className="p-3">
            {isSidebarOpen ? (
              <button
                onClick={handleLogout}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-400 transition-all hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Keluar</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-rose-400 transition-all hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer"
                title="Keluar"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </AppShellSidebar>

      {/* RIGHT COLUMN AREA */}
      <AppShellWorkspace sidebarExpanded={sidebarExpanded} mobileNavigationOpen={sidebarOpen}>
        
        {/* HEADER BAR */}
        <AppShellTopbar>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              ref={mobileSidebarTriggerRef}
              onClick={() => setSidebarOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] md:hidden"
              aria-controls="notara-navigation"
              aria-expanded={sidebarOpen}
              aria-label="Buka navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              ref={searchTriggerRef}
              type="button"
              onClick={() => {
                setShowSearchModal(true);
                setSearchQuery('');
                setSelectedSearchResultIdx(0);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] sm:w-64 sm:justify-start"
              aria-label="Cari materi dan rangkuman"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden truncate sm:inline">Cari materi atau rangkuman...</span>
              <span className="ml-auto hidden rounded-md border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)] sm:inline">
                Ctrl K
              </span>
            </button>

            {activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'uncategorized' && activeFolder && (
              <span className="hidden max-w-44 items-center gap-1.5 truncate rounded-lg bg-[var(--nav-selected)] px-2.5 py-1.5 text-xs font-bold text-[var(--nav-selected-text)] lg:flex">
                <span>{activeFolder.icon}</span>
                <span className="truncate">{activeFolder.name}</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => openWorkspace('notara')}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border md:hidden ${
                workspaceView === 'notara' && !selectedSummary
                  ? 'border-[var(--brand-primary)] bg-[var(--nav-selected)] text-[var(--nav-selected-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--brand-primary)]'
              }`}
              aria-label="Tanya Nalira"
            >
              <MessageSquare className="h-4 w-4" />
            </button>

            <button
              onClick={() => openWorkspace('notara')}
              className={`hidden h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors md:flex ${
                workspaceView === 'notara' && !selectedSummary
                  ? 'border-[var(--brand-primary)] bg-[var(--nav-selected)] text-[var(--nav-selected-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
              }`}
              title="Buka Tanya Nalira"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Tanya Nalira</span>
            </button>

            <button
              type="button"
              onClick={() => openCaptureWorkspace(true)}
              className="hidden h-11 items-center gap-2 rounded-xl bg-[var(--action-primary)] px-3.5 text-xs font-bold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)] sm:flex"
            >
              <Mic className="h-4 w-4" />
              <span>Rekam baru</span>
            </button>

            <ThemeSwitcher />

            {user && (
              <div data-tour="global-search" className="flex items-center gap-2">
                <button
                  onClick={openSettings}
                  className="hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] sm:flex"
                  title="Pengaturan Akun"
                >
                  <Settings className="h-4 w-4" />
                </button>

                <button
                  onClick={openSettings}
                  className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-bold text-[var(--text-on-brand)] ring-offset-2 ring-offset-[var(--surface-header)] transition-shadow hover:ring-2 hover:ring-[var(--focus-ring)]"
                  title={user.user_metadata?.full_name || user.email || 'Profil Saya'}
                >
                  {user.user_metadata?.avatar_url ? (
                    <Image
                      src={user.user_metadata.avatar_url}
                      alt="Foto profil"
                      width={44}
                      height={44}
                      unoptimized
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
        </AppShellTopbar>

        {/* SPLIT WORKSPACE WINDOW */}
        <div className="flex-1 flex flex-row overflow-hidden relative">
          
          {/* COLUMN 2: MIDDLE DOCUMENT AREA */}
          <main id="notara-main-content" tabIndex={-1} className="notara-dashboard-content flex-1 overflow-y-auto p-6 md:p-10 select-text scrollbar-thin">
            
            {error && (
              <div className="mx-auto mb-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-[var(--danger-accent)] animate-in fade-in">
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">Terjadi Kesalahan</h4>
                  <p className="mt-0.5 text-sm">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-zinc-500 hover:text-white p-0.5">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* UNIFIED NALIRA THINKING LOADER */}
            {loading && (
              <>
                <ProcessingView
                  thinkingElapsed={thinkingElapsed}
                  isChunkProcessing={isChunkProcessing}
                  chunkProgress={chunkProgress}
                  statusMessage={statusMessage}
                  chunkCurrent={chunkCurrent}
                  chunkCompleted={chunkCompleted}
                  chunkTotal={chunkTotal}
                  thinkingLog={thinkingLog}
                  showThinkingPanel={showThinkingPanel}
                  onToggleThinkingPanel={() => setShowThinkingPanel(value => !value)}
                />
                {captureTasksForDisplay.length > 0 && (
                  <div className="mx-auto mt-8 max-w-3xl">
                    <CaptureTaskList
                      tasks={captureTasksForDisplay}
                      onReplace={handleReplaceCaptureFile}
                      onRemove={handleRemoveCaptureFile}
                      onRetry={handleRetryCaptureTask}
                      actionsDisabled
                    />
                  </div>
                )}
              </>
            )}

            {!selectedSummary && !loading && isDataLoading && workspaceView !== 'capture' && (
              <div className="mx-auto max-w-5xl space-y-6 py-12 animate-pulse" aria-label="Memuat ruang belajar">
                <div className="h-5 w-28 rounded-md bg-[var(--surface-elevated)]" />
                <div className="h-12 w-2/3 rounded-2xl bg-[var(--surface-elevated)]" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-48 rounded-3xl bg-[var(--surface-elevated)]" />
                  <div className="h-48 rounded-3xl bg-[var(--surface-elevated)]" />
                </div>
              </div>
            )}

            {!selectedSummary && !loading && !isDataLoading && workspaceView === 'home' && (
              <HomeWorkspace
                userName={user?.user_metadata?.full_name || user?.email || 'teman belajar'}
                folders={folders}
                summaries={summaries}
                processingError={error}
                onUpload={() => openCaptureWorkspace(false)}
                onRecord={() => openCaptureWorkspace(true)}
                onOpenSummary={openSummaryInCanvas}
                onOpenCourses={() => openWorkspace('courses')}
                onOpenNotara={() => openWorkspace('notara')}
              />
            )}

            {!selectedSummary && !loading && !isDataLoading && workspaceView === 'courses' && (
              <CoursesWorkspace
                folders={folders}
                summaries={summaries}
                activeFolderId={activeFolderId}
                onCreateCourse={() => {
                  setEditingFolder(null);
                  setFolderName('');
                  setFolderColor('#8B5CF6');
                  setFolderIcon('📁');
                  setShowFolderModal(true);
                }}
                onSelectCourse={(folderId) => setActiveFolderId(folderId)}
                onOpenSummary={openSummaryInCanvas}
              />
            )}

            {!selectedSummary && !loading && !isDataLoading && workspaceView === 'shared' && (
              <SharedWorkspace
                summaries={summaries}
                onOpenSummary={openSummaryInCanvas}
                onCopyLink={handleCopySharedLink}
                onDisableLink={handleDisableSharedLink}
              />
            )}

            {!selectedSummary && !loading && !isDataLoading && workspaceView === 'notara' && (
              <NotaraWorkspace
                folders={folders}
                summaries={summaries}
                messages={chatMessages}
                threads={chatThreads}
                activeThreadId={activeThreadId}
                input={chatInput}
                isSending={isSendingChat}
                showHistory={showChatHistory}
                onInputChange={setChatInput}
                onSend={handleSendChatMessage}
                onCreateThread={handleCreateNewThread}
                onToggleHistory={() => setShowChatHistory(value => !value)}
                onSelectThread={(threadId) => {
                  locallyInitializedChatThreadIdRef.current = null;
                  setActiveThreadId(threadId);
                  setShowChatHistory(false);
                }}
                onDeleteThread={(threadId) => handleDeleteThread(threadId)}
                onOpenSummary={openSummaryInCanvas}
                renderMessage={renderMarkdown}
              />
            )}

            {/* SCREEN 1: UPLOAD AREA / RECORDER CHOOSE */}
            {!selectedSummary && !loading && workspaceView === 'capture' && (
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
                <div className="relative mx-auto max-w-3xl animate-in fade-in px-4 py-4 duration-300 sm:px-6 md:py-8">
                  <WorkspaceAmbientHeader
                    variant="capture"
                    state={isRecordingMode ? 'record' : 'upload'}
                    title="Tambahkan materi baru"
                    description="Rekam kuliah atau unggah audio/video. Antrean diproses berurutan di tab ini, lalu audio dibuang setelah transkripsi selesai."
                    meta={(
                      <>
                        <span><strong>Maks. 3</strong> antrean</span>
                        <span><strong>150 MB</strong> per file</span>
                        <span><strong>Tanpa audio</strong> tersimpan</span>
                      </>
                    )}
                  />

                  {/* Upload vs Recording Selector Toggle */}
                  <CaptureSourceTabs
                    isRecordingMode={isRecordingMode}
                    onSelectUpload={() => {
                        setIsRecordingMode(false);
                        clearFile();
                      }}
                    onSelectRecording={() => {
                        setIsRecordingMode(true);
                        clearFile();
                      }}
                  />

                {/* CONDITIONAL CONTROLLER */}
                {!isRecordingMode ? (
                  /* UPLOAD INTERFACE */
                  <UploadQueuePanel
                    tasks={uploadCaptureTasks}
                    dragState={captureDragState}
                    notice={captureInputNotice}
                    fileInputRef={fileInputRef}
                    onDrag={handleDrag}
                    onDrop={handleDrop}
                    onFileChange={handleFileChange}
                    onBrowse={handleButtonClick}
                    onReplaceFile={handleReplaceCaptureFile}
                    onRemoveFile={handleRemoveCaptureFile}
                    onClearFiles={clearFile}
                    onRetryTask={handleRetryCaptureTask}
                    actionsDisabled={captureActionsDisabled}
                  />
                ) : (
                  /* VOICE RECORD PANEL INTERFACE */
                  <>
                    <RecordingPanel
                      canvasRef={canvasRef}
                      isRecording={isRecording}
                      isPaused={isPaused}
                      audioBlob={audioBlob}
                      audioUrl={audioUrl}
                      formattedDuration={formatDuration(recordingDuration)}
                      onStart={startRecording}
                      onPause={pauseRecording}
                      onResume={resumeRecording}
                      onStop={stopRecording}
                      onDownload={handleDownloadAudio}
                      onReset={() => {
                        setAudioBlob(null);
                        setAudioUrl(null);
                        setRecordingDuration(0);
                        clearFile();
                      }}
                    />
                    {recordingCaptureTasks.length > 0 && (
                      <div className="mt-5">
                        <CaptureTaskList
                          tasks={recordingCaptureTasks}
                          onReplace={handleReplaceCaptureFile}
                          onRemove={handleRemoveCaptureFile}
                          onRetry={handleRetryCaptureTask}
                          actionsDisabled={captureActionsDisabled}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* SUBMIT BUTTON CONTROL ACTION & FOLDER SELECTOR */}
                {canSubmitCapture && (
                  <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] p-6 animate-in fade-in">
                    
                    {/* Folder Assignment Before Processing */}
                    <div className="w-full space-y-3.5 text-left">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
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
                        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-tertiary)]">Nama Mata Kuliah</label>
                            <input
                              type="text"
                              value={inlineFolderName}
                              onChange={(e) => setInlineFolderName(e.target.value)}
                              placeholder="Contoh: Basis Data"
                              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-tool)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-[var(--text-tertiary)]">Emoji Ikon</label>
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
                      className="w-full cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2.5 font-sans text-xs text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none"
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
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--action-primary)] py-3.5 text-sm font-bold tracking-wide text-[var(--text-on-brand)] transition-colors hover:bg-[var(--action-primary-hover)]"
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
              <StudyGuideWorkspace
                key={selectedSummary.id}
                summary={selectedSummary}
                folder={folders.find(folder => folder.id === selectedSummary.folder_id) ?? null}
                viewerUserId={user?.id ?? null}
                sourceAvailable={selectedSummary.id.startsWith('local-') || summaries.some((summary) => summary.id === selectedSummary.id)}
                folders={folders}
                activeTab={activeTab}
                studySeconds={studySeconds}
                copied={copied}
                hasAudio={Boolean(audioBlob)}
                onTabChange={setActiveTab}
                onBack={() => openWorkspace('courses')}
                onRenameTitle={handleRenameSummaryTitle}
                onMoveFolder={handleMoveFolder}
                onCreateCourse={(returnFocus) => {
                  setEditingFolder(null);
                  setFolderName('');
                  setFolderColor('#8B5CF6');
                  setFolderIcon('📁');
                  folderModalReturnFocusRef.current = returnFocus;
                  setShowFolderModal(true);
                }}
                onTogglePublic={handleTogglePublic}
                onCopyPublicLink={() => handleCopySharedLink(selectedSummary)}
                onCreateShareCard={() => setShowShareCardModal(true)}
                onDelete={() => void handleDeleteSummary(selectedSummary.id)}
                onExportPdf={handleExportPdf}
                onExportWord={handleExportWord}
                onDownloadAudio={handleDownloadAudio}
                onCopy={handleCopy}
                summaryContent={(
                  <div className="notara-study-summary-content">
                    {renderMarkdown(selectedSummary.summary)}
                  </div>
                )}
                transcriptContent={(
                  <TranscriptEvidenceReview
                    summaryId={selectedSummary.id}
                    aggregateTranscript={selectedSummary.transcript}
                    evidenceEnabled={Boolean(
                      user?.id
                      && selectedSummary.user_id === user.id
                      && !selectedSummary.id.startsWith('local-')
                    )}
                  />
                )}
                tutor={{
                  messages: chatMessages,
                  threads: chatThreads.filter((thread) => thread.summary_id === selectedSummary.id),
                  activeThreadId,
                  input: chatInput,
                  isSending: isSendingChat,
                  isListening,
                  voiceNotSupported,
                  showHistory: showChatHistory,
                  textareaRef,
                  onInputChange: setChatInput,
                  onSend: handleSendChatMessage,
                  onToggleMic: handleToggleMic,
                  onToggleHistory: () => setShowChatHistory((value) => !value),
                  onNewThread: handleCreateNewThread,
                  onSelectThread: (threadId) => {
                    setActiveThreadId(threadId);
                    setShowChatHistory(false);
                  },
                  onDeleteThread: (threadId) => void handleDeleteThread(threadId),
                  onClear: handleClearChat,
                  renderMessage: renderMarkdown,
                  formatThreadAge: formatRelativeTime,
                }}
              />
            )}

          </main>

          {/* COLUMN 3: RIGHT CHAT PANEL */}
          {selectedSummary && !USE_INLINE_MATERIAL_TUTOR && (
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
                        <NaliraBrand variant="icon" size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white leading-none">Nalira</h4>
                        <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider block mt-0.5">Nalira</span>
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
                          localStorage.setItem('isMaterialTutorPanelOpen', 'false');
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
                      🤖 Asisten Nalira (Global)
                    </div>
                  )}
                </div>

                {showChatHistory ? (
                  /* THREAD HISTORY VIEW */
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin">
                    {chatThreads.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 py-12 space-y-2">
                        <NaliraBrand variant="icon" animated={true} motionState="thinking" size={32} className="opacity-40" />
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
                          Tanya saya cara menggunakan Nalira, unggah file besar hingga 150MB, atau kelola folder.
                        </div>
                      )}

                      {chatMessages.length === 0 ? (
                        <div className="flex gap-2.5 items-start max-w-[85%]">
                          <div className="h-6 w-6 shrink-0 flex items-center justify-center">
                            <NaliraBrand variant="icon" size={24} />
                          </div>
                          <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-2xl rounded-tl-none text-xs text-zinc-300 leading-relaxed font-sans">
                            {selectedSummary 
                              ? "Halo! Aku Nalira. Ada bagian dari materi rekaman ini yang ingin kamu tanyakan atau minta dijelaskan ulang?"
                              : "Halo! Saya Nalira AI. Ada yang bisa saya bantu tentang cara menggunakan Nalira, mencatat audio/rapat, atau informasi fitur lainnya?"}
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
                                <NaliraBrand variant="icon" size={24} animated={msg.content === ''} motionState="thinking" />
                              </div>
                              <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-2xl rounded-tl-none text-xs text-zinc-300 leading-relaxed select-text break-words w-full">
                                {msg.content ? (
                                  <div className="prose prose-invert max-w-none text-zinc-300 select-text leading-relaxed text-xs space-y-2">
                                    {renderMarkdown(msg.content)}
                                  </div>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-zinc-500 italic">
                                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                                    Nalira sedang mengetik...
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
                          aria-label="Pertanyaan untuk tutor materi"
                          placeholder={
                            isListening
                              ? "🎙️ Sedang mendengarkan..."
                              : selectedSummary
                                ? (chatScope === 'summary' 
                                    ? "Tanya materi ulasan ini..." 
                                    : chatScope === 'folder' 
                                      ? `Tanya lintas materi ${activeFolder?.name || ''}...` 
                                      : "Tanya lintas seluruh rangkuman...")
                                : "Tanya asisten global Nalira..."
                          }
                          className={`min-h-11 w-full max-h-[120px] resize-none overflow-y-auto rounded-2xl border bg-black/40 py-2.5 pl-4 pr-24 font-sans text-xs text-zinc-200 placeholder-zinc-600 transition-colors duration-300 focus:outline-none disabled:opacity-50 ${
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
                          className={`absolute bottom-0 right-11 flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${
                            isListening 
                              ? 'w-9 h-8 bg-black/50 border border-rose-500/30' 
                              : 'text-zinc-500 hover:text-violet-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed'
                          }`}
                          title={isListening ? "Hentikan rekaman" : "Input suara (Bahasa Indonesia)"}
                          aria-label={isListening ? "Hentikan input suara" : "Mulai input suara"}
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
                          className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white transition-all duration-200 active:scale-95 disabled:bg-white/5 disabled:text-zinc-600"
                          aria-label="Kirim pertanyaan materi"
                        >
                          {isSendingChat ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[9px] text-center text-zinc-600 mt-2.5 font-medium">
                        🚀 Nalira AI — Tanya apa saja tentang materi ini
                      </p>
                    </form>
                  </>
                )}

              </div>
            </div>
            </>
          )}

        </div>

      </AppShellWorkspace>

      {/* FOLDER CRUD MODAL (CREATE / EDIT) */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowFolderModal(false)} />
          
          <div
            className="relative w-full max-w-md rounded-3xl bg-[#0F0E17] border border-white/[0.05] p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-modal-heading"
          >
            
            <div className="flex items-center justify-between">
              <h3 id="folder-modal-heading" className="text-base font-extrabold text-white">
                {editingFolder ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah Baru'}
              </h3>
              <button 
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5"
                aria-label="Tutup dialog mata kuliah"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="folder-name-input" className="text-xs font-bold text-zinc-400">Nama Mata Kuliah</label>
                <input 
                  ref={folderNameInputRef}
                  id="folder-name-input"
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
          
          <div
            ref={searchDialogRef}
            className="relative z-50 flex max-h-[60vh] w-full max-w-2xl flex-col rounded-3xl border border-white/[0.08] bg-[#0F0E17]/95 p-5 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Pencarian materi"
          >
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
                aria-label="Kata kunci pencarian"
                className="bg-transparent text-sm text-white focus:outline-none placeholder-zinc-600 flex-1 font-sans"
              />
              
              {/* Folder Filter */}
              <select
                value={searchFolderFilter}
                onChange={(e) => {
                  setSearchFolderFilter(e.target.value);
                  setSelectedSearchResultIdx(0);
                }}
                aria-label="Filter mata kuliah"
                className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-sans text-xs text-zinc-300 cursor-pointer hover:border-violet-500/30 focus:outline-none"
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
                type="button"
                onClick={() => setShowSearchModal(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white"
                aria-label="Tutup pencarian"
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
                      <button
                        type="button"
                        key={result.id}
                        onMouseEnter={() => setSelectedSearchResultIdx(idx)}
                        onFocus={() => setSelectedSearchResultIdx(idx)}
                        onClick={() => {
                          setSelectedSummary(result);
                          setShowSearchModal(false);
                        }}
                        className={`w-full rounded-2xl border p-3 text-left cursor-pointer transition-all duration-200 ${
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
                      </button>
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
                  {recordingStoppedAtLimit
                    ? `Rekaman ${formatDuration(captureLimits.recordingLimitSeconds)} sudah diamankan`
                    : 'Upgrade ke Nalira Pro'}
                </h3>
                <span className="text-[10px] text-zinc-500 font-bold block mt-0.5">
                  {recordingStoppedAtLimit ? 'REKAMAN SIAP DIUNDUH ATAU DIPROSES' : 'DURASI REKAMAN GRATIS TERBATAS'}
                </span>
              </div>
            </div>

            <hr className="border-white/5" />

            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-violet-600/5 border border-violet-500/15 text-xs text-violet-300 leading-relaxed">
                {recordingStoppedAtLimit
                  ? 'Rekaman dihentikan otomatis saat mencapai batas sesi dan audionya tersimpan sementara di tab ini. Tutup pesan ini, lalu pilih Unduh audio atau Mulai Reduksi & Rangkum. Jangan muat ulang halaman sebelum salah satu langkah selesai.'
                  : 'Perekaman langsung akun gratis berhenti otomatis pada menit ke-30 per sesi. Upgrade ke Pro untuk merekam materi kuliah atau rapat lebih panjang.'}
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-bold text-zinc-400">
                  Fitur Premium Nalira Pro:
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
                  <span className="text-sm font-black text-white mt-0.5">{BILLING_PLANS.pro.displayPrice} <span className="text-xs font-medium text-zinc-500">{BILLING_PLANS.pro.periodLabel}</span></span>
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
                {recordingStoppedAtLimit ? 'Lihat rekaman' : 'Kembali'}
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
                    
                    {/* Nalira Brand */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px',
                      }}>🧠</div>
                      <span style={{ color: '#A78BFA', fontSize: '13px', fontWeight: '700', letterSpacing: '0.05em' }}>nalira</span>
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
                        <p style={{ color: '#A78BFA', fontSize: '10px', fontWeight: '700', margin: 0 }}>nalira.app</p>
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
                  Pengaturan Nalira
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
                          <Image
                            src={user.user_metadata.avatar_url}
                            alt="Foto profil"
                            width={48}
                            height={48}
                            unoptimized
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
                            Autentikasi Dua Faktor (2FA) memberikan tingkat keamanan tambahan dengan meminta kode verifikasi dari aplikasi authenticator (Google Authenticator, Authy, Microsoft Authenticator) saat masuk ke Nalira.
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
                              <Image
                                src={mfaQrCode}
                                alt="Kode QR untuk autentikasi dua faktor"
                                width={176}
                                height={176}
                                unoptimized
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
                        <NaliraBrand variant="icon" size={20} showGlow />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-white">Nalira</p>
                        <p className="text-[11px] text-zinc-500 font-mono">Versi v{packageJson.version} · Early Testing</p>
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
                    <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">Perbarui informasi institusi/perusahaan dan peranmu di Nalira.</p>
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
                            <h4 className="text-sm font-extrabold text-emerald-400 tracking-wide">Nalira Pro Aktif</h4>
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
                            <h4 className="text-sm font-extrabold text-amber-400 tracking-wide">Nalira Max Aktif 👑</h4>
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
                              Nalira {getBillingPlanByAmount(subscriptionData.amount)?.name ?? 'Pro'}
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
                            const tier = getBillingPlanByAmount(subscriptionData.amount)?.tier ?? 'pro';
                            const snapToken = subscriptionData.snap_token;
                            const snap = typeof window !== 'undefined' ? (window as BrowserWindow).snap : undefined;
                            if (snap && snapToken) {
                              snap.pay(snapToken, {
                                onSuccess: async () => {
                                  showToast(`Pembayaran berhasil! Akun ${tier === 'max' ? 'Max' : 'Pro'} Anda aktif. 🎉`, 'success');
                                  await loadBillingData();
                                },
                                onPending: async () => {
                                  showToast('Pembayaran pending. Selesaikan tagihan Anda.', 'info');
                                  await loadBillingData();
                                },
                                onError: async () => {
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
                        <h4 className="text-sm font-extrabold text-white tracking-wide">Pilih Paket Langganan Nalira</h4>
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
                                <span className="text-xl font-black">{BILLING_PLANS.pro.displayPrice}</span>
                                <span className="ml-1 text-[10px] font-medium text-zinc-500">{BILLING_PLANS.pro.periodLabel}</span>
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
                                <span className="text-xl font-black">{BILLING_PLANS.max.displayPrice}</span>
                                <span className="ml-1 text-[10px] font-medium text-zinc-500">{BILLING_PLANS.max.periodLabel}</span>
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
                Akun Anda dilindungi keamanan tingkat tinggi. Silakan masukkan kode 6-digit dari aplikasi authenticator Anda untuk melanjutkan ke Nalira.
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
                  Keluar dari Nalira / Ganti Akun
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
      <VersionUpdateBanner />

      </AppShellRoot>
    </>
  );
}
