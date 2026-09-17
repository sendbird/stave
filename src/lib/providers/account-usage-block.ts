import type {
  AccountUsageBucket,
  AccountUsageWindow,
  ClaudeUsageSnapshot,
  CodexRateLimitSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import { getCursorModelBaseId } from "@/lib/providers/cursor-model-id";

export const ACCOUNT_USAGE_BLOCK_THRESHOLD = 100;

export interface AccountUsageLimitWindow {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}

export interface AccountUsageBlock {
  providerId: ProviderId;
  providerLabel: string;
  windowLabel: string;
  usedPercent: number;
  resetsAt: number | null;
  message: string;
}

export function providerAccountUsageLabel(providerId: ProviderId): string {
  switch (providerId) {
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "kiro":
      return "Kiro";
  }
}

export function isAccountUsageWindowExhausted(args: {
  usedPercent: number;
  resetsAt: number | null;
  now?: number;
}): boolean {
  if (
    !Number.isFinite(args.usedPercent) ||
    args.usedPercent < ACCOUNT_USAGE_BLOCK_THRESHOLD
  ) {
    return false;
  }
  if (args.resetsAt == null || !Number.isFinite(args.resetsAt)) {
    return true;
  }
  return args.resetsAt * 1000 > (args.now ?? Date.now());
}

function compareUsageWindows(
  left: AccountUsageLimitWindow,
  right: AccountUsageLimitWindow,
) {
  return right.usedPercent - left.usedPercent;
}

function collectClaudeWindows(
  snapshot: ClaudeUsageSnapshot,
  model?: string,
): AccountUsageLimitWindow[] {
  const knownNonFableModel = /^(?:claude-)?(?:sonnet|opus|haiku)(?:$|[-.])/i.test(
    model?.trim() ?? "",
  );
  return [
    snapshot.session
      ? { label: "Session", usedPercent: snapshot.session.usedPercent, resetsAt: snapshot.session.resetsAt }
      : null,
    snapshot.weekly
      ? { label: "Weekly", usedPercent: snapshot.weekly.usedPercent, resetsAt: snapshot.weekly.resetsAt }
      : null,
    snapshot.fableWeekly && !knownNonFableModel
      ? {
          label: "Model weekly",
          usedPercent: snapshot.fableWeekly.usedPercent,
          resetsAt: snapshot.fableWeekly.resetsAt,
        }
      : null,
  ].filter((window): window is AccountUsageLimitWindow => window !== null);
}

function collectCodexWindows(
  buckets: readonly CodexRateLimitSnapshot[],
  model?: string,
): AccountUsageLimitWindow[] {
  const windows: AccountUsageLimitWindow[] = [];
  for (const bucket of buckets) {
    // The separately named Spark quota does not constrain standard models.
    // Shared and unknown buckets remain binding: the protocol does not expose
    // a complete model-to-bucket mapping. Other names may describe model groups.
    const isSparkBucket =
      bucket.limitName?.trim().toLowerCase() === "gpt-5.3-codex-spark";
    if (
      model?.trim() &&
      isSparkBucket &&
      /^gpt-/i.test(model.trim()) &&
      !/spark/i.test(model)
    ) {
      continue;
    }
    const label = bucket.limitName?.trim() || bucket.limitId?.trim() || "Codex";
    if (bucket.primary) {
      windows.push({
        label: `${label} primary`,
        usedPercent: bucket.primary.usedPercent,
        resetsAt: bucket.primary.resetsAt,
      });
    }
    if (bucket.secondary) {
      windows.push({
        label: `${label} secondary`,
        usedPercent: bucket.secondary.usedPercent,
        resetsAt: bucket.secondary.resetsAt,
      });
    }
    if (bucket.individualLimit) {
      windows.push({
        label,
        usedPercent: bucket.individualLimit.usedPercent,
        resetsAt: bucket.individualLimit.resetsAt,
      });
    }
  }
  return windows;
}

function collectAccountWindows(
  monthly: AccountUsageWindow | null,
  buckets: readonly AccountUsageBucket[],
  monthlyLabel: string,
): AccountUsageLimitWindow[] {
  return [
    monthly
      ? {
          label: monthlyLabel,
          usedPercent: monthly.usedPercent,
          resetsAt: monthly.resetsAt,
        }
      : null,
    ...buckets.map((bucket) => ({
      label: bucket.label,
      usedPercent: bucket.usedPercent,
      resetsAt: bucket.resetsAt,
    })),
  ].filter((window): window is AccountUsageLimitWindow => window !== null);
}

/**
 * Included-usage windows for one provider. `null` means the snapshot is
 * missing or that provider's source is unavailable, so a caller must not
 * treat the account as exhausted.
 */
export function collectProviderAccountUsageWindows(args: {
  providerId: ProviderId;
  model?: string;
  snapshot: RateLimitsSnapshotResponse | null | undefined;
}): AccountUsageLimitWindow[] | null {
  const snapshot = args.snapshot;
  if (!snapshot) {
    return null;
  }
  if (args.providerId === "claude-code") {
    return snapshot.claude.source === "unavailable"
      ? null
      : collectClaudeWindows(snapshot.claude, args.model);
  }
  if (args.providerId === "codex") {
    return snapshot.codex.source === "unavailable"
      ? null
      : collectCodexWindows(snapshot.codex.buckets, args.model);
  }
  if (args.providerId === "cursor") {
    if (!snapshot.cursor || snapshot.cursor.source === "unavailable") {
      return null;
    }
    const model = getCursorModelBaseId(args.model ?? "").toLowerCase();
    // Named models consume separate pools. Auto can route into either pool;
    // absent model/pool data retains the conservative account-wide check.
    const poolId = !model || model === "auto" || model.startsWith("auto-")
      ? null
      : model.startsWith("composer-") || /^grok-4[.-][56](?:$|-)/.test(model)
        ? "cursor-models"
        : "other-models";
    const pool = snapshot.cursor.buckets.find((bucket) => bucket.id === poolId);
    return pool
      ? collectAccountWindows(null, [pool], "Monthly")
      : collectAccountWindows(snapshot.cursor.monthly, snapshot.cursor.buckets, "Monthly");
  }
  if (!snapshot.kiro || snapshot.kiro.source === "unavailable") {
    return null;
  }
  // CREDIT is the included plan allocation. Bonus/add-on/resource breakdowns
  // are not simultaneous account limits. Prefer the raw bucket so older
  // cached snapshots with a synthetic maximum in `monthly` are safe too.
  const credits = snapshot.kiro.buckets.filter((bucket) =>
    /^credits?$/i.test(bucket.id),
  );
  return collectAccountWindows(
    snapshot.kiro.buckets.length === 0 ? snapshot.kiro.monthly : null,
    credits,
    "Monthly",
  );
}

export function resolveTightestAccountUsageWindow(args: {
  providerId: ProviderId;
  model?: string;
  snapshot: RateLimitsSnapshotResponse | null | undefined;
}): AccountUsageLimitWindow | null {
  const windows = collectProviderAccountUsageWindows(args);
  if (!windows || windows.length === 0) {
    return null;
  }
  return [...windows].sort(compareUsageWindows)[0] ?? null;
}

/**
 * Earliest window boundary this provider will cross, in epoch milliseconds.
 *
 * Crossing a boundary is the one way a reading goes stale without anything
 * local happening, and the boundary is already in the snapshot — so the poll
 * policy can schedule a single read for it instead of polling to notice. The
 * *earliest* window is what matters, not the tightest: a 5-hour window resets
 * while a weekly one is still days out, and only the 5-hour number changed.
 */
export function resolveEarliestAccountUsageResetAtMs(args: {
  providerId: ProviderId;
  snapshot: RateLimitsSnapshotResponse | null | undefined;
}): number | null {
  const windows = collectProviderAccountUsageWindows(args);
  if (!windows || windows.length === 0) {
    return null;
  }
  let earliest: number | null = null;
  for (const window of windows) {
    if (window.resetsAt == null || !Number.isFinite(window.resetsAt)) {
      continue;
    }
    const resetsAtMs = window.resetsAt * 1000;
    if (earliest === null || resetsAtMs < earliest) {
      earliest = resetsAtMs;
    }
  }
  return earliest;
}

function formatResetPhrase(resetsAt: number | null, now: number): string {
  if (resetsAt == null || !Number.isFinite(resetsAt)) {
    return "it resets";
  }
  const deltaMs = resetsAt * 1000 - now;
  if (deltaMs <= 0) {
    return "it resets";
  }
  const hours = Math.floor(deltaMs / 3_600_000);
  const minutes = Math.floor((deltaMs % 3_600_000) / 60_000);
  const wait = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `it resets in ${wait}`;
}

export function resolveAccountUsageBlock(args: {
  providerId: ProviderId;
  model?: string;
  snapshot: RateLimitsSnapshotResponse | null | undefined;
  now?: number;
}): AccountUsageBlock | null {
  const now = args.now ?? Date.now();
  const windows = collectProviderAccountUsageWindows(args);
  if (!windows) {
    return null;
  }
  const exhausted = windows
    .filter((window) =>
      isAccountUsageWindowExhausted({
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt,
        now,
      }),
    )
    .sort(compareUsageWindows)[0];
  if (!exhausted) {
    return null;
  }
  const providerLabel = providerAccountUsageLabel(args.providerId);
  return {
    providerId: args.providerId,
    providerLabel,
    windowLabel: exhausted.label,
    usedPercent: exhausted.usedPercent,
    resetsAt: exhausted.resetsAt,
    message: `${providerLabel} ${exhausted.label.toLowerCase()} usage is at ${Math.round(exhausted.usedPercent)}%. New work is paused until ${formatResetPhrase(exhausted.resetsAt, now)}.`,
  };
}

export function isAccountUsageBlockingProvider(args: {
  providerId: ProviderId;
  model?: string;
  enabled: boolean;
  snapshot: RateLimitsSnapshotResponse | null | undefined;
  now?: number;
}): boolean {
  return (
    args.enabled &&
    resolveAccountUsageBlock({
      providerId: args.providerId,
      model: args.model,
      snapshot: args.snapshot,
      now: args.now,
    }) != null
  );
}

function unavailableClaude(): ClaudeUsageSnapshot {
  return {
    source: "unavailable",
    session: null,
    weekly: null,
    fableWeekly: null,
    error: null,
  };
}

function unavailableCodex(): RateLimitsSnapshotResponse["codex"] {
  return { source: "unavailable", buckets: [], error: null };
}

function unavailableCursor(): CursorUsageSnapshot {
  return {
    source: "unavailable",
    planType: null,
    monthly: null,
    buckets: [],
    error: null,
  };
}

function unavailableKiro(): KiroUsageSnapshot {
  return {
    source: "unavailable",
    planName: null,
    monthly: null,
    buckets: [],
    overagesEnabled: null,
    error: null,
  };
}

export function emptyRateLimitsSnapshot(): RateLimitsSnapshotResponse {
  return {
    claude: unavailableClaude(),
    codex: unavailableCodex(),
    cursor: unavailableCursor(),
    kiro: unavailableKiro(),
  };
}

export function mergeRateLimitsSnapshots(args: {
  current: RateLimitsSnapshotResponse | null;
  incoming: RateLimitsSnapshotResponse;
  providers?: readonly ProviderId[];
}): RateLimitsSnapshotResponse {
  if (!args.providers || args.providers.length === 0) {
    return args.incoming;
  }
  const next = { ...(args.current ?? emptyRateLimitsSnapshot()) };
  for (const providerId of args.providers) {
    if (providerId === "claude-code") {
      next.claude = args.incoming.claude;
    } else if (providerId === "codex") {
      next.codex = args.incoming.codex;
    } else if (providerId === "cursor") {
      next.cursor = args.incoming.cursor;
    } else {
      next.kiro = args.incoming.kiro;
    }
  }
  return next;
}
