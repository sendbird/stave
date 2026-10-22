import { z } from "zod";

/**
 * How a permission request was decided. A request is either answered by a
 * person in Stave (`user`), by a Stave rule (`rule`: the user's trusted
 * tools, autonomous mode, Stave's own tools, an unanswered request timing
 * out), or by the provider's own permission mode (`provider-auto`).
 */
export const APPROVAL_DECISIONS = ["allowed", "denied"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const APPROVAL_DECISION_SOURCES = ["user", "rule", "provider-auto"] as const;
export type ApprovalDecisionSource = (typeof APPROVAL_DECISION_SOURCES)[number];

/** The sources a provider event may report: a person's answer is recorded where it is given. */
export const APPROVAL_AUTOMATIC_SOURCES = ["rule", "provider-auto"] as const;
export type ApprovalAutomaticSource = (typeof APPROVAL_AUTOMATIC_SOURCES)[number];

/** Which rule or mode decided without a person, when Stave knows. */
export const APPROVAL_DECISION_REASONS = [
  /** A tool or command the user marked as trusted. */
  "trusted-tool",
  /** The turn is autonomous: Claude Auto or Bypass, or an agent runs the task. */
  "autonomy",
  /** The provider's permission mode answered it. */
  "permission-mode",
  /** Nobody answered before the request timed out. */
  "timeout",
  /** Stave's own prompt-free tools, approved by a setting. */
  "stave-tool",
  /** The provider's built-in browser, which the user asked for. */
  "provider-browser",
] as const;
export type ApprovalDecisionReason = (typeof APPROVAL_DECISION_REASONS)[number];

export const APPROVAL_SCOPES = ["once", "always"] as const;
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number];

/** A Stave rule answering a shown request through the same path a person uses. */
export interface ApprovalRuleDecider {
  source: "rule";
  reason: ApprovalDecisionReason;
}

export const ApprovalRuleDeciderSchema = z
  .object({ source: z.literal("rule"), reason: z.enum(APPROVAL_DECISION_REASONS) })
  .strict();

/** The recorded decision on an approval part. */
export interface ApprovalResolution {
  decision: ApprovalDecision;
  source: ApprovalDecisionSource;
  /** When it was decided (ISO 8601). */
  decidedAt: string;
  reason?: ApprovalDecisionReason;
  /** A person's allow: this call only, or also later ones the provider keeps. */
  scope?: ApprovalScope;
}

/**
 * The resolution as saved with a message. Lenient on load: a field this build
 * does not know reads as absent instead of failing the task's history.
 */
export const ApprovalResolutionSchema = z.object({
  decision: z.enum(APPROVAL_DECISIONS),
  source: z.enum(APPROVAL_DECISION_SOURCES),
  decidedAt: z.string().max(64),
  reason: z.enum(APPROVAL_DECISION_REASONS).optional().catch(undefined),
  scope: z.enum(APPROVAL_SCOPES).optional().catch(undefined),
});

/**
 * The normalized provider event for a permission request decided without a
 * person: the provider's permission mode or a Stave rule answered it as it
 * arrived, or a request shown to the user timed out. Replay records it on
 * the request's approval part, creating an unprompted one when none was shown.
 */
export interface ApprovalResolvedEvent {
  type: "approval_resolved";
  /** The request's id; for a tool call, the call's id. */
  requestId: string;
  toolName: string;
  /** What the call does, in one bounded line (a command or a path), when known. */
  input?: string;
  decision: ApprovalDecision;
  source: ApprovalAutomaticSource;
  reason?: ApprovalDecisionReason;
  /** ISO 8601. */
  decidedAt: string;
}

export const ApprovalResolvedEventSchema = z.object({
  type: z.literal("approval_resolved"),
  requestId: z.string(),
  toolName: z.string(),
  input: z.string().optional(),
  decision: z.enum(APPROVAL_DECISIONS),
  source: z.enum(APPROVAL_AUTOMATIC_SOURCES),
  reason: z.enum(APPROVAL_DECISION_REASONS).optional(),
  decidedAt: z.string(),
});

/** Bound for the one-line description of a call decided without asking. */
export const APPROVAL_RECORD_INPUT_MAX_CHARS = 240;

/** One line of at most `APPROVAL_RECORD_INPUT_MAX_CHARS`, or undefined when empty. */
export function boundApprovalRecordInput(value: string | undefined): string | undefined {
  const line = value?.replace(/\s+/g, " ").trim();
  if (!line) return undefined;
  return line.length > APPROVAL_RECORD_INPUT_MAX_CHARS ? `${line.slice(0, APPROVAL_RECORD_INPUT_MAX_CHARS - 1)}…` : line;
}

export function buildApprovalResolution(args: {
  approved: boolean;
  source: ApprovalDecisionSource;
  decidedAt: Date | number;
  reason?: ApprovalDecisionReason;
  scope?: ApprovalScope;
}): ApprovalResolution {
  return {
    decision: args.approved ? "allowed" : "denied",
    source: args.source,
    decidedAt: new Date(args.decidedAt).toISOString(),
    ...(args.reason ? { reason: args.reason } : {}),
    ...(args.approved && args.scope ? { scope: args.scope } : {}),
  };
}
