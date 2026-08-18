const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * Deterministic stale-data guard. This is intentionally non-cryptographic and
 * must never be used for authorization, tamper proofing, or durable citation.
 */
export function fnv1a64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = FNV_OFFSET_BASIS_64;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

