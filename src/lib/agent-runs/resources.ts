import { z } from "zod";
import type { AgentRunEvent } from "./domain";
import { listCodexReasoningEffortsForModel } from "../providers/model-catalog";

const Id = z.string().trim().min(1).max(256);
export const AdaptiveRoutingIntentSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  modelProviderId: z.enum(["claude-code", "codex", "cursor", "kiro"]).optional(),
  autoRouting: z.boolean().optional(),
  claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  codexReasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
  claudeAccountProfileId: z.string().min(1).max(200).optional(),
  codexAccountProfileId: z.string().min(1).max(200).optional(),
}).strict();
export type AdaptiveRoutingIntent = z.infer<typeof AdaptiveRoutingIntentSchema>;
export const AdaptiveRunPolicySchema = z.object({
  version: z.literal(1), profile: z.literal("balanced"),
  providerId: z.enum(["claude-code", "codex"]),
  allowedModels: z.array(z.string().trim().min(1).max(200)).min(1).max(64),
  modelLocked: z.boolean(), effortLocked: z.boolean(),
  accountProfileId: z.string().min(1).max(200).optional(),
  initialEffort: z.string().max(40).nullable(),
  teamTurns: z.number().int().min(1).max(30),
  concurrentHelpers: z.literal(2), totalHelpers: z.literal(4), parentReserve: z.literal(1),
  maxChanges: z.literal(2), cooldownTurns: z.literal(2),
}).strict();
export type AdaptiveRunPolicy = z.infer<typeof AdaptiveRunPolicySchema>;

/** Helpers can narrow frozen team authority, never obtain fresh wider settings. */
export function constrainHelperResources(root: AdaptiveRunPolicy, child: AdaptiveRunPolicy, model: string): AdaptiveRunPolicy {
  if (child.providerId !== root.providerId) throw new Error("This adaptive team must keep its frozen provider.");
  const allowedModels = child.allowedModels.filter((id) => root.allowedModels.includes(id));
  if (!allowedModels.includes(model)) throw new Error("The helper model is outside the parent's frozen eligible catalog.");
  if (root.effortLocked && child.effortLocked && child.initialEffort !== root.initialEffort) throw new Error("The helper effort conflicts with the parent's pin.");
  if (root.effortLocked && root.providerId === "codex" && root.initialEffort &&
      !listCodexReasoningEffortsForModel({ model }).some((effort) => effort === root.initialEffort))
    throw new Error("The helper model cannot preserve the parent's effort pin.");
  return AdaptiveRunPolicySchema.parse({ ...child, allowedModels, accountProfileId: root.accountProfileId,
    modelLocked: root.modelLocked || child.modelLocked, effortLocked: root.effortLocked || child.effortLocked,
    initialEffort: root.effortLocked ? root.initialEffort : child.initialEffort, teamTurns: root.teamTurns });
}

export const ResourceLinkSchema = z.object({ rootRunId: Id, reservationId: Id, executionId: Id }).strict();
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;
export const AgentResourceRequestObjectSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
  reason: z.enum(["capability-mismatch", "mechanical-step"]),
  rationale: z.string().trim().min(1).max(500),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
}).strict();
export const AgentResourceRequestSchema = AgentResourceRequestObjectSchema.refine((request) => Boolean(request.model || request.effort), "Request a model or effort change.");
export type AgentResourceRequest = z.infer<typeof AgentResourceRequestSchema>;

const ReservationSchema = z.object({
  reservationId: Id, executionId: Id, childRunId: Id,
  capacity: z.number().int().min(1).max(30),
}).strict();
export type ResourceReservation = z.infer<typeof ReservationSchema> & { consumed: number; released: boolean };
const BudgetEventSchema = z.discriminatedUnion("operation", [
  ReservationSchema.extend({ operation: z.literal("reserve") }).strict(),
  z.object({ operation: z.literal("consume"), ownerRunId: Id, reservationId: Id.nullable() }).strict(),
  z.object({ operation: z.literal("release"), reservationId: Id, executionId: Id }).strict(),
]);

export interface AgentResourceSnapshot {
  rootRunId: string;
  policy: AdaptiveRunPolicy;
  memberPolicy?: AdaptiveRunPolicy;
  spent: number;
  reserved: number;
  remaining: number;
  helpersLaunched: number;
  activeHelpers: number;
  reservations: ResourceReservation[];
}

/** A projection of keyed Run events, never a second ledger or scheduler. */
export function projectResourceBudget(rootRunId: string, policy: AdaptiveRunPolicy, events: readonly AgentRunEvent[]): AgentResourceSnapshot {
  let spent = 0;
  const reservations = new Map<string, ResourceReservation>(), seen = new Set<string>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.agentRunId !== rootRunId || event.kind !== "resource-budget" || !event.idempotencyKey || seen.has(event.idempotencyKey)) continue;
    seen.add(event.idempotencyKey);
    const parsed = BudgetEventSchema.safeParse(event.detail);
    if (!parsed.success) throw new Error("The persisted resource budget is invalid; no further admission is safe.");
    const value = parsed.data;
    if (value.operation === "reserve") {
      if (reservations.has(value.reservationId)) throw new Error("The resource reservation identity was reused.");
      reservations.set(value.reservationId, { ...value, consumed: 0, released: false });
    } else if (value.operation === "consume") {
      if (value.reservationId === null) {
        if (value.ownerRunId !== rootRunId) throw new Error("The root admission belongs to another Run.");
      } else {
        const reservation = reservations.get(value.reservationId);
        if (!reservation || reservation.released || reservation.childRunId !== value.ownerRunId || reservation.consumed >= reservation.capacity)
          throw new Error("The child admission does not match its live reservation.");
        reservation.consumed += 1;
      }
      spent += 1;
    } else {
      const reservation = reservations.get(value.reservationId);
      if (!reservation || reservation.executionId !== value.executionId) throw new Error("The release belongs to another execution.");
      reservation.released = true;
    }
  }
  const rows = [...reservations.values()];
  const reserved = rows.filter((row) => !row.released).reduce((sum, row) => sum + row.capacity - row.consumed, 0);
  if (spent + reserved > policy.teamTurns) throw new Error("The saved resource budget exceeds its limit.");
  return { rootRunId, policy, spent, reserved, remaining: policy.teamTurns - spent - reserved,
    helpersLaunched: rows.length, activeHelpers: rows.filter((row) => !row.released).length, reservations: rows };
}

export function readRunResourceConfig(events: readonly AgentRunEvent[]): { policy: AdaptiveRunPolicy; link: ResourceLink | null } | null {
  const event = events.find((row) => row.kind === "agent-run-started");
  if (!event || !("resources" in event.detail)) return null;
  return { policy: AdaptiveRunPolicySchema.parse(event.detail.resources),
    link: event.detail.resourceLink === undefined ? null : ResourceLinkSchema.parse(event.detail.resourceLink) };
}
