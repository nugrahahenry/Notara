import { createHash } from 'node:crypto';
import {
  buildContextAwareSummaryPrompt,
  MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS,
  serializeContextSummaryEvidenceSegment,
  type ContextSummaryEvidenceSegment,
} from '../transcript/context-summary-prompt';

export const HIERARCHICAL_PLAN_VERSION = 'hierarchical-summary-plan-v1';
export const HIERARCHICAL_PROMPT_VERSION = 'context-summary-hierarchical-v1';
export const MAX_HIERARCHICAL_SOURCE_CHARACTERS = 90_000;
export const MAX_HIERARCHICAL_MAP_EVIDENCE_CHARACTERS = 12_000;
export const MAX_HIERARCHICAL_PLANNED_CALLS = 24;
export const MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS = 5_000;
export const MAX_HIERARCHICAL_STAGE_OUTPUT_TOKENS = 1_024;
export const HIERARCHICAL_REDUCER_FAN_IN = 2;

export type HierarchicalPlanMode = 'single' | 'hierarchical' | 'unsupported';
export type HierarchicalStageKind = 'map' | 'reduce' | 'final';
export type HierarchicalUnsupportedReason =
  | 'evidence-empty'
  | 'evidence-too-large'
  | 'ordinal-discontinuity'
  | 'segment-too-large'
  | 'plan-too-large';

export interface HierarchicalPlanContext {
  summaryId: string;
  baseSummaryContent: string;
  activeRevisionId: string | null;
  revisionEpoch: number;
  contextAnnotationIds: number[];
  productName: string;
}

export interface HierarchicalStagePlan {
  stageIndex: number;
  kind: HierarchicalStageKind;
  level: number;
  position: number;
  ordinalStart: number | null;
  ordinalEnd: number | null;
  inputStageIndexes: number[];
}

export interface SummaryRegenerationPlan {
  mode: HierarchicalPlanMode;
  planVersion: typeof HIERARCHICAL_PLAN_VERSION;
  promptVersion: string;
  planDigest: string;
  sourceCharacters: number;
  singlePromptCharacters: number;
  plannedCalls: number;
  stages: HierarchicalStagePlan[];
  unsupportedReason: HierarchicalUnsupportedReason | null;
}

function digestPlan(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unsupportedPlan(
  context: HierarchicalPlanContext,
  sourceCharacters: number,
  singlePromptCharacters: number,
  reason: HierarchicalUnsupportedReason,
): SummaryRegenerationPlan {
  const digestInput = {
    mode: 'unsupported',
    reason,
    planVersion: HIERARCHICAL_PLAN_VERSION,
    promptVersion: HIERARCHICAL_PROMPT_VERSION,
    summaryId: context.summaryId,
    baseSummaryDigest: digestPlan(context.baseSummaryContent),
    activeRevisionId: context.activeRevisionId,
    revisionEpoch: context.revisionEpoch,
    contextAnnotationIds: [...context.contextAnnotationIds].sort((a, b) => a - b),
    sourceCharacters,
    singlePromptCharacters,
  };
  return {
    mode: 'unsupported',
    planVersion: HIERARCHICAL_PLAN_VERSION,
    promptVersion: HIERARCHICAL_PROMPT_VERSION,
    planDigest: digestPlan(digestInput),
    sourceCharacters,
    singlePromptCharacters,
    plannedCalls: 0,
    stages: [],
    unsupportedReason: reason,
  };
}

function hasContinuousOrdinals(segments: ContextSummaryEvidenceSegment[]): boolean {
  return segments.every((segment, index) => (
    index === 0 || segment.ordinal === segments[index - 1].ordinal + 1
  ));
}

function buildMapStages(
  segments: ContextSummaryEvidenceSegment[],
): HierarchicalStagePlan[] | null {
  const stages: HierarchicalStagePlan[] = [];
  let partitionStart = 0;
  let partitionCharacters = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const serializedCharacters = serializeContextSummaryEvidenceSegment(segments[index]).length + 1;
    if (serializedCharacters > MAX_HIERARCHICAL_MAP_EVIDENCE_CHARACTERS) return null;

    if (
      partitionCharacters > 0
      && partitionCharacters + serializedCharacters > MAX_HIERARCHICAL_MAP_EVIDENCE_CHARACTERS
    ) {
      stages.push({
        stageIndex: stages.length + 1,
        kind: 'map',
        level: 0,
        position: stages.length,
        ordinalStart: segments[partitionStart].ordinal,
        ordinalEnd: segments[index - 1].ordinal,
        inputStageIndexes: [],
      });
      partitionStart = index;
      partitionCharacters = 0;
    }
    partitionCharacters += serializedCharacters;
  }

  stages.push({
    stageIndex: stages.length + 1,
    kind: 'map',
    level: 0,
    position: stages.length,
    ordinalStart: segments[partitionStart].ordinal,
    ordinalEnd: segments.at(-1)?.ordinal ?? null,
    inputStageIndexes: [],
  });
  return stages;
}

function appendReductionTree(stages: HierarchicalStagePlan[]): void {
  let currentLevel = stages.map((stage) => stage.stageIndex);
  let level = 1;

  while (currentLevel.length > 1) {
    const nextLevel: number[] = [];
    for (let index = 0; index < currentLevel.length; index += HIERARCHICAL_REDUCER_FAN_IN) {
      const inputs = currentLevel.slice(index, index + HIERARCHICAL_REDUCER_FAN_IN);
      if (inputs.length === 1) {
        nextLevel.push(inputs[0]);
        continue;
      }
      const stageIndex = stages.length + 1;
      stages.push({
        stageIndex,
        kind: 'reduce',
        level,
        position: nextLevel.length,
        ordinalStart: null,
        ordinalEnd: null,
        inputStageIndexes: inputs,
      });
      nextLevel.push(stageIndex);
    }
    currentLevel = nextLevel;
    level += 1;
  }

  stages.push({
    stageIndex: stages.length + 1,
    kind: 'final',
    level,
    position: 0,
    ordinalStart: null,
    ordinalEnd: null,
    inputStageIndexes: currentLevel,
  });
}

export function createSummaryRegenerationPlan(
  segments: ContextSummaryEvidenceSegment[],
  context: HierarchicalPlanContext,
): SummaryRegenerationPlan {
  const sourceCharacters = segments.reduce((total, segment) => total + segment.text.length, 0);
  const evidenceDigest = digestPlan(
    segments.map(serializeContextSummaryEvidenceSegment).join('\n'),
  );
  const singlePromptCharacters = segments.length > 0
    ? buildContextAwareSummaryPrompt({ segments, productName: context.productName }).length
    : 0;

  if (segments.length === 0) {
    return unsupportedPlan(context, sourceCharacters, singlePromptCharacters, 'evidence-empty');
  }
  if (!hasContinuousOrdinals(segments)) {
    return unsupportedPlan(context, sourceCharacters, singlePromptCharacters, 'ordinal-discontinuity');
  }
  if (sourceCharacters > MAX_HIERARCHICAL_SOURCE_CHARACTERS) {
    return unsupportedPlan(context, sourceCharacters, singlePromptCharacters, 'evidence-too-large');
  }

  if (singlePromptCharacters <= MAX_CONTEXT_SUMMARY_PROMPT_CHARACTERS) {
    const digestInput = {
      mode: 'single',
      planVersion: HIERARCHICAL_PLAN_VERSION,
      promptVersion: 'context-summary-v1',
      summaryId: context.summaryId,
      baseSummaryDigest: digestPlan(context.baseSummaryContent),
      activeRevisionId: context.activeRevisionId,
      revisionEpoch: context.revisionEpoch,
      contextAnnotationIds: [...context.contextAnnotationIds].sort((a, b) => a - b),
      ordinals: [segments[0].ordinal, segments.at(-1)?.ordinal],
      sourceCharacters,
      evidenceDigest,
      singlePromptCharacters,
    };
    return {
      mode: 'single',
      planVersion: HIERARCHICAL_PLAN_VERSION,
      promptVersion: 'context-summary-v1',
      planDigest: digestPlan(digestInput),
      sourceCharacters,
      singlePromptCharacters,
      plannedCalls: 1,
      stages: [],
      unsupportedReason: null,
    };
  }

  const stages = buildMapStages(segments);
  if (!stages) {
    return unsupportedPlan(context, sourceCharacters, singlePromptCharacters, 'segment-too-large');
  }
  appendReductionTree(stages);
  if (stages.length > MAX_HIERARCHICAL_PLANNED_CALLS) {
    return unsupportedPlan(context, sourceCharacters, singlePromptCharacters, 'plan-too-large');
  }

  const digestInput = {
    mode: 'hierarchical',
    planVersion: HIERARCHICAL_PLAN_VERSION,
    promptVersion: HIERARCHICAL_PROMPT_VERSION,
    summaryId: context.summaryId,
    baseSummaryDigest: digestPlan(context.baseSummaryContent),
    activeRevisionId: context.activeRevisionId,
    revisionEpoch: context.revisionEpoch,
    contextAnnotationIds: [...context.contextAnnotationIds].sort((a, b) => a - b),
    sourceCharacters,
    evidenceDigest,
    singlePromptCharacters,
    topology: stages,
  };
  return {
    mode: 'hierarchical',
    planVersion: HIERARCHICAL_PLAN_VERSION,
    promptVersion: HIERARCHICAL_PROMPT_VERSION,
    planDigest: digestPlan(digestInput),
    sourceCharacters,
    singlePromptCharacters,
    plannedCalls: stages.length,
    stages,
    unsupportedReason: null,
  };
}

export function verifyPlanCoverage(
  plan: SummaryRegenerationPlan,
  segments: ContextSummaryEvidenceSegment[],
): boolean {
  if (plan.mode !== 'hierarchical') return plan.mode === 'single';
  const covered = plan.stages
    .filter((stage) => stage.kind === 'map')
    .flatMap((stage) => {
      if (stage.ordinalStart === null || stage.ordinalEnd === null) return [];
      return Array.from(
        { length: stage.ordinalEnd - stage.ordinalStart + 1 },
        (_, index) => stage.ordinalStart! + index,
      );
    });
  return covered.length === segments.length
    && covered.every((ordinal, index) => ordinal === segments[index].ordinal);
}
