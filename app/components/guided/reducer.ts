import { buildGuidedRoute } from './route-builder';
import { compareDraftReducer, createCompareDraft } from './compare/compare-state';
import type {
  GuidedCheckReflection,
  GuidedFoundationEvent,
  GuidedFoundationState,
  GuidedReflectionChoice,
} from './types';

export const EMPTY_GUIDED_CHECK: GuidedCheckReflection = {
  canExplainCore: null,
  canGiveExample: null,
  remainingQuestion: '',
};

export function createGuidedFoundationState(materialId: string): GuidedFoundationState {
  return {
    materialId,
    stage: 'review',
    objective: null,
    route: null,
    activeNodeIndex: 0,
    responsesByNode: {},
    check: { ...EMPTY_GUIDED_CHECK },
    compare: createCompareDraft(materialId),
  };
}

function isReflectionChoice(value: unknown): value is GuidedReflectionChoice {
  return value === 'yes' || value === 'partly' || value === 'not-yet';
}

export function guidedFoundationReducer(
  state: GuidedFoundationState,
  event: GuidedFoundationEvent,
): GuidedFoundationState {
  switch (event.type) {
    case 'OPEN_OBJECTIVE':
      return state.stage === 'review' ? { ...state, stage: 'objective' } : state;

    case 'SET_OBJECTIVE':
      return {
        ...state,
        objective: event.objective,
        route: null,
        activeNodeIndex: 0,
        responsesByNode: {},
        check: { ...EMPTY_GUIDED_CHECK },
        compare: createCompareDraft(state.materialId, state.compare.sourceSignature),
      };

    case 'OPEN_ROUTE': {
      if (!state.objective) return state;
      const route = buildGuidedRoute(state.materialId, state.objective);
      return route ? { ...state, route, stage: 'route', activeNodeIndex: 0 } : state;
    }

    case 'START_SESSION':
      return state.route ? { ...state, stage: 'session', activeNodeIndex: 0 } : state;

    case 'BACK':
      if (state.stage === 'session') return { ...state, stage: 'route' };
      if (state.stage === 'route') return { ...state, stage: 'objective', route: null, activeNodeIndex: 0 };
      if (state.stage === 'objective') return createGuidedFoundationState(state.materialId);
      return state;

    case 'EXIT':
    case 'SOURCE_UNAVAILABLE':
      return createGuidedFoundationState(state.materialId);

    case 'RESET_SOURCE':
      return createGuidedFoundationState(event.materialId);

    case 'GO_TO_NODE':
      if (!state.route) return state;
      return {
        ...state,
        activeNodeIndex: Math.max(0, Math.min(state.route.nodes.length - 1, event.index)),
      };

    case 'SOURCE_SIGNATURE_CHANGED':
    case 'SELECT_COMPARE_BLOCK':
    case 'CLEAR_COMPARE_BLOCK':
    case 'SET_COMPARE_NOTE':
    case 'CONFIRM_COMPARE_SOURCE_REPLACEMENT':
    case 'RESET_COMPARE':
      return {
        ...state,
        compare: compareDraftReducer(state.compare, event),
      };

    case 'SET_NODE_RESPONSE':
      return {
        ...state,
        responsesByNode: {
          ...state.responsesByNode,
          [event.node]: event.response,
        },
      };

    case 'SET_CHECK_REFLECTION': {
      if (event.field === 'remainingQuestion') {
        return {
          ...state,
          check: {
            ...state.check,
            remainingQuestion: typeof event.value === 'string' ? event.value : '',
          },
        };
      }
      return {
        ...state,
        check: {
          ...state.check,
          [event.field]: isReflectionChoice(event.value) ? event.value : null,
        },
      };
    }

    default:
      return state;
  }
}

