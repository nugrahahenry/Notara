/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let brandModule;
let artworkModule;
let homeModule;
let coursesModule;
let sharedModule;
let recordingModule;
let processingModule;
let sourceTabsModule;
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
  recordingModule = require('../build/app/components/capture/RecordingPanel.js');
  processingModule = require('../build/app/components/capture/ProcessingView.js');
  sourceTabsModule = require('../build/app/components/capture/CaptureSourceTabs.js');
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