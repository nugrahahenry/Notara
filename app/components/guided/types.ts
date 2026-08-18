import type { CompareDraft, CompareDraftEvent } from './compare/types';
export const GUIDED_ROUTE_NODE_COUNT = 5 as const;
export const GUIDED_CUSTOM_OBJECTIVE_MAX_LENGTH = 240 as const;

export type GuidedStage = 'review' | 'objective' | 'route' | 'session';

export type GuidedObjectiveKind =
  | 'understand-core'
  | 'compare-concepts'
  | 'prepare-quiz'
  | 'review-material'
  | 'custom';

export type GuidedSourceEligibility =
  | { status: 'eligible-owned'; materialId: string }
  | { status: 'fork-required'; reason: 'shared-or-public-non-owner' }
  | { status: 'ineligible-local'; reason: 'same-tab-non-durable' }
  | { status: 'ineligible-incomplete'; reason: 'missing-summary-or-transcript' }
  | { status: 'unavailable'; reason: 'deleted-revoked-or-missing' }
  | { status: 'unknown-denied'; reason: 'ownership-unconfirmed' };

export type GuidedObjectiveDraft =
  | { kind: Exclude<GuidedObjectiveKind, 'custom'> }
  | { kind: 'custom'; text: string };

export type GuidedRouteNodeKind = 'orient' | 'focus' | 'connect' | 'recall' | 'check';

export interface GuidedRouteNode {
  id: GuidedRouteNodeKind;
  kind: GuidedRouteNodeKind;
  title: string;
  prompt: string;
  sourceSurface: 'summary' | 'transcript' | 'reflection';
}

export interface GuidedRouteDraft {
  materialId: string;
  objective: GuidedObjectiveDraft;
  builderVersion: 'deterministic-v1';
  nodes: readonly GuidedRouteNode[];
}

export type GuidedReflectionChoice = 'yes' | 'partly' | 'not-yet';

export interface GuidedCheckReflection {
  canExplainCore: GuidedReflectionChoice | null;
  canGiveExample: GuidedReflectionChoice | null;
  remainingQuestion: string;
}

export interface GuidedFoundationState {
  materialId: string;
  stage: GuidedStage;
  objective: GuidedObjectiveDraft | null;
  route: GuidedRouteDraft | null;
  activeNodeIndex: number;
  responsesByNode: Partial<Record<GuidedRouteNodeKind, string>>;
  check: GuidedCheckReflection;
  compare: CompareDraft;
}

export type GuidedFoundationEvent =
  | CompareDraftEvent
  | { type: 'OPEN_OBJECTIVE' }
  | { type: 'SET_OBJECTIVE'; objective: GuidedObjectiveDraft }
  | { type: 'OPEN_ROUTE' }
  | { type: 'START_SESSION' }
  | { type: 'BACK' }
  | { type: 'EXIT' }
  | { type: 'RESET_SOURCE'; materialId: string }
  | { type: 'SOURCE_UNAVAILABLE' }
  | { type: 'GO_TO_NODE'; index: number }
  | { type: 'SET_NODE_RESPONSE'; node: GuidedRouteNodeKind; response: string }
  | {
      type: 'SET_CHECK_REFLECTION';
      field: keyof GuidedCheckReflection;
      value: GuidedReflectionChoice | string | null;
    };

