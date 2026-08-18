const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveGuidedAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith('@/')
    ? path.join(__dirname, '..', 'build', request.slice(2))
    : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

let eligibility;
let objective;
let routeBuilder;
let reducer;
let types;
let moduleLoadError;
try {
  eligibility = require('../build/app/components/guided/eligibility.js');
  objective = require('../build/app/components/guided/objective.js');
  routeBuilder = require('../build/app/components/guided/route-builder.js');
  reducer = require('../build/app/components/guided/reducer.js');
  types = require('../build/app/components/guided/types.js');
} catch (error) {
  moduleLoadError = error;
} finally {
  Module._resolveFilename = originalResolveFilename;
}

function material(overrides = {}) {
  return {
    id: 'summary-owned',
    folder_id: 'course-1',
    title: 'Teori Permintaan',
    file_name: 'kuliah.mp3',
    duration_sec: 900,
    transcript: 'Transkrip lengkap tentang teori permintaan.',
    summary: 'Rangkuman lengkap tentang teori permintaan.',
    word_count: 700,
    created_at: '2026-08-15T00:00:00.000Z',
    is_public: false,
    public_slug: null,
    user_id: 'viewer-1',
    ...overrides,
  };
}

test('Guided pure modules load without a service runtime', () => {
  assert.ifError(moduleLoadError);
  assert.equal(types.GUIDED_ROUTE_NODE_COUNT, 5);
  assert.equal(types.GUIDED_CUSTOM_OBJECTIVE_MAX_LENGTH, 240);
});

test('eligibility allows an owned durable complete material', () => {
  assert.deepEqual(eligibility.resolveGuidedEligibility(material(), 'viewer-1'), {
    status: 'eligible-owned',
    materialId: 'summary-owned',
  });
});

test('eligibility requires fork for a non-owner shared or public row', () => {
  assert.deepEqual(
    eligibility.resolveGuidedEligibility(material({ user_id: 'other-user', is_public: true }), 'viewer-1'),
    { status: 'fork-required', reason: 'shared-or-public-non-owner' },
  );
});

test('eligibility denies unknown ownership instead of inferring from origin or public state', () => {
  assert.equal(eligibility.resolveGuidedEligibility(material({ user_id: undefined }), 'viewer-1').status, 'unknown-denied');
  assert.equal(eligibility.resolveGuidedEligibility(material(), null).status, 'unknown-denied');
});

test('eligibility denies local, incomplete, and unavailable materials', () => {
  assert.equal(eligibility.resolveGuidedEligibility(material({ id: 'local-1' }), 'viewer-1').status, 'ineligible-local');
  assert.equal(eligibility.resolveGuidedEligibility(material({ transcript: '' }), 'viewer-1').status, 'ineligible-incomplete');
  assert.equal(eligibility.resolveGuidedEligibility(material({ summary: '   ' }), 'viewer-1').status, 'ineligible-incomplete');
  assert.equal(eligibility.resolveGuidedEligibility(null, 'viewer-1').status, 'unavailable');
});

test('a fork becomes eligible only after it is represented as an owned durable row', () => {
  const source = material({ id: 'public-source', user_id: 'other-user', is_public: true });
  const fork = material({ id: 'owned-copy', user_id: 'viewer-1', folder_id: null });
  assert.equal(eligibility.resolveGuidedEligibility(source, 'viewer-1').status, 'fork-required');
  assert.equal(eligibility.resolveGuidedEligibility(fork, 'viewer-1').status, 'eligible-owned');
});

test('custom objective normalization trims whitespace and enforces 240 characters', () => {
  assert.equal(objective.normalizeCustomObjective('  Jelaskan   elastisitas  '), 'Jelaskan elastisitas');
  assert.equal(objective.normalizeCustomObjective('a'.repeat(300)).length, 240);
  assert.equal(objective.normalizeGuidedObjective({ kind: 'custom', text: '   ' }), null);
});

test('all five objectives build the same unique five-node sequence deterministically', () => {
  const objectives = [
    { kind: 'understand-core' },
    { kind: 'compare-concepts' },
    { kind: 'prepare-quiz' },
    { kind: 'review-material' },
    { kind: 'custom', text: 'Memahami perbedaan permintaan dan jumlah yang diminta' },
  ];
  for (const item of objectives) {
    const first = routeBuilder.buildGuidedRoute('summary-owned', item);
    const second = routeBuilder.buildGuidedRoute('summary-owned', item);
    assert.deepEqual(first, second);
    assert.equal(first.nodes.length, 5);
    assert.deepEqual(first.nodes.map((node) => node.id), ['orient', 'focus', 'connect', 'recall', 'check']);
    assert.equal(new Set(first.nodes.map((node) => node.id)).size, 5);
    assert.equal(first.builderVersion, 'deterministic-v1');
  }
});

test('invalid custom objective cannot create a route', () => {
  assert.equal(routeBuilder.buildGuidedRoute('summary-owned', { kind: 'custom', text: '   ' }), null);
});

test('route nodes carry source surfaces without scores or mastery fields', () => {
  const route = routeBuilder.buildGuidedRoute('summary-owned', { kind: 'understand-core' });
  assert.deepEqual(route.nodes.map((node) => node.sourceSurface), [
    'summary', 'summary', 'transcript', 'reflection', 'reflection',
  ]);
  const serialized = JSON.stringify(route);
  assert.doesNotMatch(serialized, /score|mastery|progress|percentage|confidence/i);
});

test('reducer follows review, objective, route, and session transitions', () => {
  let state = reducer.createGuidedFoundationState('summary-owned');
  state = reducer.guidedFoundationReducer(state, { type: 'OPEN_OBJECTIVE' });
  assert.equal(state.stage, 'objective');
  state = reducer.guidedFoundationReducer(state, { type: 'SET_OBJECTIVE', objective: { kind: 'understand-core' } });
  state = reducer.guidedFoundationReducer(state, { type: 'OPEN_ROUTE' });
  assert.equal(state.stage, 'route');
  state = reducer.guidedFoundationReducer(state, { type: 'START_SESSION' });
  assert.equal(state.stage, 'session');
  assert.equal(state.activeNodeIndex, 0);
});

test('reducer stores only transient responses and clamps node navigation', () => {
  let state = reducer.createGuidedFoundationState('summary-owned');
  state = reducer.guidedFoundationReducer(state, { type: 'SET_OBJECTIVE', objective: { kind: 'review-material' } });
  state = reducer.guidedFoundationReducer(state, { type: 'OPEN_ROUTE' });
  state = reducer.guidedFoundationReducer(state, { type: 'START_SESSION' });
  state = reducer.guidedFoundationReducer(state, { type: 'GO_TO_NODE', index: 99 });
  assert.equal(state.activeNodeIndex, 4);
  state = reducer.guidedFoundationReducer(state, { type: 'SET_NODE_RESPONSE', node: 'focus', response: 'Respons sementara' });
  state = reducer.guidedFoundationReducer(state, {
    type: 'SET_CHECK_REFLECTION', field: 'canExplainCore', value: 'partly',
  });
  assert.equal(state.responsesByNode.focus, 'Respons sementara');
  assert.equal(state.check.canExplainCore, 'partly');
});

test('exit, source reset, and source unavailable discard the Guided draft', () => {
  let state = reducer.createGuidedFoundationState('summary-owned');
  state = reducer.guidedFoundationReducer(state, { type: 'SET_OBJECTIVE', objective: { kind: 'understand-core' } });
  state = reducer.guidedFoundationReducer(state, { type: 'OPEN_ROUTE' });
  state = reducer.guidedFoundationReducer(state, { type: 'START_SESSION' });
  for (const event of [
    { type: 'EXIT' },
    { type: 'SOURCE_UNAVAILABLE' },
    { type: 'RESET_SOURCE', materialId: 'summary-next' },
  ]) {
    const next = reducer.guidedFoundationReducer(state, event);
    assert.equal(next.stage, 'review');
    assert.equal(next.objective, null);
    assert.equal(next.route, null);
    assert.deepEqual(next.responsesByNode, {});
    assert.equal(next.materialId, event.type === 'RESET_SOURCE' ? 'summary-next' : 'summary-owned');
  }
});

