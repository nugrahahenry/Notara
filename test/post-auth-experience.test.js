const test = require('node:test');
const assert = require('node:assert/strict');

const { getPostAuthExperience } = require('../build/lib/auth/post-auth-experience.js');

test('restored sessions enter Home without an interrupting welcome experience', () => {
  assert.equal(getPostAuthExperience({ is_onboarded: true }), 'home');
});

test('only an explicitly unfinished profile enters onboarding', () => {
  assert.equal(getPostAuthExperience({ is_onboarded: false }), 'onboarding');
  assert.equal(getPostAuthExperience(null), 'home');
});

