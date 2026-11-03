/**
 * When Stave declines an approval nobody answers.
 *
 * Every provider runtime that shows approval cards (Claude, Codex, and the ACP
 * runtimes behind Cursor, Kiro and OpenCode) starts a defensive timer as it
 * raises the request and denies the request when that timer fires. The
 * deadline is known at that moment, so the request carries it as `expiresAt`
 * and the card can say when it will be denied instead of the request
 * disappearing without warning.
 */

/**
 * The ISO time a request raised at `now` is declined, for a runtime whose
 * auto-decline timer runs `timeoutMs`; absent when no timer runs.
 */
export function resolveApprovalExpiresAt(args: { timeoutMs: number; now?: number }): string | undefined {
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) return undefined;
  const now = args.now ?? Date.now();
  return new Date(now + args.timeoutMs).toISOString();
}

/**
 * The deadline once a second timer of `timeoutMs` starts at `now` on the same
 * request (a delegated task's host denies sooner than the runtime): whichever
 * fires first.
 */
export function earlierApprovalDeadline(args: { expiresAt?: string; timeoutMs: number; now?: number }): string | undefined {
  const second = resolveApprovalExpiresAt({ timeoutMs: args.timeoutMs, now: args.now });
  const first = args.expiresAt && Number.isFinite(Date.parse(args.expiresAt)) ? args.expiresAt : undefined;
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second) < Date.parse(first) ? second : first;
}

/** The deadline to show for a still-pending request, or null when there is none ahead. */
export function readApprovalDeadline(expiresAt: string | undefined, now: number = Date.now()): Date | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt);
  const time = deadline.getTime();
  return Number.isFinite(time) && time > now ? deadline : null;
}
