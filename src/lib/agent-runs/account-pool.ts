import { i18n } from "@/i18n/runtime";
/**
 * The opt-in account pool of an Agent run: the user's own subscription
 * accounts of the run's provider, frozen at start with the run's account
 * first and the rest in Settings order. When a usage limit stops the run, it
 * continues on the first pool account with usage left; with none, it waits for
 * the earliest reset in the pool. An API connection is never a pool account,
 * so a limit never moves a run onto per-token billing.
 *
 * Used by: `policy.ts` (rotation decisions), the host runtime (reads and
 * start normalization), `src/store/agent-run-send.ts` (the start snapshot)
 * and the timeline and report (switch copy).
 *
 * Pure: no clock, no I/O. Callers pass `now`.
 */
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { resolveAgentRunUsageLimitResumeAt, resolveUsageLimitRetryAt } from "./usage-limit";
import type { AgentRun, AgentRunAccountPool, AgentRunEvent, AgentRunEventDraft } from "./domain";

/** What one pool account's usage read said, in the order the host read them. */
export interface PoolAccountUsage {
  accountProfileId: string;
  status: "headroom" | "exhausted" | "unavailable";
  resetsAt?: string;
}

type PoolProfile = Pick<ProviderAccountProfile, "id" | "providerId" | "gateway" | "apiConnection">;

/** A subscription sign-in. An API connection bills per token and is never pooled. */
export function isPoolableAccount(profile: Pick<ProviderAccountProfile, "gateway" | "apiConnection">): boolean {
  return !profile.gateway && !profile.apiConnection;
}

function orderPool(currentAccountId: string, candidates: readonly string[]): AgentRunAccountPool | null {
  if (!candidates.includes(currentAccountId)) return null;
  const accountIds = [currentAccountId, ...new Set(candidates.filter((id) => id !== currentAccountId))];
  return accountIds.length >= 2 ? { accountIds } : null;
}

/**
 * The pool a Run starts with: the run's account, then the provider's other
 * subscription accounts whose sign-in check confirmed a sign-in, in Settings
 * order, minus the ones the user left out. An account that is signed out, or
 * whose check failed or never answered, stays out. Null when that leaves fewer
 * than two, or when the run itself starts on an API connection.
 */
export function buildAgentRunAccountPool(args: {
  providerId: string;
  currentAccountId: string;
  /** Every account, in Settings order. */
  profiles: readonly PoolProfile[];
  excludedAccountIds?: readonly string[];
  /** Accounts whose sign-in check says signed in. */
  signedInAccountIds: readonly string[];
}): AgentRunAccountPool | null {
  const excluded = new Set(args.excludedAccountIds ?? []);
  const signedIn = new Set(args.signedInAccountIds);
  const subscriptions = args.profiles
    .filter((profile) => profile.providerId === args.providerId && isPoolableAccount(profile))
    .map((profile) => profile.id);
  return orderPool(args.currentAccountId, subscriptions.filter((id) =>
    id === args.currentAccountId || (!excluded.has(id) && signedIn.has(id))));
}

/**
 * The pool the host freezes on the run: only accounts that are still
 * subscription accounts of the run's provider, the run's account first.
 * Without a host account list the requested order is kept.
 */
export function normalizeAgentRunAccountPool(args: {
  pool: AgentRunAccountPool | undefined;
  currentAccountId: string;
  subscriptionAccountIds?: readonly string[];
}): AgentRunAccountPool | null {
  if (!args.pool) return null;
  const known = args.subscriptionAccountIds ? new Set(args.subscriptionAccountIds) : null;
  const ids = [args.currentAccountId, ...args.pool.accountIds].filter((id) => !known || known.has(id));
  return orderPool(args.currentAccountId, ids);
}

/**
 * The pool account a pooled run's own turns use now: the account of its
 * latest usage limit or switch, while that account belongs to the pool and the
 * run's provider. Null: the run's captured account applies.
 */
export function agentRunPoolAccount(
  agentRun: Pick<AgentRun, "accountPool" | "usageLimit" | "fingerprint">,
): { providerId: "claude-code" | "codex"; accountProfileId: string } | null {
  const limit = agentRun.usageLimit;
  if (!agentRun.accountPool || !limit) return null;
  const providerId = limit.fingerprint.providerId;
  if ((providerId !== "claude-code" && providerId !== "codex") || providerId !== agentRun.fingerprint.providerId) return null;
  return agentRun.accountPool.accountIds.includes(limit.accountProfileId) ? { providerId, accountProfileId: limit.accountProfileId } : null;
}

/**
 * The accounts to read, in order, when a pooled run meets a limit: after a
 * limited turn, its own account (for its reset) and then the others in pool
 * order; at a due reset, the whole pool in order. Null when the pool does not
 * apply: pool off, another provider's turn, or no other usable account.
 */
export function accountPoolReadOrder(args: {
  agentRun: Pick<AgentRun, "accountPool" | "fingerprint">;
  providerId: string;
  limitedAccountId: string;
  due: boolean;
  /** The host's current subscription accounts of `providerId`; absent keeps the frozen pool. */
  subscriptionAccountIds?: readonly string[];
}): string[] | null {
  const pool = args.agentRun.accountPool;
  if (!pool || args.providerId !== args.agentRun.fingerprint.providerId) return null;
  const known = args.subscriptionAccountIds ? new Set(args.subscriptionAccountIds) : null;
  const usable = pool.accountIds.filter((id) => !known || known.has(id));
  if (!usable.some((id) => id !== args.limitedAccountId)) return null;
  return args.due ? usable : [args.limitedAccountId, ...usable.filter((id) => id !== args.limitedAccountId)];
}

export type AccountPoolRotation =
  | { kind: "use"; accountProfileId: string }
  | { kind: "wait"; resetsAt: string | null; resumeAt: string | null };

/**
 * The first account read with usage left, in read order, never the account
 * that just stopped on a limit. With none: wait for the earliest reset any
 * read reported (plus the usual grace); with no known reset, read again later
 * when a read failed, else leave the resume to the user.
 */
export function decideAccountPoolRotation(args: {
  usage: readonly PoolAccountUsage[];
  /** The account a turn just stopped on; it is never chosen in this pass. */
  limitedAccountId?: string;
  /** The limit's own reset, when its stop reported one. */
  limitedResetsAt?: string | null;
  now: Date;
}): AccountPoolRotation {
  const pick = args.usage.find((entry) => entry.status === "headroom" && entry.accountProfileId !== args.limitedAccountId);
  if (pick) return { kind: "use", accountProfileId: pick.accountProfileId };
  const resets = [args.limitedResetsAt, ...args.usage.map((entry) => entry.status === "exhausted" ? entry.resetsAt : undefined)]
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const earliest = resets[0] ?? null;
  if (earliest) return { kind: "wait", resetsAt: earliest, resumeAt: resolveAgentRunUsageLimitResumeAt(earliest, args.now) };
  const unreadable = args.usage.some((entry) => entry.status === "unavailable");
  return { kind: "wait", resetsAt: null, resumeAt: unreadable ? resolveUsageLimitRetryAt(args.now) : null };
}

/** One account switch, as the timeline and the report show it. */
export interface AgentRunAccountSwitch {
  from: string;
  to: string;
  reason: "usage-limit";
  at: string;
}

/** The `account-switched` event a switch records; the host adds account names. */
export function accountSwitchedEvent(args: {
  agentRunId: string;
  providerId: string;
  from: string;
  to: string;
  turnId: string;
}): AgentRunEventDraft {
  return {
    kind: "account-switched",
    // Keyed: never pruned, so the report keeps every switch.
    idempotencyKey: `${args.agentRunId}:account-switched:${args.turnId}:${args.to}`,
    detail: { providerId: args.providerId, from: args.from, to: args.to, reason: "usage-limit", turnId: args.turnId },
  };
}

/** The recorded account name; System default reads in the UI language. */
function accountName(id: unknown, label: unknown): string {
  if (id === SYSTEM_ACCOUNT_PROFILE_ID) return i18n.t("usage:usageViewUtils.systemDefault");
  if (typeof label === "string" && label.trim()) return label.trim();
  return typeof id === "string" ? id.slice(0, 8) : "?";
}

export function toAgentRunAccountSwitch(event: Pick<AgentRunEvent, "kind" | "detail" | "createdAt">): AgentRunAccountSwitch | null {
  if (event.kind !== "account-switched") return null;
  return {
    from: accountName(event.detail.from, event.detail.fromLabel),
    to: accountName(event.detail.to, event.detail.toLabel),
    reason: "usage-limit",
    at: event.createdAt,
  };
}

export function collectAgentRunAccountSwitches(events: readonly AgentRunEvent[]): AgentRunAccountSwitch[] {
  return events.flatMap((event) => toAgentRunAccountSwitch(event) ?? []);
}

/** "Account switched · Work → Personal · usage limit". */
export function describeAgentRunAccountSwitch(change: Pick<AgentRunAccountSwitch, "from" | "to">): string {
  return i18n.t("agentRuns:accountPool.switched", { from: change.from, to: change.to });
}
