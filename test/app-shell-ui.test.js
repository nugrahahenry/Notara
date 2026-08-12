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
let appShellModule;
let ambientHeaderModule;
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
  appShellModule = require('../build/app/components/shell/AppShell.js');
  ambientHeaderModule = require('../build/app/components/workspace/WorkspaceAmbientHeader.js');
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

  const processing = renderToStaticMarkup(
    React.createElement(artworkModule.ProcessingVisual, { state: 'processing' }),
  );
  assert.match(processing, /data-state="processing"/);
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
});

test('capture surfaces consume centralized visuals and accessible source tabs', () => {
  assert.ifError(moduleLoadError);

  const recording = renderToStaticMarkup(React.createElement(recordingModule.RecordingPanel, {
    canvasRef: { current: null },
    isRecording: false,
    isPaused: false,
    audioBlob: null,
    audioUrl: null,
    formattedDuration: '00:00',
    onStart: noop,
    onPause: noop,
    onResume: noop,
    onStop: noop,
    onDownload: noop,
    onReset: noop,
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

  assert.match(recording, /notara-recording-visual/);
  assert.match(processing, /notara-processing-visual/);
  assert.match(tabs, /role="tablist"/);
  assert.equal((tabs.match(/role="tab"/g) || []).length, 2);
  assert.equal((tabs.match(/type="button"/g) || []).length, 2);
});
