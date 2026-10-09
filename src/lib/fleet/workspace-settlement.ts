import type { WorkQueueLane } from "./work-attention-order";

/**
 * Settling: taking a workspace out of the Work queue once nothing in it needs
 * you, without touching the workspace itself.
 *
 * used by: `src/store/app-store-workspace-settlement-actions.ts` (state),
 * `src/components/layout/useSidebarWorkQueueGroups.ts` and
 * `src/components/layout/WorkQueueLaneList.tsx` (Work queue),
 * `tests/workspace-settlement.test.ts`.
 *
 * A settled workspace keeps its worktree, branch, conversation and terminals;
 * it only moves into the collapsed Settled section. It comes back by itself as
 * soon as there is new activity in it — a message, a turn, a result — and
 * anything that needs you (a question, an approval, a failed or running turn)
 * always stays in its lane, settled or not. Merely opening a settled workspace
 * to look does not bring it back.
 *
 * Two rules settle a workspace automatically, and both only touch a workspace
 * with nothing pending that the user is not standing in:
 *
 * - its pull request merged after the last message the user sent there, so a
 *   workspace the user kept working in after the merge stays put;
 * - nothing happened in it for the configured number of days.
 *
 * An automatic settle is stored like a manual one, so it does not flicker
 * back when the user only glances at the workspace, and an explicit "bring
 * back" restarts both rules from that moment.
 */

export type WorkspaceSettledReason = "manual" | "merged" | "inactive";

export interface WorkspaceSettlementRecord {
  /** When the workspace was settled; absent when it is not. */
  settledAt?: string;
  settledReason?: WorkspaceSettledReason;
  /** Hidden until this time, unless something happens first. */
  snoozedUntil?: string;
  snoozedAt?: string;
  /** The last explicit "bring back". Restarts both automatic rules. */
  unsettledAt?: string;
  /** The last message the user sent in the workspace. */
  lastMessageAt?: string;
  /** The user asked never to settle this workspace automatically. */
  autoSettleDisabled?: boolean;
}

export interface WorkspaceSettlementRules {
  settleOnMerge: boolean;
  /** Days without activity before settling; `null` turns the rule off. */
  settleAfterDays: number | null;
}

export const DEFAULT_WORKSPACE_SETTLE_AFTER_DAYS = 7;
export const WORKSPACE_SETTLE_AFTER_DAY_OPTIONS = [3, 7, 14, 30] as const;
const MAX_SETTLE_AFTER_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type WorkspaceSettlementView =
  | { state: "active" }
  | { state: "snoozed"; until: string }
  | { state: "settled"; reason: WorkspaceSettledReason; since: string };

/** What the Work queue knows about one workspace when it decides. */
export interface WorkspaceSettlementSignals {
  lane: WorkQueueLane;
  /** The workspace the user is standing in. */
  isActive: boolean;
  isDefault: boolean;
  pullRequest?: { state: "OPEN" | "CLOSED" | "MERGED"; mergedAt: string | null } | null;
  /** When the user last opened the workspace (`workspaceLastActiveAtById`). */
  lastOpenedAt?: string | null;
  /** The newest `updatedAt` among its open tasks, when they are loaded. */
  lastTaskActivityAt?: string | null;
  /**
   * When its newest unreviewed result arrived. PR-state attention is left out
   * on purpose: it is recomputed on every refresh, so its time says nothing
   * about new work.
   */
  lastResultAt?: string | null;
}

function toMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestMs(...values: Array<string | null | undefined>): number | null {
  let latest: number | null = null;
  for (const value of values) {
    const ms = toMs(value);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

/** Activity that brings a settled or snoozed workspace back: not a mere visit. */
function lastActivityMs(record: WorkspaceSettlementRecord, signals: WorkspaceSettlementSignals) {
  return latestMs(
    record.lastMessageAt,
    record.unsettledAt,
    signals.lastTaskActivityAt,
    signals.lastResultAt,
  );
}

function isLive(lane: WorkQueueLane) {
  return lane === "action-required" || lane === "in-progress";
}

/** Where the Work queue shows a workspace right now. */
export function resolveWorkspaceSettlement(args: {
  record?: WorkspaceSettlementRecord;
  signals: WorkspaceSettlementSignals;
  nowMs: number;
}): WorkspaceSettlementView {
  const record = args.record ?? {};
  if (isLive(args.signals.lane)) return { state: "active" };
  const activityMs = lastActivityMs(record, args.signals);
  const since = (atMs: number | null) => atMs !== null && activityMs !== null && activityMs > atMs;

  const untilMs = toMs(record.snoozedUntil);
  if (record.snoozedUntil && untilMs !== null && untilMs > args.nowMs && !since(toMs(record.snoozedAt))) {
    return { state: "snoozed", until: record.snoozedUntil };
  }
  const settledMs = toMs(record.settledAt);
  if (record.settledAt && settledMs !== null && !since(settledMs)) {
    return { state: "settled", reason: record.settledReason ?? "manual", since: record.settledAt };
  }
  return { state: "active" };
}

/**
 * The rule that would settle a workspace now, or null. Only consulted for a
 * workspace that `resolveWorkspaceSettlement` shows as active.
 */
export function findAutoSettleReason(args: {
  record?: WorkspaceSettlementRecord;
  signals: WorkspaceSettlementSignals;
  rules: WorkspaceSettlementRules;
  nowMs: number;
}): Exclude<WorkspaceSettledReason, "manual"> | null {
  const record = args.record ?? {};
  const { signals, rules } = args;
  if (record.autoSettleDisabled || signals.isActive || signals.isDefault) return null;
  if (signals.lane !== "idle") return null;
  // An open pull request is work in flight even when nobody touched it.
  if (signals.pullRequest?.state === "OPEN") return null;

  if (rules.settleOnMerge && signals.pullRequest?.state === "MERGED") {
    const mergedMs = toMs(signals.pullRequest.mergedAt);
    const userMs = latestMs(record.lastMessageAt, record.unsettledAt);
    if (mergedMs !== null && (userMs === null || mergedMs >= userMs)) return "merged";
  }

  const days = normalizeWorkspaceSettleAfterDays(rules.settleAfterDays);
  if (days !== null) {
    const engagedMs = latestMs(
      signals.lastOpenedAt,
      signals.lastTaskActivityAt,
      signals.lastResultAt,
      record.lastMessageAt,
      record.unsettledAt,
    );
    if (engagedMs !== null && args.nowMs - engagedMs >= days * DAY_MS) return "inactive";
  }
  return null;
}

export function normalizeWorkspaceSettleAfterDays(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WORKSPACE_SETTLE_AFTER_DAYS;
  }
  return Math.min(MAX_SETTLE_AFTER_DAYS, Math.max(1, Math.round(value)));
}

/* ─── Record changes ─────────────────────────────────────────────── */

export function settleWorkspaceRecord(
  record: WorkspaceSettlementRecord | undefined,
  reason: WorkspaceSettledReason,
  at: string,
): WorkspaceSettlementRecord {
  const { snoozedUntil: _until, snoozedAt: _snoozedAt, ...rest } = record ?? {};
  return { ...rest, settledAt: at, settledReason: reason };
}

/** Back in the queue now; both automatic rules start over from here. */
export function unsettleWorkspaceRecord(
  record: WorkspaceSettlementRecord | undefined,
  at: string,
): WorkspaceSettlementRecord {
  const {
    settledAt: _settledAt,
    settledReason: _reason,
    snoozedUntil: _until,
    snoozedAt: _snoozedAt,
    ...rest
  } = record ?? {};
  return { ...rest, unsettledAt: at };
}

export function snoozeWorkspaceRecord(
  record: WorkspaceSettlementRecord | undefined,
  until: string,
  at: string,
): WorkspaceSettlementRecord {
  const { settledAt: _settledAt, settledReason: _reason, ...rest } = record ?? {};
  return { ...rest, snoozedUntil: until, snoozedAt: at };
}

export function noteWorkspaceMessage(
  current: Record<string, WorkspaceSettlementRecord>,
  workspaceId: string | null | undefined,
  at: string,
): Record<string, WorkspaceSettlementRecord> {
  const id = workspaceId?.trim();
  if (!id || current[id]?.lastMessageAt === at) return current;
  return { ...current, [id]: { ...current[id], lastMessageAt: at } };
}

/* ─── Snooze presets ─────────────────────────────────────────────── */

export type WorkspaceSnoozePreset = "hour" | "tomorrow" | "next-week";

export const WORKSPACE_SNOOZE_PRESETS: readonly WorkspaceSnoozePreset[] = [
  "hour",
  "tomorrow",
  "next-week",
];

const SNOOZE_MORNING_HOUR = 9;

/** In local time: an hour from now, tomorrow 9:00, or next Monday 9:00. */
export function resolveWorkspaceSnoozeUntil(preset: WorkspaceSnoozePreset, now: Date): Date {
  if (preset === "hour") return new Date(now.getTime() + 60 * 60 * 1_000);
  const target = new Date(now);
  target.setHours(SNOOZE_MORNING_HOUR, 0, 0, 0);
  if (preset === "tomorrow") {
    target.setDate(target.getDate() + 1);
    return target;
  }
  // Days until the next Monday, never today.
  const daysUntilMonday = ((8 - target.getDay()) % 7) || 7;
  target.setDate(target.getDate() + daysUntilMonday);
  return target;
}

/* ─── Persistence ────────────────────────────────────────────────── */

function readIso(value: unknown): string | undefined {
  return typeof value === "string" && toMs(value) !== null ? value : undefined;
}

/**
 * Reads the persisted map back, keeping only well-formed fields, and drops
 * workspaces nothing remembers: workspace ids derive from paths, so a removed
 * and re-added worktree must not inherit an old settle.
 */
export function normalizeWorkspaceSettlementMap(
  value: unknown,
  knownWorkspaceIds?: ReadonlySet<string>,
): Record<string, WorkspaceSettlementRecord> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, WorkspaceSettlementRecord> = {};
  for (const [workspaceId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (knownWorkspaceIds && !knownWorkspaceIds.has(workspaceId)) continue;
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const record: WorkspaceSettlementRecord = {};
    const settledAt = readIso(source.settledAt);
    if (settledAt) {
      record.settledAt = settledAt;
      record.settledReason =
        source.settledReason === "merged" || source.settledReason === "inactive"
          ? source.settledReason
          : "manual";
    }
    const snoozedUntil = readIso(source.snoozedUntil);
    if (snoozedUntil) {
      record.snoozedUntil = snoozedUntil;
      record.snoozedAt = readIso(source.snoozedAt) ?? snoozedUntil;
    }
    const unsettledAt = readIso(source.unsettledAt);
    if (unsettledAt) record.unsettledAt = unsettledAt;
    const lastMessageAt = readIso(source.lastMessageAt);
    if (lastMessageAt) record.lastMessageAt = lastMessageAt;
    if (source.autoSettleDisabled === true) record.autoSettleDisabled = true;
    if (Object.keys(record).length > 0) result[workspaceId] = record;
  }
  return result;
}
