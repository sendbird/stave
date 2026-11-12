import { z } from "zod";
import { TarsWorkspaceActionSchema } from "./workspace-action";
import { TarsCompletionGoalSchema } from "./completion";
import { AttachmentContextsSchema, type AttachmentContext } from "../providers/attachment-context";
import { SecondaryRunRuntimeHintsSchema } from "../runs/secondary-run";
import {
  TARS_MESSAGE_ATTACHMENTS_MAX, TARS_MESSAGE_MAX_CHARS, TarsActivitySchema, TarsAttachmentSummarySchema, type TarsAttachmentSummary,
  TarsAgentIdSchema, TarsControlInputSchema, TarsControlOperationSchema, TarsSnapshotSchema, TarsStageWaitSchema,
  tarsControlInputProblem,
} from "./types";
import { TarsEventSchema, TarsFollowUpReasonSchema } from "./events";
import { TarsPublishActionSchema, TarsPublishReasonSchema, TarsPublishRecordSchema } from "./publication";
import { TarsClearActionSchema, TarsClearRecordSchema, TarsConversationViewSchema } from "./clearing";
import {
  TARS_CONFIRMED_OPERATIONS, TARS_IRREVERSIBLE_OPERATIONS, TarsAutonomyLevelSchema, TarsNeverRuleMatchSchema, TarsNeverRulesSchema, TarsAllowRulesSchema, tarsActionKey,
} from "./autonomy";
import { TarsScheduleActionSchema, TarsScheduleReasonSchema, TarsScheduleRecordSchema, TarsScheduleRunSchema } from "./schedules";

import { TarsActionUndoSchema, TarsUndoActionRefusalSchema } from "./action-undo";

const IdSchema = z.string().trim().min(1).max(256);
const RevisionSchema = z.number().int().min(1);
const ErrorSchema = z.string().trim().min(1).max(2_000);
const TimestampSchema = z.iso.datetime();
/** Stated to the model and enforced on every saved reply. */
export const TARS_REPLY_MAX_CHARS = 8_000;
/** Stated to the model; a longer delegation reason is cut. */
export const TARS_DELEGATION_REASON_MAX_CHARS = 200;

/**
 * The global conversation accepts the user's words, immutable attachment snapshots, retry identity and
 * one per-message choice: `includeWorkingChanges` starts the work this message
 * admits from the target workspace's uncommitted changes, which the host
 * snapshots at admission. Optional so earlier messages still parse; absent or
 * false starts from the branch.
 */
const messageInputShape = {
  requestId: IdSchema,
  text: z.string().trim().max(TARS_MESSAGE_MAX_CHARS),
  attachments: AttachmentContextsSchema.optional(),
  includeWorkingChanges: z.boolean().optional(),
};
const hasContent = (message: { text: string; attachments?: readonly unknown[] }) => Boolean(message.text || message.attachments?.length);
export const TarsMessageInputSchema = z.object(messageInputShape).strict().refine(hasContent);
export type TarsMessageInput = z.infer<typeof TarsMessageInputSchema>;

/** Tars executes only on these providers; the rest are explicitly unsupported. */
export const TARS_EXECUTION_PROVIDERS = ["claude-code", "codex"] as const;
/** At most as many as the agent library can save. */
export const TARS_MAX_ALLOWED_AGENTS = 50;

/** An explicit execution pin. Absent: delegated work runs on automatic routing. */
export const TarsExecutionModelSchema = z.object({
  providerId: z.enum(TARS_EXECUTION_PROVIDERS),
  model: z.string().trim().min(1).max(200),
}).strict();
export type TarsExecutionModel = z.infer<typeof TarsExecutionModelSchema>;

/**
 * Persisted independently of workspace selection; copied immutably into every
 * admitted message. `providerId`, `model` and `runtimeHints` are the
 * conversation's reasoning choice. `executionModel` pins delegated work;
 * `allowedAgentIds` lists the saved agents the user allowed (built-ins are
 * always allowed). Both are optional so an absent value keeps the default.
 */
export const TarsConversationSettingsSchema = z.object({
  providerId: z.enum(TARS_EXECUTION_PROVIDERS),
  model: z.string().trim().min(1).max(200),
  runtimeHints: SecondaryRunRuntimeHintsSchema.optional(),
  maxTurns: z.number().int().min(1).max(100),
  executionModel: TarsExecutionModelSchema.optional(),
  /** Portfolio admission limit, not a per-run turn budget. 0/absent means no extra cap. */
  maxConcurrentResponsibilities: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  allowedAgentIds: z.array(TarsAgentIdSchema).max(TARS_MAX_ALLOWED_AGENTS)
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((ids) => new Set(ids).size === ids.length, "Each allowed agent is listed once.").optional(),
  /** How independently Tars acts (`autonomy.ts`). Absent on profiles saved before levels existed: the default level. */
  autonomy: TarsAutonomyLevelSchema.optional(),
  /** The user's "never do" rules: hard constraints for the planner and a reason for the host to ask first. Absent: none. */
  neverDo: TarsNeverRulesSchema.optional(),
  /** Standing permissions, read from current settings at admission so removal takes effect immediately. */
  allowRules: TarsAllowRulesSchema.optional(),
}).strict();
export type TarsConversationSettings = z.infer<typeof TarsConversationSettingsSchema>;

/**
 * One control vocabulary for words, clicks and keys. `takeover` hands the work
 * to the user; only an explicit `handBack` returns it, never `resume`.
 */
export { TarsControlOperationSchema, type TarsControlOperation } from "./types";

/**
 * Why the host refused a control. The interface translates the code; the
 * English `error` beside it is a diagnostic only. `unknown` covers any
 * failure without a specific rule, such as an unreadable run.
 */
export const TarsControlReasonSchema = z.enum([
  "notOwned", "stale", "ended", "takenOver", "alreadyPaused", "notResumable", "alreadyTakenOver",
  "notTakenOver", "notAcceptable", "outOfScope", "ownershipLost", "runEnded", "runHeld", "unknown",
  // An automatic follow-up asked for something only the user may start (see `tarsFollowUpRefusal`).
  "notByFollowUp",
  // A priority change or queue move: only queued work moves, and work already at that end of the queue cannot move further.
  "notQueued", "queueEdge",
  // Start now: only queued work that has not started can start ahead of the queue.
  "notStartable",
  // A run command (extend, retry, skip, sign off) or a resume the run itself refused in its current state.
  "runRefused",
  // A run command on work the user paused through Tars: resume it first.
  "resumeFirst",
  // A task operation named a request no longer waiting in the task.
  "requestUnavailable",
  // A message while a turn runs in the task: it is said in the task, or after the turn.
  "taskBusy",
]);
export type TarsControlReason = z.infer<typeof TarsControlReasonSchema>;

/**
 * Why the host refused a delegate action: its agent does not exist or is
 * archived, the user has not allowed it, it publishes or delivers outside the
 * workspace (which needs a separate request), it cannot take delegated work on
 * Claude or Codex, it conflicts with the pinned execution model, or it would
 * exceed the delegated permission ceiling; or the user's working changes,
 * which the message asked to include, could not be snapshotted. Attachments
 * without a written user mandate cannot authorize delegation, and a unit that
 * names an attachment its message does not have is refused.
 */
export const TarsDelegateReasonSchema = z.enum([
  "missingMandate",
  "agentUnknown", "agentNotAllowed", "agentPublishes", "agentNotDelegable", "agentModelConflict", "agentOverCap",
  // The message asked to include the user's working changes, and the host could not snapshot them.
  "workingChangesUnavailable",
  // Tars gave the unit an attachment position the message does not have.
  "attachmentUnknown",
]);
export type TarsDelegateReason = z.infer<typeof TarsDelegateReasonSchema>;
/** A publish proposal refused when it was made carries a `TarsPublishReason`, a schedule proposal a `TarsScheduleReason`. */
export const TarsActionReasonSchema = z.union([TarsControlReasonSchema, TarsDelegateReasonSchema, TarsPublishReasonSchema, TarsScheduleReasonSchema]);
export type TarsActionReason = z.infer<typeof TarsActionReasonSchema>;

/** Fixed across the host boundary: a saved agent cannot be judged until the renderer syncs the catalog. */
// i18n-ignore: protocol diagnostic matched by callers, never rendered
export const TARS_AGENT_CATALOG_PENDING_MESSAGE = "Saved agents have not been loaded yet. The decision stays pending and will be retried.";

/** Fixed across the host boundary so callers can recognize a retryable lock wait. */
// i18n-ignore: protocol diagnostic matched by callers, never rendered
export const TARS_STORAGE_BUSY_MESSAGE = "The representative's database stayed busy. The unsettled work remains saved and will be retried.";

export const TarsControlActionSchema = z.object({
  kind: z.literal("control"),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  operation: TarsControlOperationSchema,
  /** Only on task operations (approve, deny, answer, message, requestChanges); see `tarsControlInputProblem`. */
  input: TarsControlInputSchema.optional(),
}).strict().superRefine((action, context) => {
  const problem = tarsControlInputProblem(action.operation, action.input);
  if (problem) context.addIssue({ code: "custom", message: problem, path: ["input"] });
});
export type TarsControlAction = z.infer<typeof TarsControlActionSchema>;

// Defined with the autonomy levels, which are read from the same sets (`autonomy.ts`).
export { TARS_CONFIRMED_OPERATIONS, TARS_IRREVERSIBLE_OPERATIONS };
export function tarsConfirmationRequestId(messageId: string, actionIndex: number) {
  return `confirm:${messageId}:${actionIndex}`;
}
export function parseTarsConfirmationRequestId(requestId: string): { messageId: string; actionIndex: number } | null {
  const match = /^confirm:(.+):([0-7])$/.exec(requestId);
  return match ? { messageId: match[1]!, actionIndex: Number(match[2]) } : null;
}

/** How an answer was given: a click, a key on the focused card, or a short answer bound to the one waiting decision. */
export const TarsAnswerSourceSchema = z.enum(["click", "key", "words"]);
export type TarsAnswerSource = z.infer<typeof TarsAnswerSourceSchema>;

/**
 * What choosing an ask option does: a control on one responsibility at its
 * revision (the host admits it as it admits a click), or `reply`, which sends
 * the chosen option back to Tars as the user's answer. Nothing else.
 */
export const TarsAskEffectSchema = z.discriminatedUnion("kind", [
  TarsControlActionSchema,
  z.object({ kind: z.literal("reply") }).strict(),
]);
export type TarsAskEffect = z.infer<typeof TarsAskEffectSchema>;

export const TARS_ASK_MIN_OPTIONS = 2;
export const TARS_ASK_MAX_OPTIONS = 4;

export const TarsAskOptionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  rationale: z.string().trim().min(1).max(200),
  effect: TarsAskEffectSchema,
}).strict();
export type TarsAskOption = z.infer<typeof TarsAskOptionSchema>;

/**
 * A question with 2–4 options. It grants nothing by itself: only the user's
 * choice applies an option's effect, through the same host check as a click.
 */
export const TarsAskActionSchema = z.object({
  kind: z.literal("ask"),
  question: z.string().trim().min(1).max(500),
  options: z.array(TarsAskOptionSchema).min(TARS_ASK_MIN_OPTIONS).max(TARS_ASK_MAX_OPTIONS),
  recommended: z.number().int().min(0).max(TARS_ASK_MAX_OPTIONS - 1).optional(),
}).strict().superRefine((ask, context) => {
  // i18n-ignore: schema diagnostic, not user-facing copy
  if (ask.recommended !== undefined && ask.recommended >= ask.options.length) context.addIssue({ code: "custom", message: "The recommended option does not exist." });
  const labels = ask.options.map((option) => option.label.toLocaleLowerCase());
  // i18n-ignore: schema diagnostic, not user-facing copy
  if (new Set(labels).size !== labels.length) context.addIssue({ code: "custom", message: "Each option needs its own label." });
  const controls = ask.options.flatMap((option) => option.effect.kind === "control" ? [`${option.effect.responsibilityId}:${option.effect.operation}`] : []);
  // i18n-ignore: schema diagnostic, not user-facing copy
  if (new Set(controls).size !== controls.length) context.addIssue({ code: "custom", message: "Two options apply the same control." });
});
export type TarsAskAction = z.infer<typeof TarsAskActionSchema>;

/** Whether an ask option's effect cannot be undone. */
export function isTarsIrreversibleEffect(effect: TarsAskEffect) {
  return effect.kind === "control" && TARS_IRREVERSIBLE_OPERATIONS.has(effect.operation);
}

/** The ask with any recommendation of an irreversible option dropped; the question itself is kept. */
export function withoutIrreversibleRecommendation(ask: TarsAskAction): TarsAskAction {
  if (ask.recommended === undefined || !isTarsIrreversibleEffect(ask.options[ask.recommended]!.effect)) return ask;
  const { recommended: _dropped, ...rest } = ask;
  return rest;
}

/** What a `show` action opens in the Tars side view. */
export const TarsShowViewSchema = z.enum(["report", "changes", "timeline", "review"]);
export type TarsShowView = z.infer<typeof TarsShowViewSchema>;

/**
 * Opens the side view on one of the user's Tars responsibilities. View-only:
 * it grants no authority and changes no work; its receipt only says it opened.
 */
export const TarsShowActionSchema = z.object({
  kind: z.literal("show"),
  responsibilityId: IdSchema,
  view: TarsShowViewSchema,
}).strict();
export type TarsShowAction = z.infer<typeof TarsShowActionSchema>;

/** Host-only reads: never a tool grant or an executable work action. */
export const TarsInspectActionSchema = z.object({
  kind: z.literal("inspect"),
  responsibilityId: IdSchema,
  view: z.enum(["report", "changes", "transcript", "checks", "pullRequest"]),
}).strict();
export type TarsInspectAction = z.infer<typeof TarsInspectActionSchema>;

/** Last read under way, persisted so reconnecting windows show the same status. */
export const TarsInspectionProgressSchema = TarsInspectActionSchema.omit({ kind: true }).extend({
  round: z.number().int().min(1).max(2),
  reading: z.boolean(),
  title: z.string().max(120),
  at: TimestampSchema,
}).strict();

/**
 * Withdraws one of Tars's own earlier decisions that still waits: a proposal
 * waiting for Confirm (`confirm:<message>:<action>`) or a question
 * (`ask:<message>:<action>`). It only closes the card; it grants nothing and
 * applies no option. Stave's own unverified-completion choice is never Tars's
 * to withdraw.
 */
export const TarsWithdrawActionSchema = z.object({
  kind: z.literal("withdraw"),
  decisionId: z.string().max(300).regex(/^(?:confirm|ask):[A-Za-z0-9._-]+:[0-7]$/),
}).strict();
export type TarsWithdrawAction = z.infer<typeof TarsWithdrawActionSchema>;

export const TarsWorkActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("delegate"),
    workspaceId: IdSchema,
    title: z.string().trim().min(1).max(120),
    instruction: z.string().trim().min(1).max(8_000),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    completionGoal: TarsCompletionGoalSchema.optional(),
    priority: z.number().int().min(0).max(100),
    /** Optional: the host admits it against the saved allowlist and delegation ceiling. */
    agentId: TarsAgentIdSchema.optional(),
    /**
     * Optional proposal under the repository's naming rule; the host sanitizes it and adds a unique suffix.
     * It grants nothing, so a null, empty or overlong value is dropped or cut instead of failing the reply.
     */
    branchName: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined,
      z.string().min(1).max(200).optional()),
    /** Optional one line on why this unit and agent; shown under the flow block. Display only, so it is cut, never fatal. */
    reason: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim().slice(0, TARS_DELEGATION_REASON_MAX_CHARS) : undefined,
      z.string().min(1).max(TARS_DELEGATION_REASON_MAX_CHARS).optional()),
    /**
     * Optional: the 0-based positions, in the message, of the attachments this
     * unit carries; absent gives it every attachment, empty none. A repeated
     * position counts once; one the message does not have is refused at
     * admission (`attachmentUnknown`), not here, so one bad unit never fails
     * the whole reply.
     */
    attachments: z.preprocess((value) => Array.isArray(value) ? [...new Set(value)] : value,
      z.array(z.number().int().min(0).max(1_000)).max(TARS_MESSAGE_ATTACHMENTS_MAX).optional()),
  }).strict(),
  z.object({
    kind: z.literal("reprioritize"),
    responsibilityId: IdSchema,
    expectedRevision: RevisionSchema,
    priority: z.number().int().min(0).max(100),
  }).strict(),
  TarsControlActionSchema,
  TarsAskActionSchema,
  TarsShowActionSchema,
  TarsWithdrawActionSchema,
  TarsPublishActionSchema,
  TarsClearActionSchema,
  TarsScheduleActionSchema,
  TarsWorkspaceActionSchema,
]);
export const TarsDecisionActionSchema = z.discriminatedUnion("kind", [...TarsWorkActionSchema.options, TarsInspectActionSchema]);
export type TarsDecisionAction = z.infer<typeof TarsDecisionActionSchema>;

/**
 * An action the model returned that the host never saw: it did not match its
 * schema (`invalid`) or went past a per-reply limit (`overLimit`). The reply
 * and the valid actions are kept; `index` is its position in the model's
 * output, `kind` its kind when it named a known one, and `detail` an English
 * diagnostic (the schema paths), never the model's text.
 */
export const TarsDroppedActionSchema = z.object({
  index: z.number().int().min(0).max(63),
  kind: z.string().max(40).nullable(),
  reason: z.enum(["invalid", "overLimit"]),
  detail: z.string().max(500),
}).strict();
export type TarsDroppedAction = z.infer<typeof TarsDroppedActionSchema>;

/** A proposal is not an execution receipt or an authorization grant. One reply asks at most one question. */
export const TarsDecisionSchema = z.object({
  reply: z.string().max(TARS_REPLY_MAX_CHARS),
  actions: z.array(TarsDecisionActionSchema).max(8)
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((actions) => actions.filter((action) => action.kind === "ask").length <= 1, "A reply asks at most one question.")
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((actions) => actions.filter((action) => action.kind === "show").length <= 1, "A reply opens at most one view.")
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((actions) => actions.filter((action) => action.kind === "publish").length <= 1, "A reply proposes at most one publish.")
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((actions) => actions.filter((action) => action.kind === "clear").length <= 1, "A reply proposes at most one clear."),
  /** Optional so earlier decisions still parse; absent when every action the model returned was kept. */
  dropped: z.array(TarsDroppedActionSchema).max(64).optional(),
}).strict();
export type TarsDecision = z.infer<typeof TarsDecisionSchema>;

/**
 * Why a message failed, for the interface to translate. The English `error`
 * beside it stays a diagnostic; messages saved before codes existed carry
 * only the English sentence (see `TARS_MESSAGE_FAILURE_TEXT`).
 */
export const TarsMessageFailureCodeSchema = z.enum(["interrupted", "reasoningFailed", "agentsUnavailable"]);
export type TarsMessageFailureCode = z.infer<typeof TarsMessageFailureCodeSchema>;
/** The fixed English diagnostic saved with each failure code. */
export const TARS_MESSAGE_FAILURE_TEXT: Readonly<Record<TarsMessageFailureCode, string>> = Object.freeze({
  // i18n-ignore: persisted diagnostic; the interface translates the code
  interrupted: "Reasoning was interrupted before its result was saved. Send a new message to try again.",
  // i18n-ignore: persisted diagnostic; the interface translates the code
  reasoningFailed: "The representative could not finish this message. Retry explicitly after inspecting its state.",
  // i18n-ignore: persisted diagnostic; the interface translates the code
  agentsUnavailable: "The saved agents this message allows did not load in time. Send the message again.",
});

/**
 * Why a planner turn is tried once more by itself: the provider timed out,
 * cut its output short, or failed in a way that passes (rate limit, overload,
 * a dropped connection). Never for a refusal or a malformed decision.
 */
export const TarsRetryCauseSchema = z.enum(["timeout", "truncated", "provider"]);
export type TarsRetryCause = z.infer<typeof TarsRetryCauseSchema>;

/**
 * Why a queued message has not started: an earlier message's action whose
 * outcome is not known yet (`earlierAction`), or the saved agents it allows
 * have not loaded (`agentCatalog`). Either wait is bounded.
 */
export const TarsQueueWaitReasonSchema = z.enum(["earlierAction", "agentCatalog"]);
export type TarsQueueWaitReason = z.infer<typeof TarsQueueWaitReasonSchema>;

/**
 * A decision's stable identity: `confirm:<message>:<action>` (a proposed
 * control, also its confirmation request id), `ask:<message>:<action>` or
 * `unverified:<responsibility>:<revision>`.
 */
export const TarsDecisionIdSchema = z.string().max(300)
  .regex(/^(?:(?:confirm|ask):[A-Za-z0-9._-]+:[0-7]|unverified:[A-Za-z0-9._-]+:[1-9][0-9]{0,8})$/);

/**
 * Why a message exists when the user did not type it: `answer`, a reply option
 * the user chose (by click, key or a short answer); `reask`, Tars asking once
 * more because a waiting decision's target changed; `followUp`, Tars's one
 * automatic look at a responsibility after an inbox event that needs
 * judgment (`eventKey`). Absent: the user's words.
 */
export const TarsMessageOriginSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("answer"), decisionId: TarsDecisionIdSchema, optionIndex: z.number().int().min(0).max(3),
    source: TarsAnswerSourceSchema, question: z.string().max(500), rationale: z.string().max(200),
  }).strict(),
  z.object({
    kind: z.literal("reask"), decisionId: TarsDecisionIdSchema, reason: z.enum(["targetMoved", "targetEnded"]),
    /** Model-facing summary of the decision that became invalid. */
    summary: z.string().max(2_000),
  }).strict(),
  z.object({
    kind: z.literal("followUp"), eventKey: TarsEventSchema.shape.key, responsibilityId: IdSchema, reason: TarsFollowUpReasonSchema,
    observedRevision: RevisionSchema,
    /** Model-facing summary of what changed. */
    summary: z.string().max(2_000),
    /**
     * For `stageAsksUser`: what the stopped stage waits for (`TarsStageWait`
     * kind), so a gate is followed up as needing verification or a next step,
     * never as a question to the user. Absent on older follow-ups.
     */
    stage: TarsStageWaitSchema.shape.kind.optional(),
  }).strict(),
]);
export type TarsMessageOrigin = z.infer<typeof TarsMessageOriginSchema>;

export const TarsMessageStateSchema = z.enum(["queued", "reasoning", "answered", "failed", "cancelled"]);
const messageFields = {
  ...TarsConversationSettingsSchema.shape,
  id: IdSchema,
  state: TarsMessageStateSchema,
  revision: RevisionSchema,
  reply: z.string().max(TARS_REPLY_MAX_CHARS).nullable(),
  error: ErrorSchema.nullable(),
  /** Optional so earlier rows still parse; only a failed message carries one. */
  errorCode: TarsMessageFailureCodeSchema.nullable().optional(),
  decision: TarsDecisionSchema.nullable(),
  /** Optional so earlier rows still parse; absent on messages the user typed. */
  origin: TarsMessageOriginSchema.optional(),
  /** The one automatic retry of its planner turn, once it started; absent when the first attempt was the only one. */
  retry: z.object({ attempt: z.literal(2), cause: TarsRetryCauseSchema, at: TimestampSchema }).strict().optional(),
  /** Only on a queued message: why it has not started yet (`TarsQueueWaitReason`). */
  waiting: z.object({ reason: TarsQueueWaitReasonSchema, since: TimestampSchema }).strict().optional(),
  /** Read status only; inspected content stays in the host. */
  inspection: TarsInspectionProgressSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};
function checkMessageState(message: { state: string; reply: string | null; error: string | null; errorCode?: string | null; decision: { reply: string } | null; waiting?: unknown },
  context: z.RefinementCtx) {
  const answered = message.state === "answered";
  if ((message.errorCode != null && message.state !== "failed") || (message.waiting !== undefined && message.state !== "queued") || (answered
    ? !message.decision || message.reply !== message.decision.reply || message.error !== null
    : message.decision !== null || message.reply !== null || (message.state === "failed" ? message.error === null : message.error !== null))) {
    // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
    context.addIssue({ code: "custom", message: "Message state and decision fields disagree." });
  }
}
/** A saved message: the user's words and full attachment snapshots, read by the host and the planner. */
export const TarsMessageSchema = z.object({ ...messageInputShape, ...messageFields }).strict().refine(hasContent).superRefine(checkMessageState);
export type TarsMessage = z.infer<typeof TarsMessageSchema>;

export { TarsAttachmentSummarySchema, type TarsAttachmentSummary } from "./types";

/**
 * A message as a window reads it (`tars:get-conversation`, and what sending
 * or cancelling returns): every field of the saved message, with each
 * attachment's summary instead of its content. A conversation is read again
 * on every change, so an image's data never crosses IPC with it.
 */
export const TarsMessageViewSchema = z.object({ ...messageInputShape, attachments: z.array(TarsAttachmentSummarySchema).max(8).optional(), ...messageFields })
  .strict().refine(hasContent).superRefine(checkMessageState);
export type TarsMessageView = z.infer<typeof TarsMessageViewSchema>;

/** Bytes a base64 payload decodes to. */
function base64Bytes(dataUrl: string) {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.max(0, Math.floor(payload.length * 3 / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0));
}

export function tarsAttachmentSummary(part: AttachmentContext): TarsAttachmentSummary {
  return part.type === "file_context"
    ? { kind: "file", name: part.filePath, type: part.language, size: new TextEncoder().encode(part.content).byteLength }
    : { kind: "image", name: part.label, type: part.mimeType, size: base64Bytes(part.dataUrl) };
}

/** A saved message as a window reads it: attachment summaries, never their content. */
export function tarsMessageView(message: TarsMessage): TarsMessageView {
  const { attachments, ...rest } = message;
  return attachments?.length ? { ...rest, attachments: attachments.map(tarsAttachmentSummary) } : rest;
}

/**
 * Whether the host may hold this action as a proposal that waits for the
 * user: every act except a view and the controls that only reduce what Tars
 * does (pause, takeover, deny), which always apply at once.
 */
export function isTarsHoldableAction(action: { kind: string; operation?: string }): boolean {
  const key = tarsActionKey(action);
  return key !== null && key !== "show" && key !== "pause" && key !== "takeover" && key !== "deny";
}

export const TarsActionReceiptSchema = z.object({
  messageId: IdSchema,
  actionIndex: z.number().int().min(0).max(7),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: TarsWorkActionSchema,
  /** `proposed`: a model-proposed control awaiting the user's confirming click, or an ask awaiting the user's answer. */
  status: z.enum(["pending", "applied", "rejected", "proposed"]),
  responsibilityId: IdSchema.nullable(),
  error: ErrorSchema.nullable(),
  /** Only a refused control or agent carries a code; other rejections keep their diagnostic. */
  reason: TarsActionReasonSchema.nullable(),
  /** The user's "never do" rules that matched this action when the host held it for confirmation; absent when none did. */
  matchedRules: z.array(TarsNeverRuleMatchSchema).min(1).max(12).optional(),
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((receipt, context) => {
  // An ask always waits for the user's answer, and a publish, a clear or a schedule change for the user's confirmation on its card; none applies anything itself.
  // Any other act can wait where an autonomy level or one of the user's rules holds it; a view, the reducing controls and listing schedules never do.
  const proposable = receipt.action.kind === "ask"
    || (receipt.action.kind === "schedule" ? receipt.action.operation !== "list" : isTarsHoldableAction(receipt.action));
  // A clear or a schedule belongs to no responsibility, so its applied receipt names none.
  const unbound = receipt.action.kind === "clear" || receipt.action.kind === "schedule" || receipt.action.kind === "withdraw" || receipt.action.kind === "workspace";
  // An automatic follow-up's refusal carries its one code on any kind of action.
  const coded = receipt.reason === null || (receipt.status === "rejected" && (receipt.reason === "notByFollowUp" || (receipt.action.kind === "control" || receipt.action.kind === "ask" || receipt.action.kind === "show" || receipt.action.kind === "reprioritize" || receipt.action.kind === "withdraw"
    ? TarsControlReasonSchema.safeParse(receipt.reason).success
    : receipt.action.kind === "publish" ? TarsPublishReasonSchema.safeParse(receipt.reason).success
      : receipt.action.kind === "schedule" ? TarsScheduleReasonSchema.safeParse(receipt.reason).success
        : receipt.action.kind === "delegate" && TarsDelegateReasonSchema.safeParse(receipt.reason).success)));
  const valid = coded &&
    (receipt.status === "proposed" || receipt.status === "pending" ? receipt.responsibilityId === null && receipt.error === null &&
      (receipt.status === "pending" || proposable)
      : receipt.status === "applied" ? (receipt.responsibilityId !== null) !== unbound && receipt.error === null
        : receipt.responsibilityId === null && receipt.error !== null);
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (!valid) context.addIssue({ code: "custom", message: "Receipt status and outcome fields disagree." });
});
export type TarsActionReceipt = z.infer<typeof TarsActionReceiptSchema>;

export const TarsReceiptOutcomeSchema = z.discriminatedUnion("status", [
  // Null only for an action that belongs to no responsibility (`TarsActionReceiptSchema` checks which).
  z.object({ status: z.literal("applied"), responsibilityId: IdSchema.nullable() }).strict(),
  z.object({ status: z.literal("proposed"), matchedRules: z.array(TarsNeverRuleMatchSchema).max(12).optional() }).strict(),
  z.object({ status: z.literal("rejected"), error: ErrorSchema, reason: TarsActionReasonSchema.optional() }).strict(),
]);
export type TarsReceiptOutcome = z.infer<typeof TarsReceiptOutcomeSchema>;

/**
 * Where a direct control came from: a click in Tars, a Fleet row's controls,
 * a task's own run controls, or a decision card answered by key or by a
 * bound short answer. Every source takes the same admission path and
 * is recorded in the conversation; only the record's wording differs.
 */
export const TarsActSourceSchema = z.enum(["click", "fleet", "task", "key", "words", "automatic"]);
export type TarsActSource = z.infer<typeof TarsActSourceSchema>;

/** A direct control (a click) admitted by the host on the same path as a proposed control. */
export const TarsActInputSchema = z.object({
  requestId: IdSchema.regex(/^[A-Za-z0-9._:-]+$/),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  operation: TarsControlOperationSchema,
  /** A task operation's input. A confirming click may omit it: the host takes it from the proposal the card showed. */
  input: TarsControlInputSchema.optional(),
  source: TarsActSourceSchema,
}).strict();
export type TarsActInput = z.infer<typeof TarsActInputSchema>;

/**
 * Moves queued work one place earlier or later, or with `relativeTo` directly
 * before (earlier) or after (later) that other queued work, as a drop does.
 * The host computes the new priority from the queue as it is when it admits
 * the move.
 */
export const TarsQueueMoveSchema = z.object({
  direction: z.enum(["earlier", "later"]),
  relativeTo: IdSchema.optional(),
}).strict();
export type TarsQueueMove = z.infer<typeof TarsQueueMoveSchema>;

/** How a queue move was asked: a menu item (by pointer or keyboard) or a drag in the tray. */
export const TarsQueueMoveSourceSchema = z.enum(["click", "drag"]);
export type TarsQueueMoveSource = z.infer<typeof TarsQueueMoveSourceSchema>;

/**
 * A direct queue move, admitted by the host on the same rules as a
 * `reprioritize` decision: the work is the user's Tars responsibility at the
 * revision they saw, it is still queued and its registered scope holds.
 * Recorded in the conversation like a click on a control.
 */
export const TarsReprioritizeInputSchema = z.object({
  requestId: IdSchema.regex(/^[A-Za-z0-9._:-]+$/),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  move: TarsQueueMoveSchema,
  source: TarsQueueMoveSourceSchema,
}).strict();
export type TarsReprioritizeInput = z.infer<typeof TarsReprioritizeInputSchema>;

/** A queue move as its record names it. */
export const TarsQueueMoveActionSchema = z.object({
  kind: z.literal("move"),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  move: TarsQueueMoveSchema,
}).strict();
export type TarsQueueMoveAction = z.infer<typeof TarsQueueMoveActionSchema>;

/**
 * The user's confirmed follow-up words: kept with the confirmation's record and said in the task
 * once that turn ends, exactly once, as their reply there.
 * - `queued`: waiting for the task's turn to end (or a paused run to resume).
 * - `delivering`: being said now, as the user turn `turnId`, minted and saved
 *   before the reply starts. After a restart it reached the task only if the
 *   run recorded that very turn; any other user turn says nothing about it.
 * - `withdrawn`: the user withdrew only this request before it reached the task.
 * - `delivered`: said in the task.
 * - `failed`: the run refused it (`reason`, `error`).
 * - `cancelled`: the work was taken over, cancelled or completed, its run
 *   ended or changed owner first (`reason`).
 * `agentRunId` is the receiving run. Only the same responsibility's recorded
 * continuation may rebind a queued delivery to a newer run on the same task.
 */
export const TarsMessageDeliverySchema = z.object({
  status: z.enum(["queued", "delivering", "delivered", "failed", "cancelled", "withdrawn"]),
  agentRunId: IdSchema,
  turnId: IdSchema.optional(),
  reason: TarsControlReasonSchema.nullable(),
  error: ErrorSchema.nullable(),
  queuedAt: TimestampSchema,
  /** User withdrawal remains a dispatch hold until the exact execution outcome can be read. */
  withdrawRequestedAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema,
}).strict().superRefine((delivery, context) => {
  const settledOtherwise = delivery.status === "failed" || delivery.status === "cancelled";
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (settledOtherwise !== (delivery.reason !== null)) context.addIssue({ code: "custom", message: "Only a failed or cancelled delivery has a reason." });
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (delivery.status === "delivering" && delivery.turnId === undefined) context.addIssue({ code: "custom", message: "A delivery under way names the user turn it starts." });
});
export type TarsMessageDelivery = z.infer<typeof TarsMessageDeliverySchema>;
export type TarsMessageDeliveryStatus = TarsMessageDelivery["status"];

/** Where a recorded action came from: a control's sources, plus a drag for a queue move. */
export const TarsActionRecordSourceSchema = z.enum([...TarsActSourceSchema.options, "drag"]);
export type TarsActionRecordSource = z.infer<typeof TarsActionRecordSourceSchema>;

/**
 * Timeline record of an admitted control, queue move or applied workspace edit,
 * including automatic actions. It is never a user message or an unexecuted
 * model proposal. Records saved before queue moves existed are all controls.
 */
export const TarsActionRecordSchema = z.object({
  requestId: IdSchema,
  source: TarsActionRecordSourceSchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.discriminatedUnion("kind", [TarsControlActionSchema, TarsQueueMoveActionSchema, TarsWorkspaceActionSchema]),
  status: z.enum(["pending", "applied", "rejected"]),
  /** English diagnostic for logs and support; the interface shows the translated `reason`. */
  error: ErrorSchema.nullable(),
  reason: TarsControlReasonSchema.nullable(),
  /** Host-saved prior state; absent on historical or irreversible records. */
  undo: TarsActionUndoSchema.optional(),
  /** An applied queue move's new priority for the moved work. */
  priority: z.number().int().min(0).max(100).optional(),
  /** An applied `message` whose task was busy: its words wait in this record and are said once (`TarsMessageDeliverySchema`). */
  delivery: TarsMessageDeliverySchema.optional(),
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  const rejected = record.status === "rejected";
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (rejected !== (record.error !== null) || rejected !== (record.reason !== null)) context.addIssue({ code: "custom", message: "Record status and outcome fields disagree." });
  if (record.undo && (record.status !== "applied" || (record.undo.kind === "workspace" ? record.action.kind !== "workspace" : record.undo.kind === "queue" ? record.action.kind !== "move"
    : record.undo.kind === "run" ? record.action.kind !== "control" || (record.action.operation !== "resume" && record.action.operation !== "retryStage")
    : record.undo.kind === "delivery" ? record.action.kind !== "control" || record.action.operation !== "message" || !record.delivery
      : record.action.kind !== "control" || (record.action.operation !== "pause" && record.action.operation !== "takeover"))))
    // i18n-ignore: persisted-state integrity diagnostic
    context.addIssue({ code: "custom", message: "Only reversible applied actions retain prior state." });
  const move = record.action.kind === "move";
  if ((record.source === "drag" && !move) || (record.priority !== undefined && !(move && record.status === "applied")))
    // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
    context.addIssue({ code: "custom", message: "Only an applied queue move records a priority, and only a queue move comes from a drag." });
  if (record.delivery && !(record.status === "applied" && record.action.kind === "control" && record.action.operation === "message"))
    // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
    context.addIssue({ code: "custom", message: "Only an applied message to a run waits for delivery." });
});
export type TarsActionRecord = z.infer<typeof TarsActionRecordSchema>;

export const TarsActResultSchema = z.object({
  record: TarsActionRecordSchema,
  snapshot: TarsSnapshotSchema,
}).strict();
export type TarsActResult = z.infer<typeof TarsActResultSchema>;

export const TarsUndoActionResultSchema = z.object({ record: TarsActionRecordSchema.nullable(), refusal: TarsUndoActionRefusalSchema.nullable() }).strict();
export type TarsUndoActionResult = z.infer<typeof TarsUndoActionResultSchema>;

/** One decision card option chosen by the user. The host reads the option from saved state; the caller names only its index. */
export const TarsAnswerInputSchema = z.object({
  decisionId: TarsDecisionIdSchema,
  optionIndex: z.number().int().min(0).max(TARS_ASK_MAX_OPTIONS - 1),
  source: TarsAnswerSourceSchema,
}).strict();
export type TarsAnswerInput = z.infer<typeof TarsAnswerInputSchema>;

/** The effect an answer applies, read from the saved decision when the answer was recorded. */
export const TarsAnswerEffectSchema = z.discriminatedUnion("kind", [
  ...TarsAskEffectSchema.options,
  // Confirms the held work proposal the decision names (a delegation or a priority change): the host applies the saved action, never the caller's.
  z.object({ kind: z.literal("proposal") }).strict(),
  // The user closed the card without choosing: nothing applies, the decision stops waiting.
  z.object({ kind: z.literal("dismiss") }).strict(),
  // Tars withdrew its own decision with this later action (`TarsWithdrawAction`): nothing applies, the decision stops waiting.
  z.object({ kind: z.literal("withdraw"), messageId: IdSchema, actionIndex: z.number().int().min(0).max(7) }).strict(),
]);

/** A stored answer's source: the user's (`TarsAnswerSource`), or Tars's own for a withdrawal. */
export const TarsDecisionAnswerSourceSchema = z.enum([...TarsAnswerSourceSchema.options, "tars"]);
export type TarsDecisionAnswerSource = z.infer<typeof TarsDecisionAnswerSourceSchema>;

/**
 * The first answer to a decision. Its identity is the decision: a repeated
 * answer with the same option joins it, a different option is refused.
 */
export const TarsDecisionAnswerSchema = z.object({
  decisionId: TarsDecisionIdSchema,
  optionIndex: z.number().int().min(0).max(TARS_ASK_MAX_OPTIONS - 1),
  source: TarsDecisionAnswerSourceSchema,
  effect: TarsAnswerEffectSchema,
  /** The option as the model wrote it; null for Stave's own options, named by their operation. */
  label: z.string().trim().min(1).max(60).nullable(),
  status: z.enum(["pending", "applied", "rejected"]),
  reason: TarsControlReasonSchema.nullable(),
  error: ErrorSchema.nullable(),
  /** A control's `tars:act` request id; a reply's answer message. */
  actRequestId: IdSchema.nullable(),
  /** Counts attempts after a retryable refusal (`isTarsAnswerRetryable`); absent on the first. */
  attempt: z.number().int().min(1).max(1_000).optional(),
  messageId: IdSchema.nullable(),
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((answer, context) => {
  const rejected = answer.status === "rejected";
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (rejected !== (answer.error !== null) || (!rejected && answer.reason !== null)) context.addIssue({ code: "custom", message: "Answer status and outcome fields disagree." });
  // A closure chose no option: it is applied at once, names nothing to act on, and only a withdrawal is Tars's.
  const closure = answer.effect.kind === "dismiss" || answer.effect.kind === "withdraw";
  if ((answer.source === "tars") !== (answer.effect.kind === "withdraw") || (closure && (answer.status !== "applied" || answer.optionIndex !== 0
    || answer.label !== null || answer.actRequestId !== null || answer.attempt !== undefined)))
    // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
    context.addIssue({ code: "custom", message: "A dismissal or withdrawal chooses no option and applies nothing." });
});
export type TarsDecisionAnswer = z.infer<typeof TarsDecisionAnswerSchema>;

/** Whether an answer closed its decision without choosing an option: the user dismissed it, or Tars withdrew it. */
export function isTarsDecisionClosure(answer: Pick<TarsDecisionAnswer, "effect">): boolean {
  return answer.effect.kind === "dismiss" || answer.effect.kind === "withdraw";
}

/** The user's Dismiss on a waiting decision card: by click or by key on the focused card. */
export const TarsDismissInputSchema = z.object({
  decisionId: TarsDecisionIdSchema,
  source: TarsAnswerSourceSchema.extract(["click", "key"]),
}).strict();
export type TarsDismissInput = z.infer<typeof TarsDismissInputSchema>;

/**
 * A refused answer leaves its decision open, for a retry or another option,
 * unless the refusal says the decision itself is gone: its work changed or
 * ended (a superseded proposal is refused as stale).
 */
export function isTarsAnswerRetryable(answer: Pick<TarsDecisionAnswer, "status" | "reason">) {
  return answer.status === "rejected" && answer.reason !== "stale" && answer.reason !== "ended";
}

/**
 * Why an answer was refused before anything applied: the decision already has
 * a different answer, it no longer waits (answered elsewhere, superseded or
 * invalid), or the option does not exist.
 */
export const TarsAnswerRefusalSchema = z.enum(["alreadyAnswered", "notWaiting", "invalidOption"]);
export type TarsAnswerRefusal = z.infer<typeof TarsAnswerRefusalSchema>;

export const TarsAnswerResultSchema = z.object({
  answer: TarsDecisionAnswerSchema.nullable(),
  refusal: TarsAnswerRefusalSchema.nullable(),
}).strict();
export type TarsAnswerResult = z.infer<typeof TarsAnswerResultSchema>;

export const GetTarsConversationInputSchema = z.object({
  limit: z.number().int().min(1).max(1_000).default(100),
  activityLimit: z.number().int().min(1).max(1_000).default(100),
}).strict();
export type GetTarsConversationInput = z.input<typeof GetTarsConversationInputSchema>;

export const CancelTarsMessageInputSchema = z.object({
  messageId: IdSchema,
  expectedRevision: RevisionSchema,
}).strict();
export type CancelTarsMessageInput = z.infer<typeof CancelTarsMessageInputSchema>;

/** Internal host admission accepts only the identity of an already saved proposal. */
export const ApplyTarsDecisionInputSchema = CancelTarsMessageInputSchema;
export type ApplyTarsDecisionInput = z.infer<typeof ApplyTarsDecisionInputSchema>;

/**
 * The user's confirmation of a held proposal (delegation, priority change or
 * workspace information edit). It names the saved receipt only; the host applies that saved
 * action through the same admission as an unheld one.
 */
export const ConfirmTarsProposalInputSchema = z.object({
  messageId: IdSchema,
  actionIndex: z.number().int().min(0).max(7),
}).strict();
export type ConfirmTarsProposalInput = z.infer<typeof ConfirmTarsProposalInputSchema>;

export const TarsConversationSchema = z.object({
  settings: TarsConversationSettingsSchema.nullable(),
  activity: z.array(TarsActivitySchema).max(1_000),
  /** Attachment summaries only (`TarsMessageViewSchema`); the planner reads the saved content in the host. */
  messages: z.array(TarsMessageViewSchema).max(1_000),
  receipts: z.array(TarsActionReceiptSchema).max(8_000),
  records: z.array(TarsActionRecordSchema).max(1_000),
  /** Optional so older hosts' conversations still parse. */
  answers: z.array(TarsDecisionAnswerSchema).max(1_000).optional(),
  /** Recent inbox events, for the notices they leave; optional so older hosts' conversations still parse. */
  events: z.array(TarsEventSchema).max(1_000).optional(),
  /** Publish confirmations and their outcomes; optional so older hosts' conversations still parse. */
  publications: z.array(TarsPublishRecordSchema).max(1_000).optional(),
  /** Clears from the active conversation clear on (its own record included); optional so older hosts' conversations still parse. */
  clears: z.array(TarsClearRecordSchema).max(1_000).optional(),
  /** The newest applied clear of each tray lane (Done, Outputs) that hid something, whatever the conversation clear's time, for the lane's Undo. */
  trayClears: z.array(TarsClearRecordSchema).max(2).optional(),
  /** Schedule confirmations and switches with their outcomes; optional so older hosts' conversations still parse. */
  schedules: z.array(TarsScheduleRecordSchema).max(1_000).optional(),
  /** Runs that Tars's schedules started: records whose actor is the schedule, not the user. */
  scheduleRuns: z.array(TarsScheduleRunSchema).max(1_000).optional(),
  /** Retention and the active conversation clear; absent from older hosts. */
  view: TarsConversationViewSchema.optional(),
}).strict();
export type TarsConversation = z.infer<typeof TarsConversationSchema>;
