import { z } from "zod";
import type { AgentRunEvent } from "./domain";
import { listCodexReasoningEffortsForModel } from "../providers/model-catalog";
import type { ProviderModelCatalogEntry } from "../providers/provider.types";

export type AdaptiveModelCatalog = readonly Pick<ProviderModelCatalogEntry, "model" | "supportedEfforts">[];

/** Account-scoped advertised support wins; empty lists do not advertise support. */
export function supportsAdaptiveEffort(providerId: "claude-code" | "codex", model: string, effort: string | null, catalog?: AdaptiveModelCatalog | null): boolean {
  if (!effort) return true;
  const advertised = catalog?.find((entry) => entry.model === model)?.supportedEfforts;
  if (advertised?.length) return advertised.includes(effort);
  return providerId !== "codex" || listCodexReasoningEffortsForModel({ model }).some((value) => value === effort);
}

const Id = z.string().trim().min(1).max(256);
export const AdaptiveRoutingIntentSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  modelProviderId: z.enum(["claude-code", "codex", "cursor", "kiro", "opencode"]).optional(),
  autoRouting: z.boolean().optional(),
  claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  codexReasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
  claudeAccountProfileId: z.string().min(1).max(200).optional(),
  codexAccountProfileId: z.string().min(1).max(200).optional(),
}).strict();
export type AdaptiveRoutingIntent = z.infer<typeof AdaptiveRoutingIntentSchema>;

/**
 * The team limits every Agent run freezes when it starts: how many helper
 * Agents it can call and how often it may change model or effort. Settings
 * holds the helper limits; the rest is fixed. The parent and its helpers also
 * share one guard against loops (`maxTeamTurns`), which is not a budget.
 */
export const TEAM_LIMITS = {
  concurrentHelpers: { default: 3, min: 1, max: 6 },
  totalHelpers: { default: 8, min: 1, max: 20 },
  /**
   * `AGENT_RUN_LIMITS.safetyTurnCeiling`, shared by the parent and its helpers;
   * `domain.ts` imports this module, so the value is not imported back.
   */
  maxTeamTurns: 200,
  /**
   * Turns a helper holds when it starts: its first turn and one reminder.
   * Later turns draw from the shared budget as they start, so one helper never
   * holds turns another helper or the parent could use.
   */
  helperStartTurns: 2,
} as const;
export type TeamLimitKey = "concurrentHelpers" | "totalHelpers";

/** A settings value as a helper limit: an integer inside its range, else the default. */
export function clampTeamLimit(key: TeamLimitKey, value: unknown): number {
  const range = TEAM_LIMITS[key];
  return typeof value === "number" && Number.isInteger(value) ? Math.min(range.max, Math.max(range.min, value)) : range.default;
}

/**
 * Version 1 is the opt-in "Auto adjust" policy (2 / 4 helpers); runs that
 * froze it keep those numbers. Version 2 is the default policy of every Agent
 * run, with helper limits from Settings. The saved `teamTurns` of either no
 * longer bounds the team: every team shares `maxTeamTurns`.
 */
export const AdaptiveRunPolicySchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]), profile: z.literal("balanced"),
  providerId: z.enum(["claude-code", "codex"]),
  allowedModels: z.array(z.string().trim().min(1).max(200)).min(1).max(64),
  modelLocked: z.boolean(), effortLocked: z.boolean(),
  /** Explicit execution choice; absent retains the app-wide Auto toggle. */
  autoRouting: z.boolean().optional(),
  accountProfileId: z.string().min(1).max(200).optional(),
  initialEffort: z.string().max(40).nullable(),
  teamTurns: z.number().int().min(1).max(TEAM_LIMITS.maxTeamTurns),
  concurrentHelpers: z.number().int().min(TEAM_LIMITS.concurrentHelpers.min).max(TEAM_LIMITS.concurrentHelpers.max),
  totalHelpers: z.number().int().min(TEAM_LIMITS.totalHelpers.min).max(TEAM_LIMITS.totalHelpers.max),
  parentReserve: z.literal(1), maxChanges: z.literal(2), cooldownTurns: z.literal(2),
}).strict();
export type AdaptiveRunPolicy = z.infer<typeof AdaptiveRunPolicySchema>;

/**
 * Whether a helper must run on the parent's provider: only for a version 1
 * policy. A pinned model or effort covers the run's own turns, not its team,
 * so a helper Agent runs on its own provider and a review can go to the other one.
 */
export function helperKeepsParentProvider(root: Pick<AdaptiveRunPolicy, "version">): boolean {
  return root.version === 1;
}

/**
 * Helpers can narrow frozen team authority, never obtain fresh wider settings.
 * The parent's model and effort pins stay with the parent: a helper keeps only
 * its own pins (its Agent's fixed model, or a model the parent named for it).
 */
export function constrainHelperResources(root: AdaptiveRunPolicy, child: AdaptiveRunPolicy, model: string): AdaptiveRunPolicy {
  if (child.providerId !== root.providerId) {
    if (helperKeepsParentProvider(root)) throw new Error("This team must keep its provider.");
    // Another provider: the child's own catalog, account and effort; the team's shared limits.
    if (!child.allowedModels.includes(model)) throw new Error("The helper model is outside its own eligible catalog.");
    return AdaptiveRunPolicySchema.parse({ ...child, autoRouting: root.autoRouting, version: root.version, teamTurns: root.teamTurns,
      concurrentHelpers: root.concurrentHelpers, totalHelpers: root.totalHelpers });
  }
  const allowedModels = child.allowedModels.filter((id) => root.allowedModels.includes(id));
  if (!allowedModels.includes(model)) throw new Error("The helper model is outside the parent's frozen eligible catalog.");
  return AdaptiveRunPolicySchema.parse({ ...child, autoRouting: root.autoRouting, allowedModels, accountProfileId: root.accountProfileId,
    version: root.version, teamTurns: root.teamTurns, concurrentHelpers: root.concurrentHelpers, totalHelpers: root.totalHelpers });
}

export const ResourceLinkSchema = z.object({ rootRunId: Id, reservationId: Id, executionId: Id }).strict();
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;
export const AgentResourceRequestObjectSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
  /** `user-request` relays the user's explicit model or effort instruction from a cited turn. */
  reason: z.enum(["capability-mismatch", "mechanical-step", "user-request"]),
  rationale: z.string().trim().min(1).max(500),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
}).strict();
export const AgentResourceRequestSchema = AgentResourceRequestObjectSchema.refine((request) => Boolean(request.model || request.effort), "Request a model or effort change.");
export type AgentResourceRequest = z.infer<typeof AgentResourceRequestSchema>;

/**
 * A helper's admission. `capacity` is the turns it holds from the start; a
 * helper that used them draws each further turn from the shared budget.
 * Reservations saved before that change hold up to 30 turns and still parse.
 */
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
  /** The team's guard against loops, `TEAM_LIMITS.maxTeamTurns`, whatever the policy saved. */
  teamTurns: number;
  spent: number;
  reserved: number;
  remaining: number;
  helpersLaunched: number;
  activeHelpers: number;
  reservations: ResourceReservation[];
}

/**
 * A projection of keyed Run events, never a second ledger or scheduler. A
 * team's turns count against `maxTeamTurns` only, whatever its policy saved:
 * runs that froze a smaller number before turn counts stopped bounding work
 * continue too.
 */
export function projectResourceBudget(rootRunId: string, policy: AdaptiveRunPolicy, events: readonly AgentRunEvent[]): AgentResourceSnapshot {
  const teamTurns: number = TEAM_LIMITS.maxTeamTurns;
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
        // Turns past the held capacity were drawn from the shared budget when they started.
        if (!reservation || reservation.released || reservation.childRunId !== value.ownerRunId)
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
  const reserved = rows.filter((row) => !row.released).reduce((sum, row) => sum + Math.max(0, row.capacity - row.consumed), 0);
  if (spent + reserved > teamTurns) throw new Error("The saved resource budget exceeds its limit.");
  return { rootRunId, policy, teamTurns, spent, reserved, remaining: teamTurns - spent - reserved,
    helpersLaunched: rows.length, activeHelpers: rows.filter((row) => !row.released).length, reservations: rows };
}

export function readRunResourceConfig(events: readonly AgentRunEvent[]): { policy: AdaptiveRunPolicy; link: ResourceLink | null } | null {
  const event = events.find((row) => row.kind === "agent-run-started");
  if (!event || !("resources" in event.detail)) return null;
  return { policy: AdaptiveRunPolicySchema.parse(event.detail.resources),
    link: event.detail.resourceLink === undefined ? null : ResourceLinkSchema.parse(event.detail.resourceLink) };
}
