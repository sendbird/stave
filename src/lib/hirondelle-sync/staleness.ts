export const HIRONDELLE_CONTEXT_MAX_AGE_MS = 60 * 60 * 1_000;

export function isHirondelleContextStale(args: {
  lastPulledAt: string | null;
  now?: Date;
  maxAgeMs?: number;
}): boolean {
  if (!args.lastPulledAt) return true;
  const pulledAtMs = Date.parse(args.lastPulledAt);
  if (!Number.isFinite(pulledAtMs)) return true;
  const nowMs = (args.now ?? new Date()).getTime();
  const maxAgeMs = Math.max(
    0,
    args.maxAgeMs ?? HIRONDELLE_CONTEXT_MAX_AGE_MS,
  );
  return nowMs - pulledAtMs > maxAgeMs;
}
