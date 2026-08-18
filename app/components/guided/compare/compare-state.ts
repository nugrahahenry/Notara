import type {
  CompareDraft,
  CompareDraftEvent,
  CompareNotes,
  TransientSourceBlock,
} from './types';

export const EMPTY_COMPARE_NOTES: CompareNotes = {
  similarities: '',
  differences: '',
  remainingQuestion: '',
};

export function createCompareDraft(materialId: string, sourceSignature = ''): CompareDraft {
  return {
    materialId,
    sourceSignature,
    a: null,
    b: null,
    notes: { ...EMPTY_COMPARE_NOTES },
  };
}

export function hasCompareNotes(draft: CompareDraft): boolean {
  return Object.values(draft.notes).some((value) => value.trim().length > 0);
}

function canUseBlock(
  draft: CompareDraft,
  block: TransientSourceBlock,
  sourceSignature: string,
): boolean {
  return sourceSignature === draft.sourceSignature
    && block.materialId === draft.materialId
    && block.selectable;
}

function replaceBlock(
  draft: CompareDraft,
  slot: 'a' | 'b',
  replacement: TransientSourceBlock | null,
  sourceSignature: string,
): CompareDraft {
  if (sourceSignature !== draft.sourceSignature) return draft;
  if (replacement && !canUseBlock(draft, replacement, sourceSignature)) return draft;
  const opposite = slot === 'a' ? draft.b : draft.a;
  if (replacement && opposite?.id === replacement.id) return draft;
  if ((draft[slot]?.id ?? null) === (replacement?.id ?? null)) return draft;
  return {
    ...draft,
    [slot]: replacement,
    notes: { ...EMPTY_COMPARE_NOTES },
  };
}

export function compareDraftReducer(draft: CompareDraft, event: CompareDraftEvent): CompareDraft {
  switch (event.type) {
    case 'SOURCE_SIGNATURE_CHANGED':
      return event.sourceSignature === draft.sourceSignature
        ? draft
        : createCompareDraft(draft.materialId, event.sourceSignature);

    case 'SELECT_COMPARE_BLOCK':
      return replaceBlock(draft, event.slot, event.block, event.sourceSignature);

    case 'CLEAR_COMPARE_BLOCK':
      return replaceBlock(draft, event.slot, null, event.sourceSignature);

    case 'CONFIRM_COMPARE_SOURCE_REPLACEMENT':
      if (event.sourceSignature !== draft.sourceSignature) return draft;
      if (event.replacement && draft[event.slot]?.id === event.replacement.id) {
        return {
          ...draft,
          notes: { ...EMPTY_COMPARE_NOTES },
        };
      }
      return replaceBlock(draft, event.slot, event.replacement, event.sourceSignature);

    case 'SET_COMPARE_NOTE':
      if (event.sourceSignature !== draft.sourceSignature) return draft;
      return {
        ...draft,
        notes: {
          ...draft.notes,
          [event.field]: event.value,
        },
      };

    case 'RESET_COMPARE':
      return createCompareDraft(draft.materialId, event.sourceSignature ?? draft.sourceSignature);

    default:
      return draft;
  }
}

