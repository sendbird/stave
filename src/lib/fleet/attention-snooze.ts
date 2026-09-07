import { z } from "zod";

const Identity = z.string().trim().min(1).max(1000);
const Timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Expected an ISO timestamp.",
  });

/**
 * A snooze hides one Fleet attention row until its deadline passes. It is
 * deliberately time-bounded rather than a delete: Fleet only projects state that
 * lives elsewhere (a durable result, a notification, a pull request), so a
 * permanent Fleet-local dismissal would claim authority the surface does not
 * have. When the deadline passes the row comes back on its own.
 *
 * Rows are keyed by the deterministic attention id built in
 * `attention-projection.ts`, so the same request keeps the same key across
 * restarts and across the live/notification/result/pr source it happens to be
 * resolved from.
 */
export const FleetAttentionSnoozeSchema = z
  .object({
    attentionId: Identity,
    workspaceId: Identity,
    snoozedUntil: Timestamp,
    createdAt: Timestamp,
  })
  .strict();
export type FleetAttentionSnooze = z.infer<typeof FleetAttentionSnoozeSchema>;

export const SnoozeFleetAttentionArgsSchema = z
  .object({
    attentionId: Identity,
    workspaceId: Identity,
    snoozedUntil: Timestamp,
  })
  .strict();
export type SnoozeFleetAttentionArgs = z.infer<
  typeof SnoozeFleetAttentionArgsSchema
>;

export const ListFleetAttentionSnoozesArgsSchema = z
  .object({
    /** Evaluation instant. Defaults to now in the store when omitted. */
    now: Timestamp.optional(),
  })
  .strict();
export type ListFleetAttentionSnoozesArgs = z.infer<
  typeof ListFleetAttentionSnoozesArgsSchema
>;

export const ClearFleetAttentionSnoozesArgsSchema = z
  .object({
    /** Omit to clear every snooze; the caller decides the scope. */
    attentionIds: z.array(Identity).max(1000).optional(),
    workspaceIds: z.array(Identity).max(1000).optional(),
  })
  .strict();
export type ClearFleetAttentionSnoozesArgs = z.infer<
  typeof ClearFleetAttentionSnoozesArgsSchema
>;

export interface FleetAttentionSnoozeDuration {
  id: string;
  label: string;
  ms: number;
}

/**
 * Plain durations rather than calendar anchors. A "tomorrow morning" preset has
 * to guess a working day and a timezone, and guessing wrong hides a blocked
 * agent for longer than the user agreed to.
 */
export const FLEET_ATTENTION_SNOOZE_DURATIONS: readonly FleetAttentionSnoozeDuration[] =
  [
    { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
    { id: "4h", label: "4 hours", ms: 4 * 60 * 60 * 1000 },
    { id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
    { id: "1w", label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  ];

/** The duration a bulk `Clear` applies to rows that cannot be marked reviewed. */
export const FLEET_ATTENTION_CLEAR_SNOOZE_MS = 24 * 60 * 60 * 1000;

export function resolveSnoozeDeadline(args: {
  durationMs: number;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  return new Date(nowMs + Math.max(0, args.durationMs)).toISOString();
}

export function isFleetAttentionSnoozeActive(args: {
  snooze: Pick<FleetAttentionSnooze, "snoozedUntil">;
  nowMs: number;
}) {
  const deadline = Date.parse(args.snooze.snoozedUntil);
  return Number.isFinite(deadline) && deadline > args.nowMs;
}

/**
 * Ids whose snooze has not expired yet. Expired rows are ignored rather than
 * treated as an error: the store prunes them lazily, so a stale row read
 * between prunes must still let its item back into the projection.
 */
export function selectActiveFleetAttentionSnoozeIds(args: {
  snoozes: readonly FleetAttentionSnooze[];
  nowMs: number;
}): ReadonlySet<string> {
  const active = new Set<string>();
  for (const snooze of args.snoozes) {
    if (isFleetAttentionSnoozeActive({ snooze, nowMs: args.nowMs })) {
      active.add(snooze.attentionId);
    }
  }
  return active;
}
