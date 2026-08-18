import type { Summary } from '@/lib/types';
import type { GuidedSourceEligibility } from './types';

/**
 * Resolve Guided eligibility from the durable material row and authenticated
 * viewer only. Workspace origin, folder membership and public status are not
 * ownership signals.
 */
export function resolveGuidedEligibility(
  material: Summary | null,
  viewerUserId: string | null,
): GuidedSourceEligibility {
  if (!material) return { status: 'unavailable', reason: 'deleted-revoked-or-missing' };
  if (material.id.startsWith('local-')) {
    return { status: 'ineligible-local', reason: 'same-tab-non-durable' };
  }
  if (!material.summary.trim() || !material.transcript.trim()) {
    return { status: 'ineligible-incomplete', reason: 'missing-summary-or-transcript' };
  }
  if (!viewerUserId || !material.user_id) {
    return { status: 'unknown-denied', reason: 'ownership-unconfirmed' };
  }
  if (material.user_id !== viewerUserId) {
    return { status: 'fork-required', reason: 'shared-or-public-non-owner' };
  }
  return { status: 'eligible-owned', materialId: material.id };
}

