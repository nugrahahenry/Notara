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

export type GroundedStageOutputRejectionReason =
  | 'empty'
  | 'too-large'
  | 'json-invalid'
  | 'root-invalid'
  | 'claims-invalid'
  | 'claim-shape-invalid'
  | 'claim-id-invalid'
  | 'claim-text-invalid'
  | 'claim-kind-invalid'
  | 'source-range-invalid'
  | 'source-range-out-of-bounds'
  | 'input-claim-ids-invalid'
  | 'input-claim-reference-invalid'
  | 'duplicate-claim-id';

export type GroundedStageOutputInspection<T> =
  | { ok: true; value: T }
  | { ok: false; reason: GroundedStageOutputRejectionReason };

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

function reject<T>(reason: GroundedStageOutputRejectionReason): GroundedStageOutputInspection<T> {
  return { ok: false, reason };
}

function accept<T>(value: T): GroundedStageOutputInspection<T> {
  return { ok: true, value };
}

function unwrapSingleJsonFence(raw: string): string {
  const normalized = raw.trim();
  const match = normalized.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1].trim() : normalized;
}

function inspectJsonObject(
  raw: string,
  maximumCharacters: number,
): GroundedStageOutputInspection<Record<string, unknown>> {
  const normalized = unwrapSingleJsonFence(raw);
  if (!normalized) return reject('empty');
  if (normalized.length > maximumCharacters) return reject('too-large');
  try {
    const parsed = record(JSON.parse(normalized));
    return parsed ? accept(parsed) : reject('root-invalid');
  } catch {
    return reject('json-invalid');
  }
}

function unwrapClaimSetEnvelope(value: Record<string, unknown>): Record<string, unknown> {
  if (hasOnlyKeys(value, ['claims'])) return value;
  for (const key of ['result', 'data', 'output']) {
    if (!hasOnlyKeys(value, [key])) continue;
    const nested = record(value[key]);
    if (nested && hasOnlyKeys(nested, ['claims'])) return nested;
  }
  return value;
}

function inspectRanges(
  value: unknown,
  allowedOrdinalStart: number,
  allowedOrdinalEnd: number,
): GroundedStageOutputInspection<GroundedOrdinalRange[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RANGES_PER_CLAIM) {
    return reject('source-range-invalid');
  }
  const ranges: GroundedOrdinalRange[] = [];
  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length !== 2) return reject('source-range-invalid');
    const [start, end] = candidate;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) {
      return reject('source-range-invalid');
    }
    if (start < allowedOrdinalStart || end > allowedOrdinalEnd) {
      return reject('source-range-out-of-bounds');
    }
    ranges.push({ start, end });
  }
  if (new Set(ranges.map((range) => `${range.start}:${range.end}`)).size !== ranges.length) {
    return reject('source-range-invalid');
  }
  return accept(ranges);
}

function inspectClaim(
  value: unknown,
  options: {
    allowedOrdinalStart: number;
    allowedOrdinalEnd: number;
    allowedInputClaimIds: Set<string> | null;
  },
): GroundedStageOutputInspection<GroundedClaim> {
  const claim = record(value);
  if (!claim || !hasOnlyKeys(claim, ['id', 'text', 'kind', 'sourceRanges', 'inputClaimIds'])) {
    return reject('claim-shape-invalid');
  }
  const id = typeof claim.id === 'string' ? claim.id.trim() : '';
  const text = typeof claim.text === 'string' ? claim.text.trim() : '';
  const kind = claim.kind;
  const ranges = inspectRanges(
    claim.sourceRanges,
    options.allowedOrdinalStart,
    options.allowedOrdinalEnd,
  );
  const inputClaimIds = claim.inputClaimIds;
  if (!CLAIM_ID_PATTERN.test(id)) return reject('claim-id-invalid');
  if (!text || text.length > MAX_CLAIM_TEXT_CHARACTERS) return reject('claim-text-invalid');
  if (typeof kind !== 'string' || !CLAIM_KINDS.has(kind as GroundedClaimKind)) {
    return reject('claim-kind-invalid');
  }
  if (!ranges.ok) return ranges;
  if (!Array.isArray(inputClaimIds) || inputClaimIds.length > MAX_INPUT_CLAIMS_PER_CLAIM) {
    return reject('input-claim-ids-invalid');
  }
  if (inputClaimIds.some((inputId) => typeof inputId !== 'string' || !CLAIM_ID_PATTERN.test(inputId))) {
    return reject('input-claim-ids-invalid');
  }
  if (new Set(inputClaimIds).size !== inputClaimIds.length) {
    return reject('input-claim-ids-invalid');
  }
  if (options.allowedInputClaimIds === null && inputClaimIds.length !== 0) {
    return reject('input-claim-ids-invalid');
  }
  if (options.allowedInputClaimIds !== null && inputClaimIds.length === 0) {
    return reject('input-claim-ids-invalid');
  }
  if (
    options.allowedInputClaimIds !== null
    && inputClaimIds.some((inputId) => !options.allowedInputClaimIds!.has(inputId))
  ) return reject('input-claim-reference-invalid');
  return accept({
    id,
    text,
    kind: kind as GroundedClaimKind,
    sourceRanges: ranges.value,
    inputClaimIds,
  });
}

function inspectClaimSet(
  value: unknown,
  options: {
    allowedOrdinalStart: number;
    allowedOrdinalEnd: number;
    allowedInputClaimIds: Set<string> | null;
    canonicalIdPrefix?: string;
    allowEnvelope?: boolean;
  },
): GroundedStageOutputInspection<GroundedClaimSet> {
  const candidate = record(value);
  if (!candidate) return reject('root-invalid');
  const result = options.allowEnvelope ? unwrapClaimSetEnvelope(candidate) : candidate;
  if (!hasOnlyKeys(result, ['claims']) || !Array.isArray(result.claims)) {
    return reject('claims-invalid');
  }
  if (result.claims.length === 0 || result.claims.length > MAX_CLAIMS_PER_STAGE) {
    return reject('claims-invalid');
  }
  const claims: GroundedClaim[] = [];
  for (const claim of result.claims) {
    const inspected = inspectClaim(claim, options);
    if (!inspected.ok) return inspected;
    claims.push(inspected.value);
  }
  if (options.canonicalIdPrefix) {
    return accept({
      claims: claims.map((claim, index) => ({
        ...claim,
        id: `${options.canonicalIdPrefix}${index + 1}`,
      })),
    });
  }
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) {
    return reject('duplicate-claim-id');
  }
  return accept({ claims });
}

export function inspectMapStageOutput(
  raw: string,
  ordinalStart: number,
  ordinalEnd: number,
): GroundedStageOutputInspection<GroundedClaimSet> {
  if (
    !Number.isSafeInteger(ordinalStart)
    || !Number.isSafeInteger(ordinalEnd)
    || ordinalStart < 0
    || ordinalEnd < ordinalStart
  ) return reject('source-range-out-of-bounds');
  const parsed = inspectJsonObject(raw, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  if (!parsed.ok) return parsed;
  return inspectClaimSet(parsed.value, {
    allowedOrdinalStart: ordinalStart,
    allowedOrdinalEnd: ordinalEnd,
    allowedInputClaimIds: null,
    canonicalIdPrefix: `map_${ordinalStart}_${ordinalEnd}_c`,
    allowEnvelope: true,
  });
}

export function normalizeMapStageOutput(
  raw: string,
  ordinalStart: number,
  ordinalEnd: number,
): GroundedClaimSet | null {
  const inspected = inspectMapStageOutput(raw, ordinalStart, ordinalEnd);
  return inspected.ok ? inspected.value : null;
}

export function normalizeReduceStageOutput(
  raw: string,
  childClaims: GroundedClaim[],
  canonicalIdPrefix?: string,
): GroundedClaimSet | null {
  if (
    childClaims.length === 0
    || new Set(childClaims.map((claim) => claim.id)).size !== childClaims.length
  ) return null;
  const parsed = inspectJsonObject(raw, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  const ordinalStart = Math.min(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.start)));
  const ordinalEnd = Math.max(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.end)));
  const inspected = parsed.ok ? inspectClaimSet(parsed.value, {
    allowedOrdinalStart: ordinalStart,
    allowedOrdinalEnd: ordinalEnd,
    allowedInputClaimIds: new Set(childClaims.map((claim) => claim.id)),
    canonicalIdPrefix,
    allowEnvelope: true,
  }) : parsed;
  if (!inspected.ok) return null;

  const childRanges = new Map(childClaims.map((claim) => [claim.id, claim.sourceRanges]));
  for (const claim of inspected.value.claims) {
    const allowed = claim.inputClaimIds.flatMap((id) => childRanges.get(id) ?? []);
    if (claim.sourceRanges.some((range) => !allowed.some((candidate) => (
      candidate.start <= range.start && candidate.end >= range.end
    )))) return null;
  }
  return inspected.value;
}

export function normalizeFinalStageOutput(
  raw: string,
  childClaims: GroundedClaim[],
  canonicalIdPrefix?: string,
): FinalGroundedSummary | null {
  if (
    childClaims.length === 0
    || new Set(childClaims.map((claim) => claim.id)).size !== childClaims.length
  ) return null;
  const parsed = inspectJsonObject(raw, MAX_FINAL_MARKDOWN_CHARACTERS + 20_000);
  if (!parsed.ok || !hasOnlyKeys(parsed.value, ['markdown', 'groundingManifest'])) return null;
  const markdown = typeof parsed.value.markdown === 'string' ? parsed.value.markdown.trim() : '';
  if (!markdown || markdown.length > MAX_FINAL_MARKDOWN_CHARACTERS || /<\/?[a-z][\s\S]*>/i.test(markdown)) {
    return null;
  }
  const childOrdinalStart = Math.min(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.start)));
  const childOrdinalEnd = Math.max(...childClaims.flatMap((claim) => claim.sourceRanges.map((range) => range.end)));
  const groundingManifest = inspectClaimSet(parsed.value.groundingManifest, {
    allowedOrdinalStart: childOrdinalStart,
    allowedOrdinalEnd: childOrdinalEnd,
    allowedInputClaimIds: new Set(childClaims.map((claim) => claim.id)),
    canonicalIdPrefix,
  });
  if (!groundingManifest.ok) return null;

  const sensitiveClaims = groundingManifest.value.claims.filter((claim) => (
    claim.kind === 'formula' || claim.kind === 'number' || claim.kind === 'question'
  ));
  if (sensitiveClaims.some((claim) => claim.inputClaimIds.length === 0)) return null;
  if (/\d/.test(markdown) && !groundingManifest.value.claims.some((claim) => (
    claim.kind === 'number' || claim.kind === 'formula'
  ))) return null;
  if (/\?/.test(markdown) && !groundingManifest.value.claims.some((claim) => claim.kind === 'question')) {
    return null;
  }
  if (/[=±×÷]|\b(?:sin|cos|log|sqrt)\b/i.test(markdown)
    && !groundingManifest.value.claims.some((claim) => claim.kind === 'formula')) return null;
  return { markdown, groundingManifest: groundingManifest.value };
}

export function parseStoredClaimSet(value: string): GroundedClaimSet | null {
  const parsed = inspectJsonObject(value, MAX_HIERARCHICAL_STAGE_OUTPUT_CHARACTERS);
  if (!parsed.ok) return null;
  const claims = Array.isArray(parsed.value.claims) ? parsed.value.claims : [];
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
  const inspected = inspectClaimSet(parsed.value, {
    allowedOrdinalStart: Math.min(...allRanges.map(([start]) => start)),
    allowedOrdinalEnd: Math.max(...allRanges.map(([, end]) => end)),
    allowedInputClaimIds: storedInputIds.length > 0 ? new Set(storedInputIds) : null,
  });
  return inspected.ok ? inspected.value : null;
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
