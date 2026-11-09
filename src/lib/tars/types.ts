import { z } from "zod";
import type { TarsPublishInput, TarsPublishPreview, TarsPublishPreviewInput, TarsPublishResult } from "./publication";
import type { TarsBrief, TarsBriefInput } from "./brief";
import type { SaveTarsComposerDraftInput, TarsComposerDraft } from "./composer-draft";
import type {
  CancelTarsMessageInput, GetTarsConversationInput, TarsActInput, TarsActResult, TarsAnswerInput, TarsAnswerResult, TarsConversation, TarsMessage,
  TarsMessageInput, TarsConversationSettings, TarsReprioritizeInput,
} from "./conversation";
import { SecondaryRunRuntimeHintsSchema } from "../runs/secondary-run";
import { AGENT_RUN_LIMITS } from "../agent-runs/domain";
import { TARS_BRANCH_NAME_MAX_CHARS, TARS_BRANCH_SUFFIX_CHARS } from "./branch-name";
import { TarsPublicationSchema } from "./publication";

/** The longest message the user can send Tars. */
export const TARS_MESSAGE_MAX_CHARS = 32_000;
/** A responsibility's instruction becomes its run's assignment, so it shares that limit. */
export const TARS_ASSIGNMENT_MAX_CHARS = AGENT_RUN_LIMITS.maxAssignmentChars;

/** The durable personal identity is independent of any worker or provider session. */
export const TARS_IPC = Object.freeze({
  get: "tars:get",
  create: "tars:create",
  act: "tars:act",
  updateIdentity: "tars:update-identity",
  sendMessage: "tars:send-message",
  configureConversation: "tars:configure-conversation",
  getConversation: "tars:get-conversation",
  cancelMessage: "tars:cancel-message",
  /** Answers one decision card option (click, key or a bound short answer); controls take `tars:act`'s host path. */
  answer: "tars:answer",
  /** Confirms one publish card: the host commits, pushes and opens a draft pull request. */
  publish: "tars:publish",
  /** Reads what a publish card shows (repository, branches, changed files, body); changes nothing. */
  publishPreview: "tars:publish-preview",
  /** Moves queued work earlier or later in the queue (a menu item or a drag), on a `reprioritize` decision's host rules. */
  reprioritize: "tars:reprioritize",
  /** Reads one responsibility's saved message and Tars's instruction (`TarsBrief`); changes nothing. */
  getBrief: "tars:get-brief",
  /** Reads the saved composer draft; `null` when there is none. */
  getDraft: "tars:get-draft",
  /** Saves or (with `null`) deletes the composer draft. Never announced through `changed`. */
  saveDraft: "tars:save-draft",
  /** Main → renderer: a `TarsChangedEvent`; surfaces read the named part again instead of polling. */
  changed: "tars:changed",
});

/**
 * What changed: `snapshot` (identity, responsibilities, pending decisions) or
 * `conversation` (messages, settings, receipts, click records, activity).
 */
export const TarsChangeScopeSchema = z.enum(["snapshot", "conversation"]);
export type TarsChangeScope = z.infer<typeof TarsChangeScopeSchema>;
export const TarsChangedEventSchema = z.object({ scope: TarsChangeScopeSchema }).strict();
export type TarsChangedEvent = z.infer<typeof TarsChangedEventSchema>;

const IdSchema = z.string().trim().min(1).max(256);
const PrioritySchema = z.number().int().min(0).max(100);
const ModelSchema = z.string().trim().min(1).max(200).nullable();
/** A saved or built-in agent id, in the agent library's id format. */
export const TarsAgentIdSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);

/** `takenOver`: the user owns the work; Tars never resumes it until an explicit hand-back. */
export const TarsStateSchema = z.enum([
  "queued", "preparing", "running", "waiting", "paused", "completed", "blocked", "cancelled", "takenOver",
]);
export type TarsState = z.infer<typeof TarsStateSchema>;

/**
 * The controls a click, Fleet, a task or an admitted model proposal can apply.
 * - `acceptCompletion`: the user accepts work whose completion Stave could not verify.
 * - `startNow`: the user starts queued work at once, ahead of the queue and outside the portfolio slot.
 * - `extend`, `retryStage`, `skipStage`, `signOff`: what the user can do to the
 *   run in its task (add turns at its turn limit, ask a blocked or stuck stage
 *   again, skip the current stage, approve a stage waiting for sign-off).
 * - `approve`, `deny`, `answer`: answer a tool approval or a question waiting
 *   in the work's task (or a helper's task), once; never an "always allow".
 * - `message`: the user's words to the run as a reply in its task.
 * - `requestChanges`: ask changes on a stage waiting for sign-off.
 * The last five carry `input` (`TarsControlInputSchema`).
 */
export const TarsControlOperationSchema = z.enum([
  "pause", "resume", "cancel", "takeover", "handBack", "acceptCompletion",
  "startNow", "extend", "retryStage", "skipStage", "signOff",
  "approve", "deny", "answer", "message", "requestChanges",
]);
export type TarsControlOperation = z.infer<typeof TarsControlOperationSchema>;
/** Answers to a request waiting in the work's task, and the user's words to its run; each carries `input`. */
export type TarsTaskOperation = "approve" | "deny" | "answer" | "message" | "requestChanges";
export const TARS_TASK_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set(["approve", "deny", "answer", "message", "requestChanges"]);
export function isTarsTaskOperation(operation: TarsControlOperation): operation is TarsTaskOperation {
  return TARS_TASK_OPERATIONS.has(operation);
}
/** The controls that reach the execution run; accepting completion only settles the responsibility, queued work has no run yet, and task operations answer in the task. */
export type TarsRunControlOperation = Exclude<TarsControlOperation, "acceptCompletion" | "startNow" | TarsTaskOperation>;

export const TARS_TASK_TEXT_MAX_CHARS = 8_000;
/** A question's own answer key (its `key`, else its full text) is kept whole; a longer one is answered only in the task. */
export const TARS_QUESTION_KEY_MAX_CHARS = 4_000;
/**
 * What a task operation says: `requestRef` is the `ref` of a request in the
 * responsibility's `pendingRequests` (approve, deny, answer); `answers` maps
 * each question's key to the answer (answer); `text` is the reply or the
 * requested changes (message, requestChanges).
 */
export const TarsControlInputSchema = z.object({
  requestRef: z.string().trim().min(1).max(64).optional(),
  answers: z.record(z.string().min(1).max(TARS_QUESTION_KEY_MAX_CHARS), z.string().trim().min(1).max(2_000))
    // i18n-ignore: schema diagnostic, not user-facing copy
    .refine((answers) => Object.keys(answers).length >= 1 && Object.keys(answers).length <= 12, "Answer 1 to 12 questions.").optional(),
  text: z.string().trim().min(1).max(TARS_TASK_TEXT_MAX_CHARS).optional(),
}).strict();
export type TarsControlInput = z.infer<typeof TarsControlInputSchema>;

/** Which `input` fields an operation needs; operations without `input` must not carry one. Null when the pair fits. */
export function tarsControlInputProblem(operation: TarsControlOperation, input: TarsControlInput | undefined): string | null {
  if (!isTarsTaskOperation(operation)) return input === undefined ? null : "This control takes no input."; // i18n-ignore: schema diagnostic
  if (!input) return "This control needs input."; // i18n-ignore: schema diagnostic
  const needs = operation === "answer" ? ["requestRef", "answers"] : operation === "approve" || operation === "deny" ? ["requestRef"] : ["text"];
  const present = Object.entries(input).filter(([, value]) => value !== undefined).map(([key]) => key);
  return needs.every((key) => present.includes(key)) && present.every((key) => needs.includes(key))
    ? null : `This control takes exactly: ${needs.join(", ")}.`; // i18n-ignore: schema diagnostic
}

/**
 * A request waiting on the user in the work's task, or in the task of a
 * helper its run delegated to, as the host last observed it. Bounded copies
 * for the conversation and the planner; the host reads the task again before
 * answering. `ref` identifies it by workspace, task, message and provider
 * request id together, since a provider may reuse a request id; a task
 * operation names it by `ref`. `summary` is the tool's own description
 * (untrusted text).
 */
export const TarsPendingRequestSchema = z.object({
  kind: z.enum(["approval", "question"]),
  ref: z.string().min(1).max(64),
  requestId: z.string().min(1).max(256),
  messageId: z.string().min(1).max(256),
  taskId: IdSchema,
  workspaceId: IdSchema,
  toolName: z.string().max(120),
  summary: z.string().max(500),
  questions: z.array(z.object({
    key: z.string().min(1).max(TARS_QUESTION_KEY_MAX_CHARS),
    question: z.string().max(300),
    options: z.array(z.string().max(120)).max(8),
  }).strict()).max(12).optional(),
}).strict();
export type TarsPendingRequest = z.infer<typeof TarsPendingRequestSchema>;
export const TARS_PENDING_REQUESTS_MAX = 6;
/** Run commands the user could give in the task; each acts on the run's current stage or turn limit. */
export const TARS_RUN_COMMAND_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set(["extend", "retryStage", "skipStage", "signOff"]);
export type TarsRunCommandOperation = "extend" | "retryStage" | "skipStage" | "signOff";
export function isTarsRunCommandOperation(operation: TarsControlOperation): operation is TarsRunCommandOperation {
  return TARS_RUN_COMMAND_OPERATIONS.has(operation);
}

/**
 * Stable codes for the status sentences Tars itself writes into a
 * responsibility's detail. Surfaces translate the code
 * (`describeTarsResponsibilityDetail`); `detail` keeps the English sentence
 * for the model's context and diagnostics. A run's own words (its reason or a
 * stage's detail) and other subsystems' errors carry no code.
 */
export const TarsDetailCodeSchema = z.enum([
  "waitingForUser", "runPaused", "runStopped", "incompleteReport", "staleVerification",
  "scopeUnregistered", "taskIdentityChanged", "taskInUse", "executionAgentUnavailable", "assignmentUnavailable",
  "executionExists", "ownershipUnverified", "ownershipChanged", "taskUnavailable", "takenOverInTask",
  "admissionWithdrawn", "observationFailed", "unverifiedCompletion", "acceptedWithoutVerification", "workingChangesUnavailable",
]);
export type TarsDetailCode = z.infer<typeof TarsDetailCodeSchema>;

/** `reason`: the run's pause or stop reason for `runPaused` / `runStopped`, as the run records it. */
export const TarsDetailParamsSchema = z.object({ reason: z.string().trim().min(1).max(80) }).strict();
export type TarsDetailParams = z.infer<typeof TarsDetailParamsSchema>;

/** Optional so rows saved before codes existed still parse; absent means free text. */
const DetailCodeFields = {
  detailCode: TarsDetailCodeSchema.nullable().optional(),
  detailParams: TarsDetailParamsSchema.nullable().optional(),
};

export const TarsActivitySchema = z.object({
  id: IdSchema, responsibilityId: IdSchema, revision: z.number().int().min(1),
  title: z.string().min(1).max(120), state: TarsStateSchema,
  detail: z.string().max(2_000).nullable(), ...DetailCodeFields, createdAt: z.iso.datetime(),
}).strict();
export type TarsActivity = z.infer<typeof TarsActivitySchema>;

export const UpdateTarsIdentityInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().max(8_000),
}).strict();
export type UpdateTarsIdentityInput = z.infer<typeof UpdateTarsIdentityInputSchema>;

export const TarsIdentitySchema = UpdateTarsIdentityInputSchema.extend({
  id: z.literal("personal"),
  updatedAt: z.iso.datetime(),
}).strict();
export type TarsIdentity = z.infer<typeof TarsIdentitySchema>;

export const CreateTarsResponsibilityInputSchema = z.object({
  requestId: IdSchema.regex(/^[A-Za-z0-9._:-]+$/),
  title: z.string().trim().min(1).max(120),
  instruction: z.string().trim().min(1).max(TARS_ASSIGNMENT_MAX_CHARS),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  workspaceId: IdSchema,
  repositoryPath: z.string().trim().min(1).max(4_096),
  providerId: z.enum(["claude-code", "codex"]),
  model: ModelSchema.optional(),
  /** Captured at admission; later renderer settings cannot change queued execution. */
  runtimeHints: SecondaryRunRuntimeHintsSchema.optional(),
  priority: PrioritySchema.default(50),
  maxTurns: z.number().int().min(1).max(100).default(30),
}).strict();
export type CreateTarsResponsibilityInput = z.input<typeof CreateTarsResponsibilityInputSchema>;

/** A full commit id in either of Git's object formats (SHA-1 or SHA-256). */
const TarsCommitIdSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);

/**
 * Where work from a message that asked to include the user's working changes
 * starts: `snapshot`, a commit of the target workspace's working tree taken at
 * admission (tracked, modified and untracked files; gitignored files stay out),
 * kept reachable by `ref`; `clean`, the tree had no changes, so the work starts
 * from the branch as usual.
 */
export const TarsWorkingChangesSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("snapshot"),
    commit: TarsCommitIdSchema,
    ref: z.string().max(300).regex(/^refs\/stave\/tars\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/),
  }).strict(),
  z.object({ kind: z.literal("clean") }).strict(),
]);
export type TarsWorkingChanges = z.infer<typeof TarsWorkingChangesSchema>;

/**
 * The conversation message that admitted a work unit, saved with the unit:
 * its `text` exactly as the user sent it, when it was sent, and, when the
 * message was the user's choice on a Tars question, that question.
 */
export const TarsWorkRequestSchema = z.object({
  messageId: IdSchema,
  text: z.string().min(1).max(TARS_MESSAGE_MAX_CHARS),
  sentAt: z.iso.datetime(),
  answeredQuestion: z.string().min(1).max(500).optional(),
}).strict();
export type TarsWorkRequest = z.infer<typeof TarsWorkRequestSchema>;

/**
 * Set only by host decision admission, never by the renderer's create request.
 * - `branchName`: the execution workspace's branch, built by
 *   `buildTarsBranchName` from the planner's proposal for the repository's
 *   naming rule. Absent on work admitted before it existed: `tars/<id>`.
 * - `mandate`: the user's complete message when it and the work unit do not
 *   fit the run assignment (`TARS_ASSIGNMENT_MAX_CHARS`); the run replays it
 *   as context on every lead turn.
 * - `workingChanges`: present only when the user's message asked to include
 *   their working changes; the execution workspace then starts from the
 *   snapshot commit instead of the branch.
 * - `request`: the message that admitted the work (`TarsWorkRequestSchema`).
 * - `delegatedInstruction`: the unit's instruction exactly as Tars proposed
 *   it, before the host combined it with the user's message into the run
 *   assignment (`instruction`).
 *
 * `request` and `delegatedInstruction` never change after admission; work
 * admitted before they were saved has neither (see `buildTarsBrief`).
 */
const TarsAdmittedWorkFields = {
  branchName: z.string().trim().min(1).max(TARS_BRANCH_NAME_MAX_CHARS + TARS_BRANCH_SUFFIX_CHARS).optional(),
  mandate: z.string().trim().min(1).max(TARS_MESSAGE_MAX_CHARS).optional(),
  workingChanges: TarsWorkingChangesSchema.optional(),
  request: TarsWorkRequestSchema.optional(),
  delegatedInstruction: z.string().min(1).max(TARS_ASSIGNMENT_MAX_CHARS).optional(),
};

/**
 * Host-admitted creation only. The renderer's create request cannot name an
 * agent: `agentId` is set solely by a delegate decision the host admitted
 * against the saved allowlist.
 */
export const AdmittedTarsResponsibilityInputSchema = CreateTarsResponsibilityInputSchema.extend({
  agentId: TarsAgentIdSchema.optional(),
  ...TarsAdmittedWorkFields,
}).strict();
export type AdmittedTarsResponsibilityInput = z.input<typeof AdmittedTarsResponsibilityInputSchema>;

export const TarsResponsibilitySchema = CreateTarsResponsibilityInputSchema.extend({
  id: IdSchema,
  /** The execution model pin; null runs the work on automatic routing. */
  model: ModelSchema,
  /** The agent the host admitted for the work stage; null lets the execution lead choose. */
  agentId: TarsAgentIdSchema.nullable().default(null),
  ...TarsAdmittedWorkFields,
  priority: PrioritySchema,
  maxTurns: z.number().int().min(1).max(100),
  revision: z.number().int().min(1),
  state: TarsStateSchema,
  detail: z.string().max(2_000).nullable(),
  ...DetailCodeFields,
  taskId: IdSchema.nullable(),
  executionWorkspaceId: IdSchema.nullable(),
  agentRunId: IdSchema.nullable(),
  /** Set by a hand-back: completion needs a final verification started at or after this time. */
  reverifyAfter: z.iso.datetime().nullable(),
  /**
   * Set by observation while `waiting` because the run's own current stage
   * blocked, got stuck or awaits sign-off to ask the user for a decision.
   * Absent for plain waits: the user paused the run, a usage-limit or other
   * run pause, or a tool approval or question the user answers in the task.
   */
  stageAsksUser: z.boolean().optional(),
  /**
   * The run's turn count when it was last observed waiting. A turn taken
   * since is activity, so it saves a change that restarts the quiet wait even
   * when the wait looks the same as before.
   */
  observedTurns: z.number().int().min(0).optional(),
  /** The run's current stage attempt (`stageId#attempt`) when last observed waiting; part of an ask's identity. */
  observedStage: z.string().min(1).max(300).optional(),
  /**
   * Set by observation while `waiting` because a helper of the run (a task the
   * run delegated to, at any depth) waits on the user rather than the run's
   * own task: that helper's task. Fleet shows the wait as rows on that task, so
   * the tray counts those rows for this responsibility. Absent otherwise.
   */
  waitingTaskId: IdSchema.optional(),
  /**
   * Host-only: the commit, push and draft pull request the user confirmed for
   * completed work, saved after each step so a retry resumes where it stopped.
   * No create request, control or renderer write can set it.
   */
  publication: TarsPublicationSchema.optional(),
  /**
   * The run's own current stage attempt (`stageId#attempt`) when last
   * observed, while the run is active. A stage command (retry, skip, sign off)
   * applies only to this attempt, so one confirmed for a stage never acts on
   * a later one; a new attempt saves a change that makes older proposals stale.
   */
  activeStage: z.string().min(1).max(300).optional(),
  /**
   * Tool approvals and questions waiting in the work's task or a helper's
   * task, as last observed while the work waits on them. A new or answered
   * request saves a change, so a proposal made for an older set is stale.
   */
  pendingRequests: z.array(TarsPendingRequestSchema).max(TARS_PENDING_REQUESTS_MAX).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export type TarsResponsibility = z.infer<typeof TarsResponsibilitySchema>;

/** The saved texts a window reads one responsibility at a time (`tars:get-brief`), never with every snapshot. */
const HOST_ONLY_TEXT = ["mandate", "request", "delegatedInstruction"] as const satisfies readonly (keyof TarsResponsibility)[];

/**
 * The snapshot a window reads. A responsibility's `mandate` (up to
 * `TARS_MESSAGE_MAX_CHARS`), the user's message that admitted it and Tars's
 * own instruction can be long, so they stay in the host instead of crossing
 * IPC on every change; the request view reads them on demand (`buildTarsBrief`).
 */
export function tarsSnapshotForWindow<T extends { responsibilities: readonly TarsResponsibility[] }>(snapshot: T): T {
  if (!snapshot.responsibilities.some((row) => HOST_ONLY_TEXT.some((key) => row[key] !== undefined))) return snapshot;
  return { ...snapshot, responsibilities: snapshot.responsibilities.map((row) => {
    const visible: Partial<TarsResponsibility> = { ...row };
    for (const key of HOST_ONLY_TEXT) delete visible[key];
    return visible as TarsResponsibility;
  }) };
}

export const TarsResponsibilityPatchSchema = TarsResponsibilitySchema.pick({
  state: true, detail: true, detailCode: true, detailParams: true, taskId: true, executionWorkspaceId: true, agentRunId: true,
  priority: true, reverifyAfter: true, stageAsksUser: true, observedTurns: true, observedStage: true, waitingTaskId: true, publication: true,
  activeStage: true, pendingRequests: true,
}).partial().strict();
export type TarsResponsibilityPatch = z.infer<typeof TarsResponsibilityPatchSchema>;

/**
 * What a decision waiting on the user is: `confirm`, a control the model
 * proposed that waits for the user's Confirm; `unverifiedCompletion`, Stave's
 * own choice for a run whose reported completion it could not verify; `ask`,
 * a question the model asked with 2–4 options.
 */
export const TarsDecisionKindSchema = z.enum(["confirm", "unverifiedCompletion", "ask"]);
export type TarsDecisionKind = z.infer<typeof TarsDecisionKindSchema>;

/**
 * A decision that waits on the user and is bound to a responsibility. Fleet
 * and the tray show it as "Tars decision waiting". Rows saved before kinds
 * existed carry no `kind` and are proposed controls.
 */
export const TarsPendingDecisionSchema = z.object({
  kind: TarsDecisionKindSchema.optional(),
  responsibilityId: IdSchema,
  /** The message that proposed or asked it; null for Stave's own unverified-completion decision. */
  messageId: IdSchema.nullable(),
  actionIndex: z.number().int().min(0).nullable(),
  /** The one control Confirm applies; null when the decision offers several options. */
  operation: TarsControlOperationSchema.nullable(),
  /** The revision the decision applies to; a later revision makes it stale. */
  expectedRevision: z.number().int().min(1),
  proposedAt: z.iso.datetime(),
  /** An ask's question, as the model wrote it. */
  question: z.string().trim().min(1).max(500).optional(),
  optionCount: z.number().int().min(1).max(4).optional(),
}).strict();
export type TarsPendingDecision = z.infer<typeof TarsPendingDecisionSchema>;

/**
 * What a Tars inbox event observed. `blocked`, `unverifiedCompletion`,
 * `verificationFailed` (the run ended with required criteria unmet or a
 * verification older than a hand-back), `stageAsksUser` (the run's own stage
 * stopped to ask the user; followed up at once, not after the quiet wait),
 * `waitExpired` and `decisionInvalidated` need Tars's judgment. `completed` and `hostRecovery`
 * the host settles itself; they are recorded, never followed up.
 */
export const TarsEventKindSchema = z.enum([
  "blocked", "unverifiedCompletion", "verificationFailed", "stageAsksUser", "waitExpired", "decisionInvalidated", "completed", "hostRecovery",
]);
export type TarsEventKind = z.infer<typeof TarsEventKindSchema>;

/**
 * What the tray shows about Tars's next look at a responsibility:
 * `pending`, an event about to be followed up; `deferred`, one waiting for
 * the next follow-up window (`at`); `following`, a follow-up queued or
 * reasoning; `exhausted`, none started because automatic turns reached the
 * turn limit; `nextCheck`, waiting work's one follow-up at `at` if nothing changes.
 */
export const TarsFollowUpStateSchema = z.object({
  responsibilityId: IdSchema,
  kind: TarsEventKindSchema,
  status: z.enum(["pending", "deferred", "following", "exhausted", "nextCheck"]),
  at: z.iso.datetime().nullable(),
}).strict();
export type TarsFollowUpState = z.infer<typeof TarsFollowUpStateSchema>;

export const TarsSnapshotSchema = z.object({
  identity: TarsIdentitySchema,
  responsibilities: z.array(TarsResponsibilitySchema),
  pendingDecisions: z.array(TarsPendingDecisionSchema).default([]),
  /** Tars's next automatic look at each responsibility, from the event inbox; absent from older hosts. */
  followUps: z.array(TarsFollowUpStateSchema).max(200).default([]),
  runtime: z.literal("desktop"),
}).strict();
export type TarsSnapshot = z.infer<typeof TarsSnapshotSchema>;

/** IPC rejects invalid input in both main and host; renderer state is only a mirror. */
export interface TarsBridgeApi {
  /** Available on the desktop bridge; older/browser preview bridges may omit conversation support. */
  configureConversation?(input: TarsConversationSettings): Promise<TarsConversationSettings>;
  sendMessage?(input: TarsMessageInput): Promise<TarsMessage>;
  getConversation?(input?: GetTarsConversationInput): Promise<TarsConversation>;
  cancelMessage?(input: CancelTarsMessageInput): Promise<TarsMessage>;
  get(): Promise<TarsSnapshot>;
  create(input: CreateTarsResponsibilityInput): Promise<TarsSnapshot>;
  /** Pause, resume, cancel, take over or hand back through the host's admitted control path. */
  act(input: TarsActInput): Promise<TarsActResult>;
  /** Answers a decision card; absent on bridges that predate decision cards. */
  answer?(input: TarsAnswerInput): Promise<TarsAnswerResult>;
  /** Confirms a publish card through the host's one publish path; absent on bridges that predate publishing. */
  publish?(input: TarsPublishInput): Promise<TarsPublishResult>;
  /** What a publish card shows, read by the host; absent on bridges that predate publishing. */
  previewPublish?(input: TarsPublishPreviewInput): Promise<TarsPublishPreview>;
  /** Moves queued work in the queue and records it like a click; absent on bridges that predate queue moves. */
  reprioritize?(input: TarsReprioritizeInput): Promise<TarsActResult>;
  /** Reads one responsibility's saved message and instruction; absent on bridges that predate the request view. */
  getBrief?(input: TarsBriefInput): Promise<TarsBrief>;
  /** The saved composer draft; absent on bridges that predate saved drafts, which keep it in memory only. */
  getDraft?(): Promise<TarsComposerDraft | null>;
  saveDraft?(input: SaveTarsComposerDraftInput): Promise<void>;
  updateIdentity(input: UpdateTarsIdentityInput): Promise<TarsSnapshot>;
  /** Change notifications; browser previews may omit them and read on focus instead. Returns an unsubscribe. */
  onChanged?(listener: (event: TarsChangedEvent) => void): () => void;
}
