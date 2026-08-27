import { MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS } from './hierarchical-plan';

export type GroundedClaimKind =
  | 'concept'
  | 'definition'
  | 'formula'
  | 'number'
  | 'question'
  | 'uncertain';

export interface GroundedOrdinalRange {
  start: number;
  end: number;
}

export interface GroundedClaim {
  id: string;
  text: string;
  kind: GroundedClaimKind;
  sourceRanges: GroundedOrdinalRange[];
  inputClaimIds: string[];
}

export interface GroundedClaimSet {
  claims: GroundedClaim[];
}

export interface FinalGroundedSummary {
  markdown: string;
  groundingManifest: GroundedClaimSet;
}

const CLAIM_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const CLAIM_KINDS = new Set<GroundedClaimKind>([
  'concept',
  'definition',
  'formula',
  'number',
  'question',
  'uncertain',
]);
const MAX_CLAIMS_PER_STAGE = 64;
const MAX_CLAIM_TEXT_CHARACTERS = 800;
const MAX_RANGES_PER_CLAIM = 12;
const MAX_INPUT_CLAIMS_PER_CLAIM = 24;
const MAX_FINAL_MARKDOWN_CHARACTERS = 100_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

function parseJsonObject(raw: string, maximumCharacters: number): Record<string, unknown> | null {
  const normalized = raw.trim();
  if (!normalized || normalized.length > maximumCharacters) return null;
  try {
    return record(JSON.parse(normalized));
  } catch {
    return null;
  }
}

function normalizeRanges(
  value: unknown,
  allowedOrdinalStart: number,
  allowedOrdinalEnd: number,
): GroundedOrdinalRange[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RANGES_PER_CLAIM) {
    return null;
  }
  const ranges: GroundedOrdinalRange[] = [];
  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length !== 2) return null;
    const [start, end] = candidate;
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < allowedOrdinalStart
      || end > allowedOrdinalEnd
      || end < start
    ) return null;
    ranges.push({ start, end });
  }
  return ranges;
}

function normalizeClaim(
  value: unknown,
  options: {
    allowedOrdinalStart: number;
    allowedOrdinalEnd: number;
    allowedInputClaimIds: Set<string> | null;
  },
): GroundedClaim | null {
  const claim = record(value);
  if (!claim || !hasOnlyKeys(claim, ['id', 'text', 'kind', 'sourceRanges', 'inputClaimIds'])) {
    return null;
  }
  const id = typeof claim.id === 'string' ? claim.id.trim() : '';
  const text = typeof claim.text === 'string' ? claim.text.trim() : '';
  const kind = claim.kind;
  const ranges = normalizeRanges(
    claim.sourceRanges,
    options.allowedOrdinalStart,
    options.allowedOrdinalEnd,
  );
  const inputClaimIds = claim.inputClaimIds;
  if (
    !CLAIM_ID_PATTERN.test(id)
    || !text
    || text.length > MAX_CLAIM_TEXT_CHARACTERS
    || typeof kind !== 'string'
    || !CLAIM_KINDS.has(kind as GroundedClaimKind)
    || !ranges
    || !Array.isArray(inputClaimIds)
    || inputClaimIds.length > MAX_INPUT_CLAIMS_PER_CLAIM
    || inputClaimIds.some((inputId) => (
      typeof inputId !== 'string'
      || !CLAIM_ID_PATTERN.test(inputId)
      || (options.allowedInputClaimIds !== null && !options.allowedInputClaimIds.has(inputId))
    ))
    || new Set(inputClaimIds).size !== inputClaimIds.length
  ) return null;

  if (options.allowedInputClaimIds === null && inputClaimIds.length !== 0) return null;
  if (options.allowedInputClaimIds !== null && inputClaimIds.length === 0) return null;
  return {
    id,
    text,
    kind: kind as GroundedClaimKind,
    sourceRanges: ranges,
    inputClaimIds,
  };
}

function normalizeClaimSet(
  value: unknown,
  options: {
    allowedOrdinalStart: number;
    allowedOrdinalEnd: number;
    allowedInputClaimIds: Set<string> | null;
  },
): GroundedClaimSet | null {
  const result = record(value);
  if (!result || !hasOnlyKeys(result, ['claims']) || !Array.isArray(result.claims)) return null;
  if (result.claims.length === 0 || result.claims.length > MAX_CLAIMS_PER_STAGE) return null;
  const claims = result.claims.flatMap((claim) => {
    const normalized = normalizeClaim(claim, options);
    return normalized ? [normalized] : [];
  });
  if (claims.length !== result.claims.length) return null;
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) return null;
  return { claims };
}

export function normalizeMapStageOutput(
  raw: string,
  ordinalStart: number,
  ordinalEnd: number,
): GroundedClaimSet | null {
  const parsed = parseJsonObject(raw, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  return parsed ? normalizeClaimSet(parsed, {
    allowedOrdinalStart: ordinalStart,
    allowedOrdinalEnd: ordinalEnd,
    allowedInputClaimIds: null,
  }) : null;
}

export function normalizeReduceStageOutput(
  raw: string,
  childClaims: GroundedClaim[],
): GroundedClaimSet | null {
  if (childClaims.length === 0) return null;
  const parsed = parseJsonObject(raw, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  const ordinalStart = Math.min(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.start)));
  const ordinalEnd = Math.max(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.end)));
  const normalized = parsed ? normalizeClaimSet(parsed, {
    allowedOrdinalStart: ordinalStart,
    allowedOrdinalEnd: ordinalEnd,
    allowedInputClaimIds: new Set(childClaims.map((claim) => claim.id)),
  }) : null;
  if (!normalized) return null;

  const childRanges = new Map(childClaims.map((claim) => [claim.id, claim.sourceRanges]));
  for (const claim of normalized.claims) {
    const allowed = claim.inputClaimIds.flatMap((id) => childRanges.get(id) ?? []);
    if (claim.sourceRanges.some((range) => !allowed.some((candidate) => (
      candidate.start <= range.start && candidate.end >= range.end
    )))) return null;
  }
  return normalized;
}

export function normalizeFinalStageOutput(
  raw: string,
  childClaims: GroundedClaim[],
): FinalGroundedSummary | null {
  if (childClaims.length === 0) return null;
  const parsed = parseJsonObject(raw, MAX_FINAL_MARKDOWN_CHARACTERS + 20_000);
  if (!parsed || !hasOnlyKeys(parsed, ['markdown', 'groundingManifest'])) return null;
  const markdown = typeof parsed.markdown === 'string' ? parsed.markdown.trim() : '';
  if (!markdown || markdown.length > MAX_FINAL_MARKDOWN_CHARACTERS || /<\/?[a-z][\s\S]*>/i.test(markdown)) {
    return null;
  }
  const childOrdinalStart = Math.min(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.start)));
  const childOrdinalEnd = Math.max(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.end)));
  const groundingManifest = normalizeClaimSet(parsed.groundingManifest, {
    allowedOrdinalStart: childOrdinalStart,
    allowedOrdinalEnd: childOrdinalEnd,
    allowedInputClaimIds: new Set(childClaims.map((claim) => claim.id)),
  });
  if (!groundingManifest) return null;

  const sensitiveClaims = groundingManifest.claims.filter((claim) => (
    claim.kind === 'formula' || claim.kind === 'number' || claim.kind === 'question'
  ));
  if (sensitiveClaims.some((claim) => claim.inputClaimIds.length === 0)) return null;
  if (/\d/.test(markdown) && !groundingManifest.claims.some((claim) => (
    claim.kind === 'number' || claim.kind === 'formula'
  ))) return null;
  if (/\?/.test(markdown) && !groundingManifest.claims.some((claim) => claim.kind === 'question')) {
    return null;
  }
  if (/[=±×÷]|\b(?:sin|cos|log|sqrt)\b/i.test(markdown)
    && !groundingManifest.claims.some((claim) => claim.kind === 'formula')) return null;
  return { markdown, groundingManifest };
}

export function parseStoredClaimSet(value: string): GroundedClaimSet | null {
  const parsed = parseJsonObject(value, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  if (!parsed) return null;
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const allRanges = claims.flatMap((claim) => {
    const sourceRanges = record(claim)?.sourceRanges;
    return Array.isArray(sourceRanges) ? sourceRanges : [];
  }).filter((range): range is [number, number] => (
    Array.isArray(range)
    && range.length === 2
    && Number.isSafeInteger(range[0])
    && Number.isSafeInteger(range[1])
  ));
  if (allRanges.length === 0) return null;
  const storedInputIds = claims.flatMap((claim) => {
    const inputIds = record(claim)?.inputClaimIds;
    return Array.isArray(inputIds) ? inputIds.filter((id): id is string => typeof id === 'string') : [];
  });
  return normalizeClaimSet(parsed, {
    allowedOrdinalStart: Math.min(...allRanges.map(([start]) => start)),
    allowedOrdinalEnd: Math.max(...allRanges.map(([, end]) => end)),
    allowedInputClaimIds: storedInputIds.length > 0 ? new Set(storedInputIds) : null,
  });
}

export function serializeGroundedClaimSet(value: GroundedClaimSet): string {
  return JSON.stringify({
    claims: value.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      kind: claim.kind,
      sourceRanges: claim.sourceRanges.map((range) => [range.start, range.end]),
      inputClaimIds: claim.inputClaimIds,
    })),
  });
}
