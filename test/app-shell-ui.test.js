const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let brandModule;
let artworkModule;
let homeModule;
let coursesModule;
let sharedModule;
let notaraModule;
let recordingModule;
let processingModule;
let sourceTabsModule;
let journeyModule;
let appShellModule;
let ambientHeaderModule;
let inlineTutorModule;
let moduleLoadError;

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTestAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith('@/')
    ? path.join(__dirname, '..', 'build', request.slice(2))
    : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

try {
  brandModule = require('../build/app/components/brand/BrandPrimitives.js');
  artworkModule = require('../build/app/components/brand/ProductArtwork.js');
  homeModule = require('../build/app/components/workspace/HomeWorkspace.js');
  coursesModule = require('../build/app/components/workspace/CoursesWorkspace.js');
  sharedModule = require('../build/app/components/workspace/SharedWorkspace.js');
  notaraModule = require('../build/app/components/workspace/NotaraWorkspace.js');
  recordingModule = require('../build/app/components/capture/RecordingPanel.js');
  processingModule = require('../build/app/components/capture/ProcessingView.js');
  sourceTabsModule = require('../build/app/components/capture/CaptureSourceTabs.js');
  journeyModule = require('../build/app/components/capture/CaptureJourney.js');
  appShellModule = require('../build/app/components/shell/AppShell.js');
  ambientHeaderModule = require('../build/app/components/workspace/WorkspaceAmbientHeader.js');
  inlineTutorModule = require('../build/app/components/study-guide/InlineMaterialTutor.js');
} catch (error) {
  moduleLoadError = error;
} finally {
  Module._resolveFilename = originalResolveFilename;
}

const noop = () => {};
const folder = {
  id: 'course-1',
  name: 'Machine Learning',
  color: '#4661d8',
  icon: 'ML',
  created_at: '2026-08-01T09:00:00.000Z',
};
const summary = {
  id: 'summary-1',
  folder_id: folder.id,
  title: 'Gradient Descent',
  file_name: 'gradient-descent.wav',
  duration_sec: 1200,
  transcript: 'Materi menjelaskan arah pembaruan parameter.',
  summary: 'Gradient descent memperbarui parameter untuk mengurangi kesalahan.',
  word_count: 420,
  created_at: '2026-08-10T09:00:00.000Z',
  is_public: false,
  public_slug: null,
};

test('central visual hooks render truthful Nalira output', () => {
  assert.ifError(moduleLoadError);

  const requiredExports = [
    [brandModule, 'BrandMark'],
    [brandModule, 'BrandWordmark'],
    [brandModule, 'BrandLockup'],
    [artworkModule, 'RecordingVisual'],
    [artworkModule, 'ProcessingVisual'],
    [artworkModule, 'EmptyStateArtwork'],
    [artworkModule, 'AmbientArtwork'],
  ];

  for (const [module, exportName] of requiredExports) {
    assert.equal(typeof module[exportName], 'function', `${exportName} must be a renderable component`);
  }

  const wordmark = renderToStaticMarkup(React.createElement(brandModule.BrandWordmark));
  assert.match(wordmark, />nalira</);
  assert.doesNotMatch(wordmark, />Notara</i);

  const mark = renderToStaticMarkup(React.createElement(brandModule.BrandMark));
  assert.match(mark, /data-nl-identity="mark"/);
  assert.match(mark, /nalira-mark-standard\.svg/);
  assert.match(mark, /nalira-mark-reversed-indigo\.svg/);
  assert.doesNotMatch(mark, /data-brand-placeholder/);

  const ambient = renderToStaticMarkup(React.createElement(artworkModule.AmbientArtwork, {
    daypart: 'pagi',
    state: 'continuation',
  }));
  assert.match(ambient, /data-state="continuation"/);
  assert.match(ambient, /data-phase="final"/);
  assert.match(ambient, /nalira-home-outward-bloom-continuation\.svg/);

  const processing = renderToStaticMarkup(
    React.createElement(artworkModule.ProcessingVisual, { state: 'processing' }),
  );
  assert.match(processing, /data-state="processing"/);
  assert.doesNotMatch(processing, /notara-brand-mark--animated/);
  assert.doesNotMatch(processing, /\d+%/);
});

test('compact ambient header exposes semantic route variants and display states', () => {
  assert.ifError(moduleLoadError);

  const scenarios = [
    ['courses', 'default', 'Ruang mata kuliah'],
    ['shared', 'inbound', 'Dua arah berbagi pengetahuan'],
    ['capture', 'upload', 'Tambahkan materi baru'],
    ['ask', 'default', 'Pemandu belajar lintas materi'],
  ];

  for (const [variant, state, title] of scenarios) {
    const output = renderToStaticMarkup(
      React.createElement(ambientHeaderModule.WorkspaceAmbientHeader, {
        variant,
        state,
        title,
        description: 'Konteks halaman tetap jelas dan dapat digunakan.',
        meta: React.createElement('span', null, 'Metadata nyata'),
      }),
    );

    assert.match(output, /<header/);
    assert.match(output, new RegExp(`data-ambient-variant="${variant}"`));
    assert.match(output, new RegExp(`data-ambient-state="${state}"`));
    assert.match(output, /data-has-actions="false"/);
    assert.match(output, new RegExp(`aria-describedby="workspace-ambient-description-${variant}"`));
    assert.match(output, new RegExp(`id="workspace-ambient-description-${variant}"`));
    assert.match(output, new RegExp(`<h1[^>]*>${title}<\\/h1>`));
    assert.match(output, /aria-hidden="true"/);
  }
});

test('operational workspaces use customer language instead of implementation jargon', () => {
  assert.ifError(moduleLoadError);

  const home = renderToStaticMarkup(React.createElement(homeModule.HomeWorkspace, {
    userName: 'Henry',
    folders: [folder],
    summaries: [summary],
    onUpload: noop,
    onRecord: noop,
    onOpenSummary: noop,
    onOpenCourses: noop,
    onOpenNotara: noop,
  }));
  const courses = renderToStaticMarkup(React.createElement(coursesModule.CoursesWorkspace, {
    folders: [folder],
    summaries: [summary],
    activeFolderId: folder.id,
    onCreateCourse: noop,
    onSelectCourse: noop,
    onOpenSummary: noop,
  }));
  const shared = renderToStaticMarkup(React.createElement(sharedModule.SharedWorkspace, {
    summaries: [],
    onOpenSummary: noop,
    onCopyLink: noop,
    onDisableLink: noop,
  }));
  const visibleCopy = `${home} ${courses} ${shared}`;

  assert.doesNotMatch(visibleCopy, /fallback|contract|foundation visual|adapter existing/i);
  assert.doesNotMatch(visibleCopy, /Learning landscape/i);
  assert.match(visibleCopy, /Nalira/);
});

test('canonical Nalira identity and Home ambient assets are installed', () => {
  const publicRoot = path.join(__dirname, '..', 'public');
  const assets = [
    'favicon.svg',
    'assets/nalira/brand/nalira-mark-standard.svg',
    'assets/nalira/brand/nalira-mark-reversed-indigo.svg',
    'assets/nalira/ambient/nalira-home-outward-bloom-master.svg',
    'assets/nalira/ambient/nalira-home-outward-bloom-multiple.svg',
    'assets/nalira/ambient/nalira-home-outward-bloom-continuation.svg',
    'assets/nalira/ambient/nalira-home-outward-bloom-empty.svg',
  ];

  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(publicRoot, asset)), true, `${asset} must exist`);
  }

  const layout = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
  const studyCanvas = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'components', 'workspace', 'StudyCanvasBoundary.tsx'),
    'utf8',
  );
  assert.match(layout, /data-atmosphere="luminous"/);
  assert.match(layout, /data-motion="calm"/);
  assert.match(studyCanvas, /data-nl-atmosphere="quiet"/);
  assert.match(studyCanvas, /data-nl-surface="reading"/);

  const visualSystem = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'styles', 'nalira-visual-system.css'),
    'utf8',
  );
  assert.match(visualSystem, /data-phase="live"/);
  assert.match(visualSystem, /@keyframes nl-home-bloom-arrive/);
  assert.match(visualSystem, /data-motion="reduced"[^}]*\.notara-home-ambient-scene/s);
});

test('Home gives one primary daily action while keeping capture within reach', () => {
  assert.ifError(moduleLoadError);

  const returningHome = renderToStaticMarkup(React.createElement(homeModule.HomeWorkspace, {
    userName: 'Henry',
    folders: [folder],
    summaries: [summary],
    onUpload: noop,
    onRecord: noop,
    onOpenSummary: noop,
    onOpenCourses: noop,
    onOpenNotara: noop,
  }));
  const emptyHome = renderToStaticMarkup(React.createElement(homeModule.HomeWorkspace, {
    userName: 'Henry',
    folders: [],
    summaries: [],
    onUpload: noop,
    onRecord: noop,
    onOpenSummary: noop,
    onOpenCourses: noop,
    onOpenNotara: noop,
  }));

  assert.match(returningHome, /data-home-primary="continue"/);
  assert.match(returningHome, /Buka Study Canvas/);
  assert.match(returningHome, /Materi terakhirmu siap dibuka kembali di Study Canvas/);
  assert.doesNotMatch(returningHome, /bagian terakhir|materi aktif/);
  assert.match(returningHome, /Rekam kuliah/);
  assert.match(returningHome, /Upload file/);
  assert.match(emptyHome, /data-home-primary="capture"/);
  assert.match(emptyHome, /Mulai rekam/);
});

test('operational routes consume compact ambient headers without losing their controls', () => {
  assert.ifError(moduleLoadError);

  const courses = renderToStaticMarkup(
    React.createElement(coursesModule.CoursesWorkspace, {
      folders: [folder],
      summaries: [summary],
      activeFolderId: folder.id,
      onCreateCourse: noop,
      onSelectCourse: noop,
      onOpenSummary: noop,
    }),
  );
  const shared = renderToStaticMarkup(
    React.createElement(sharedModule.SharedWorkspace, {
      summaries: [],
      onOpenSummary: noop,
      onCopyLink: noop,
      onDisableLink: noop,
    }),
  );
  const ask = renderToStaticMarkup(
    React.createElement(notaraModule.NotaraWorkspace, {
      folders: [folder],
      summaries: [summary],
      messages: [],
      threads: [],
      activeThreadId: null,
      input: '',
      isSending: false,
      showHistory: false,
      onInputChange: noop,
      onSend: noop,
      onCreateThread: noop,
      onToggleHistory: noop,
      onSelectThread: noop,
      onDeleteThread: noop,
      onOpenSummary: noop,
      renderMessage: (content) => content,
    }),
  );

  assert.match(courses, /data-ambient-variant="courses"/);
  assert.match(courses, /Mata kuliah baru/);
  assert.match(shared, /data-ambient-variant="shared"/);
  assert.match(shared, /role="tablist"/);
  assert.equal((shared.match(/role="tab"/g) || []).length, 3);
  assert.match(ask, /data-ambient-variant="ask"/);
  assert.match(ask, /Obrolan baru/);
  assert.match(ask, /Riwayat/);
});

test('theme control exposes a direct, accessible choice for every appearance mode', () => {
  const themeSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'components', 'theme', 'ThemeSwitcher.tsx'),
    'utf8',
  );
  const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

  assert.match(themeSource, /aria-haspopup="listbox"/);
  assert.match(themeSource, /role="listbox"/);
  assert.match(themeSource, /role="option"/);
  assert.match(themeSource, /Ikuti perangkat/);
  assert.match(themeSource, /Latar terang/);
  assert.match(themeSource, /Latar gelap/);
  assert.match(stylesheet, /\.notara-theme-menu\s*\{/);
  assert.match(stylesheet, /\.notara-theme-option\[aria-selected="true"\]/);
  assert.match(stylesheet, /\.notara-brand-mark \.notara-brand-asset--light/);
  assert.match(stylesheet, /\[data-theme="dark"\] \.notara-brand-mark \.notara-brand-asset--dark/);
});

test('Tanya Materi makes the streaming thinking state visible and truthful', () => {
  assert.ifError(moduleLoadError);

  const thinking = renderToStaticMarkup(
    React.createElement(notaraModule.NotaraWorkspace, {
      folders: [folder],
      summaries: [summary],
      messages: [{ id: 'message-1', thread_id: 'thread-1', role: 'assistant', content: '', created_at: '2026-08-10T09:05:00.000Z' }],
      threads: [],
      activeThreadId: 'thread-1',
      input: '',
      isSending: true,
      showHistory: false,
      onInputChange: noop,
      onSend: noop,
      onCreateThread: noop,
      onToggleHistory: noop,
      onSelectThread: noop,
      onDeleteThread: noop,
      onOpenSummary: noop,
      renderMessage: (content) => content,
    }),
  );

  assert.match(thinking, /Ruang tanya lintas materi/);
  assert.match(thinking, /Sedang menyusun/);
  assert.match(thinking, /aria-busy="true"/);
  assert.match(thinking, /notara-conversation-thinking/);
  assert.match(thinking, /Nalira sedang menyusun jawaban/);
});

test('Tanya Materi offers grounded starters, an accessible composer, and a recoverable error state', () => {
  assert.ifError(moduleLoadError);

  const empty = renderToStaticMarkup(
    React.createElement(notaraModule.NotaraWorkspace, {
      folders: [folder],
      summaries: [summary],
      messages: [],
      threads: [],
      activeThreadId: null,
      input: '',
      isSending: false,
      showHistory: false,
      onInputChange: noop,
      onSend: noop,
      onCreateThread: noop,
      onToggleHistory: noop,
      onSelectThread: noop,
      onDeleteThread: noop,
      onOpenSummary: noop,
      renderMessage: (content) => content,
    }),
  );

  assert.match(empty, /notara-conversation-starters/);
  assert.match(empty, /Apa hubungan konsep utama/);
  assert.match(empty, /aria-label="Pertanyaan untuk Nalira"/);
  assert.match(empty, /aria-describedby="notara-global-chat-hint"/);
  assert.match(empty, /id="notara-global-chat-hint"/);

  const error = renderToStaticMarkup(
    React.createElement(notaraModule.NotaraWorkspace, {
      folders: [folder],
      summaries: [summary],
      messages: [
        { id: 'message-user', thread_id: 'thread-1', role: 'user', content: 'Jelaskan gradient descent.', created_at: '2026-08-10T09:04:00.000Z' },
        { id: 'message-error', thread_id: 'thread-1', role: 'assistant', content: '❌ Terjadi kesalahan: provider tidak merespons.', created_at: '2026-08-10T09:05:00.000Z' },
      ],
      threads: [],
      activeThreadId: 'thread-1',
      input: '',
      isSending: false,
      showHistory: false,
      onInputChange: noop,
      onSend: noop,
      onCreateThread: noop,
      onToggleHistory: noop,
      onSelectThread: noop,
      onDeleteThread: noop,
      onOpenSummary: noop,
      renderMessage: (content) => content,
    }),
  );

  assert.match(error, /data-state="error"/);
  assert.match(error, /Jawaban belum tersedia/);
  assert.match(error, /Muat ulang pertanyaan/);
  assert.doesNotMatch(error, /❌ Terjadi kesalahan/);
});

test('Study Canvas Tutor keeps material scope visible and recovers inline errors without auto-send', () => {
  assert.ifError(moduleLoadError);

  const renderTutor = (props = {}) => renderToStaticMarkup(
    React.createElement(inlineTutorModule.InlineMaterialTutor, {
      materialTitle: 'Gradient Descent',
      messages: [],
      threads: [],
      activeThreadId: null,
      input: '',
      isSending: false,
      isListening: false,
      voiceNotSupported: false,
      showHistory: false,
      textareaRef: { current: null },
      onInputChange: noop,
      onSend: noop,
      onToggleMic: noop,
      onToggleHistory: noop,
      onNewThread: noop,
      onSelectThread: noop,
      onDeleteThread: noop,
      onClear: noop,
      renderMessage: (content) => content,
      formatThreadAge: (createdAt) => createdAt,
      ...props,
    }),
  );

  const ready = renderTutor();
  assert.match(ready, /Tanya Materi/);
  assert.doesNotMatch(ready, /Tanya Nalira/);
  assert.match(ready, /Materi aktif · Gradient Descent/);
  assert.match(ready, /Siap menjawab/);
  assert.match(ready, /data-chat-state="ready"/);

  const thinking = renderTutor({
    isSending: true,
    messages: [{ id: 'assistant-pending', thread_id: 'thread-1', role: 'assistant', content: '', created_at: '2026-08-10T09:05:00.000Z' }],
  });
  assert.match(thinking, /Meninjau materi/);
  assert.match(thinking, /aria-busy="true"/);
  assert.match(thinking, /Nalira sedang menyusun jawaban/);

  const error = renderTutor({
    messages: [
      { id: 'user-1', thread_id: 'thread-1', role: 'user', content: 'Jelaskan gradient descent.', created_at: '2026-08-10T09:04:00.000Z' },
      { id: 'assistant-error', thread_id: 'thread-1', role: 'assistant', content: '❌ Provider tidak merespons.', created_at: '2026-08-10T09:05:00.000Z' },
    ],
  });
  assert.match(error, /data-state="error"/);
  assert.match(error, /Jawaban belum tersedia/);
  assert.match(error, /Muat ulang pertanyaan/);
  assert.doesNotMatch(error, /❌ Provider tidak merespons/);
});

test('material tutor keeps Markdown readable across themes and narrow widths', () => {
  const tutor = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'study-guide', 'InlineMaterialTutor.tsx'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'), 'utf8');
  const markdown = dashboard.slice(dashboard.indexOf('const renderMarkdown'), dashboard.indexOf('const openWorkspace'));

  assert.match(tutor, /className="notara-inline-tutor-message"/);
  assert.match(stylesheet, /\.notara-inline-tutor-thread article > div \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word/s);
  assert.match(stylesheet, /\.notara-inline-tutor-message pre \{[^}]*overflow-x: auto;[^}]*white-space: pre-wrap/s);
  assert.match(markdown, /text-\[var\(--text-primary\)\]/);
  assert.match(markdown, /text-\[var\(--text-secondary\)\]/);
  assert.doesNotMatch(markdown, /text-white|text-zinc-200|text-violet-300/);
});

test('workspace routes keep dense controls usable on narrow screens', () => {
  const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

  assert.match(stylesheet, /\.notara-filter-tabs \{ display: flex; width: 100%; max-width: 100%; overflow-x: auto; \}/);
  assert.match(stylesheet, /\.notara-scope-foundation > button \{ flex: 1 1 calc\(50% - 8px\); \}/);
  assert.match(stylesheet, /\.notara-scope-foundation \{[^}]*border: 1px solid var\(--border-subtle\);[^}]*background: var\(--surface-tool\);/s);
  assert.match(stylesheet, /\.notara-conversation-message-body \{[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word;/s);
  assert.match(stylesheet, /\.notara-conversation-message-body pre \{[^}]*overflow-x: auto;[^}]*white-space: pre-wrap/s);
  assert.match(stylesheet, /\.notara-central-composer textarea::placeholder \{[^}]*color: var\(--text-tertiary\);/s);
  assert.match(stylesheet, /prefers-reduced-motion: reduce[\s\S]*notara-conversation-status\[data-thinking="true"\] > span/);
  assert.match(stylesheet, /\.notara-conversation-starters \{ grid-template-columns: 1fr; \}/);
  assert.match(stylesheet, /\.notara-central-composer > button \{ right: 16px; top: 22px; \}/);
});

test('mobile navigation makes the background workspace unavailable to assistive technology', () => {
  assert.ifError(moduleLoadError);

  const workspace = renderToStaticMarkup(
    React.createElement(appShellModule.AppShellWorkspace, {
      sidebarExpanded: false,
      mobileNavigationOpen: true,
    }, React.createElement('main', null, 'Materi')),
  );

  assert.match(workspace, /aria-hidden="true"/);
  assert.match(workspace, /inert=""/);
});

test('blocking product dialogs make the whole app shell unavailable to assistive technology', () => {
  assert.ifError(moduleLoadError);

  const shell = renderToStaticMarkup(
    React.createElement(appShellModule.AppShellRoot, {
      blocked: true,
    }, React.createElement('main', null, 'Ruang belajar')),
  );

  assert.match(shell, /aria-hidden="true"/);
  assert.match(shell, /inert=""/);
});

test('sidebar toggle names the action and exposes the controlled navigation state', () => {
  assert.ifError(moduleLoadError);

  const collapsed = renderToStaticMarkup(
    React.createElement(appShellModule.SidebarToggle, {
      expanded: false,
      onToggle: noop,
    }),
  );
  const expanded = renderToStaticMarkup(
    React.createElement(appShellModule.SidebarToggle, {
      expanded: true,
      onToggle: noop,
    }),
  );
  const mobileClose = renderToStaticMarkup(
    React.createElement(appShellModule.SidebarToggle, {
      expanded: true,
      label: 'Tutup navigasi',
      onToggle: noop,
    }),
  );

  assert.match(collapsed, /aria-label="Buka sidebar"/);
  assert.match(collapsed, /aria-controls="notara-navigation"/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(expanded, /aria-label="Ciutkan sidebar"/);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(mobileClose, /aria-label="Tutup navigasi"/);
  assert.match(mobileClose, /title="Tutup navigasi"/);
});

test('capture workspace maps source mode into the compact ambient header without hiding limits', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'),
    'utf8',
  );

  assert.match(dashboardSource, /import \{ WorkspaceAmbientHeader \}/);
  assert.match(dashboardSource, /variant="capture"/);
  assert.match(dashboardSource, /state=\{isRecordingMode \? 'record' : 'upload'\}/);
  assert.match(dashboardSource, /Maks\. 3/);
  assert.match(dashboardSource, /150 MB/);
  assert.match(dashboardSource, /Tanpa audio/);
});

test('compact ambient headers define responsive route motion with a reduced-motion fallback', () => {
  const stylesheet = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'globals.css'),
    'utf8',
  );

  assert.match(stylesheet, /\.notara-workspace-ambient\s*\{/);
  assert.match(stylesheet, /min-height:\s*160px/);
  for (const variant of ['courses', 'shared', 'capture', 'ask']) {
    assert.match(stylesheet, new RegExp(`data-ambient-variant="${variant}"`));
  }
  assert.match(stylesheet, /@keyframes notara-ambient-course-signal/);
  assert.match(stylesheet, /@keyframes notara-ambient-share-in/);
  assert.match(stylesheet, /@keyframes notara-ambient-capture-wave/);
  assert.match(stylesheet, /@keyframes notara-ambient-ask-converge/);
  assert.match(stylesheet, /@media \(max-width: 760px\)/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(stylesheet, /\.notara-workspace-ambient__scene[^}]*animation:\s*none/s);
  assert.match(stylesheet, /data-ambient-state="record"/);
  assert.match(stylesheet, /notara-ambient-record-pulse/);
});

test('capture surfaces consume centralized visuals and accessible source tabs', () => {
  assert.ifError(moduleLoadError);

  const recording = renderToStaticMarkup(React.createElement(recordingModule.RecordingPanel, {
    canvasRef: { current: null },
    isRecording: false,
    isPaused: false,
    audioBlob: null,
    audioUrl: null,
    sourceCheckAudioUrl: 'blob:test-source-preview',
    formattedDuration: '00:00',
    recordingSource: 'microphone',
    sourceCheckStatus: 'idle',
    sourceCheckRemainingSeconds: null,
    sourceError: null,
    onRecordingSourceChange: noop,
    onTestSource: noop,
    onStart: noop,
    onPause: noop,
    onResume: noop,
    onStop: noop,
    onDownload: noop,
    onReset: noop,
    onClearSourceCheckPreview: noop,
  }));
  const processing = renderToStaticMarkup(React.createElement(processingModule.ProcessingView, {
    thinkingElapsed: 4,
    isChunkProcessing: false,
    chunkProgress: '',
    statusMessage: 'Menyiapkan transkrip',
    chunkCurrent: 0,
    chunkCompleted: 0,
    chunkTotal: 0,
    thinkingLog: [],
    showThinkingPanel: false,
    onToggleThinkingPanel: noop,
  }));
  const tabs = renderToStaticMarkup(React.createElement(sourceTabsModule.CaptureSourceTabs, {
    isRecordingMode: false,
    onSelectUpload: noop,
    onSelectRecording: noop,
  }));
  const journey = renderToStaticMarkup(React.createElement(journeyModule.CaptureJourney, {
    isRecordingMode: true,
    isRecording: true,
    hasInput: false,
  }));

  assert.match(recording, /notara-recording-visual/);
  assert.match(recording, /Pilih yang ingin didengar Nalira/);
  assert.match(recording, /Mikrofon kelas/);
  assert.match(recording, /Tab Zoom \/ Meet/);
  assert.match(recording, /Tes 10 detik/);
  assert.match(recording, /Preview tes sumber/);
  assert.match(recording, /tidak dikirim ke Nalira/);
  assert.match(recording, /aria-label="Hapus preview tes sumber"/);
  assert.equal((recording.match(/type="radio"/g) || []).length, 2);

  const readyRecording = renderToStaticMarkup(React.createElement(recordingModule.RecordingPanel, {
    canvasRef: { current: null },
    isRecording: false,
    isPaused: false,
    audioBlob: null,
    audioUrl: null,
    sourceCheckAudioUrl: 'blob:test-source-preview',
    formattedDuration: '00:00',
    recordingSource: 'microphone',
    sourceCheckStatus: 'ready',
    sourceCheckRemainingSeconds: null,
    sourceError: null,
    onRecordingSourceChange: noop,
    onTestSource: noop,
    onStart: noop,
    onPause: noop,
    onResume: noop,
    onStop: noop,
    onDownload: noop,
    onReset: noop,
    onClearSourceCheckPreview: noop,
  }));
  assert.match(readyRecording, /preview 10 detik bisa diputar ulang di bawah/);
  assert.match(tabs, /id="capture-upload-tab"/);
  assert.match(tabs, /id="capture-recording-tab"/);
  assert.match(journey, /Rekaman sedang berlangsung/);

  const requestingRecording = renderToStaticMarkup(React.createElement(recordingModule.RecordingPanel, {
    canvasRef: { current: null },
    isRecording: false,
    isPaused: false,
    audioBlob: null,
    audioUrl: null,
    sourceCheckAudioUrl: null,
    formattedDuration: '00:00',
    recordingSource: 'microphone',
    sourceCheckStatus: 'requesting',
    sourceCheckRemainingSeconds: null,
    sourceError: null,
    onRecordingSourceChange: noop,
    onTestSource: noop,
    onStart: noop,
    onPause: noop,
    onResume: noop,
    onStop: noop,
    onDownload: noop,
    onReset: noop,
    onClearSourceCheckPreview: noop,
  }));
  assert.match(requestingRecording, /Menunggu izin mikrofon dari Chrome/);
  assert.match(requestingRecording, /Menunggu izin/);
  assert.match(requestingRecording, /disabled=""/);
  assert.match(requestingRecording, /disabled:cursor-wait/);
  assert.match(processing, /notara-processing-visual/);
  assert.match(processing, /Tahap pemrosesan materi/);
  assert.equal((processing.match(/Menyiapkan audio|Mentranskrip sumber|Menyusun rangkuman/g) || []).length, 3);
  assert.match(tabs, /role="tablist"/);
  assert.equal((tabs.match(/role="tab"/g) || []).length, 2);
  assert.equal((tabs.match(/type="button"/g) || []).length, 2);
  assert.match(journey, /Langkah menambahkan materi/);
  assert.match(journey, /Rekam suara/);
  assert.match(journey, /data-state="complete"/);
  assert.doesNotMatch(journey, />✓<\/span>/);
  assert.equal((journey.match(/notara-capture-journey__marker/g) || []).length, 3);
});
