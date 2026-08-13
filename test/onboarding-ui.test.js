const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { OnboardingModal } = require('../build/app/components/ui/OnboardingModal.js');

test('onboarding opens as a named three-step dialog without fake AI processing', () => {
  const output = renderToStaticMarkup(
    React.createElement(OnboardingModal, {
      userName: 'Henry Nugraha',
      onComplete: () => {},
    }),
  );

  assert.match(output, /role="dialog"/);
  assert.match(output, /aria-modal="true"/);
  assert.match(output, /Siapkan ruang belajar Henry/);
  assert.match(output, /Langkah 1 dari 3/);
  assert.doesNotMatch(output, /AI syncing|Mengkalibrasi|Memetakan pola belajar/i);
});

test('onboarding role choices are real named controls', () => {
  const output = renderToStaticMarkup(
    React.createElement(OnboardingModal, {
      userName: 'Henry',
      onComplete: () => {},
    }),
  );

  assert.match(output, /<button[^>]*>[^<]*<[^>]*aria-hidden="true"[^>]*>.*Mahasiswa/s);
  assert.match(output, /Lewati personalisasi/);
});

test('finishing onboarding returns to the workspace without auto-launching a guided tour', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'dashboard', 'page.tsx'),
    'utf8',
  );

  assert.doesNotMatch(dashboardSource, /setShowDashboardTour\(true\)/);
  assert.doesNotMatch(dashboardSource, /<DashboardTour/);
});
