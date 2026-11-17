import { z } from "zod";
import {
  AutomationRunStatusSchema, AutomationScheduleSchema, computeNextAutomationRunAt, getAutomationScheduleWeekdays, type AutomationSchedule,
} from "../automations";

/**
 * Schedules Tars sets up from the user's words. A Tars schedule is a
 * start-a-task schedule of Stave's existing Schedules service (an automation
 * record): that service stores it, fires it, starts its task with its own
 * guards and keeps its run history. Tars adds three things only: the proposal
 * the user confirms on a card, a record of which schedules it created (it
 * changes, pauses and removes no others), and a line in the conversation for
 * each run a schedule started.
 *
 * Times: an instant is saved in UTC. A repeating rule is a local wall-clock
 * rule ("every weekday at 09:00"), which the Schedules service resolves in
 * this computer's time zone on every run, so it keeps its local time across
 * daylight-saving changes. The zone in force when the schedule was saved is
 * kept for display.
 *
 * This module is imported by the conversation contract, so it does not import it.
 */

const IdSchema = z.string().trim().min(1).max(256);
const RevisionSchema = z.number().int().min(1);
const TimestampSchema = z.iso.datetime();
const ErrorSchema = z.string().trim().min(1).max(2_000);

/** The Schedules service's own limit for a schedule name. */
export const TARS_SCHEDULE_TITLE_MAX_CHARS = 120;
/** What a run is asked to do; far below the service's prompt limit, like a delegated instruction. */
export const TARS_SCHEDULE_REQUEST_MAX_CHARS = 8_000;
/** How many upcoming runs a card and a list row show. */
export const TARS_SCHEDULE_NEXT_RUNS = 2;
/** The shortest interval the Schedules service accepts. */
export const TARS_SCHEDULE_MIN_INTERVAL_MINUTES = 1;
/** Schedules the planner and the side section list; more are counted, not shown. */
export const TARS_SCHEDULE_LIST_MAX = 100;

/** A model's null for an optional field reads as absent, so it never fails the whole reply. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => value ?? undefined, schema.optional());

/**
 * When, as the model writes it. Deliberately loose: an impossible rule is
 * refused at admission with its own reason (`resolveTarsScheduleRule`) instead
 * of failing the whole reply.
 * - `recurring`: every N minutes, hours, days or weeks; `at` is a local time
 *   of day (days and weeks), `weekdays` the local weekdays of a week rule
 *   (0 = Sunday … 6 = Saturday).
 * - `once`: a local date and time, `YYYY-MM-DDTHH:mm`.
 */
export const TarsScheduleWhenSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recurring"),
    every: z.number(),
    unit: z.string().trim().min(1).max(20),
    at: optional(z.object({ hour: z.number(), minute: z.number() }).strict()),
    weekdays: optional(z.array(z.number()).max(14)),
  }).strict(),
  z.object({ kind: z.literal("once"), at: z.string().trim().min(1).max(40) }).strict(),
]);
export type TarsScheduleWhen = z.infer<typeof TarsScheduleWhenSchema>;

/** When, as the host admitted and saved it: a rule of the Schedules service, or one instant in UTC. */
export const TarsScheduleRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recurring"), schedule: AutomationScheduleSchema }).strict(),
  z.object({ kind: z.literal("once"), runAt: TimestampSchema }).strict(),
]);
export type TarsScheduleRule = z.infer<typeof TarsScheduleRuleSchema>;

export const TarsScheduleOperationSchema = z.enum(["create", "update", "pause", "resume", "remove", "list"]);
export type TarsScheduleOperation = z.infer<typeof TarsScheduleOperationSchema>;
/** The operations that change something and so wait for the user's confirmation. */
export const TarsScheduleChangeSchema = TarsScheduleOperationSchema.exclude(["list"]);
export type TarsScheduleChange = z.infer<typeof TarsScheduleChangeSchema>;

/**
 * Why the host refused a schedule proposal, a confirmation or a switch. The
 * interface translates the code; the English `error` beside it is a diagnostic.
 * - `invalidRule`: the repeat rule is not one the Schedules service runs.
 * - `invalidTime`: the date or time cannot be read, or does not exist locally.
 * - `pastTime`: a one-time run's time is not in the future.
 * - `tooFrequent`: the interval is shorter than the service's minimum.
 * - `unknownWorkspace`: the workspace is not registered, or its folder is gone.
 * - `notTarsSchedule`: no schedule Tars created has this id (the user's own schedules are theirs).
 * - `scheduleGone`: Tars created it, and it was removed since.
 * - `editedElsewhere`: it was changed in Schedules since Tars last set it.
 * - `alreadyPaused` / `alreadyOn`: it is already in that state.
 * - `runActive`: a run of it is going, so it cannot be removed yet.
 * - `notByFollowUp`: an automatic follow-up proposed it.
 * - `notWaiting`: the proposal no longer waits for a confirmation.
 */
export const TarsScheduleReasonSchema = z.enum([
  "invalidRule", "invalidTime", "pastTime", "tooFrequent", "unknownWorkspace", "notTarsSchedule", "scheduleGone", "editedElsewhere",
  "alreadyPaused", "alreadyOn", "runActive", "notByFollowUp", "notWaiting", "unknown",
]);
export type TarsScheduleReason = z.infer<typeof TarsScheduleReasonSchema>;

/**
 * The model's schedule proposal. It grants nothing: the host saves a change
 * as proposed and only the user's confirmation on its card applies it; `list`
 * only opens the list of schedules beside the conversation.
 */
export const TarsScheduleActionSchema = z.object({
  kind: z.literal("schedule"),
  operation: TarsScheduleOperationSchema,
  /** The schedule to change, pause, resume or remove: an id from the observations. */
  scheduleId: optional(IdSchema),
  /** A short name. Display only, so an overlong one is cut instead of failing the reply. */
  title: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim().slice(0, TARS_SCHEDULE_TITLE_MAX_CHARS) : undefined,
    z.string().min(1).max(TARS_SCHEDULE_TITLE_MAX_CHARS).optional()),
  /** What each run is asked to do, in plain words. */
  request: optional(z.string().trim().min(1).max(TARS_SCHEDULE_REQUEST_MAX_CHARS)),
  /** The registered workspace runs start in. */
  workspaceId: optional(IdSchema),
  when: optional(TarsScheduleWhenSchema),
}).strict().superRefine((action, context) => {
  const has = (key: "scheduleId" | "title" | "request" | "workspaceId" | "when") => action[key] !== undefined;
  // i18n-ignore: schema diagnostic, not user-facing copy
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (action.operation === "create") {
    // i18n-ignore: schema diagnostic, not user-facing copy
    if (!has("title") || !has("request") || !has("workspaceId") || !has("when")) issue("A new schedule needs a title, a request, a workspace and when it runs.");
    // i18n-ignore: schema diagnostic, not user-facing copy
    if (has("scheduleId")) issue("A new schedule has no id yet.");
    return;
  }
  if (action.operation === "list") {
    // i18n-ignore: schema diagnostic, not user-facing copy
    if (has("scheduleId") || has("title") || has("request") || has("workspaceId") || has("when")) issue("Listing schedules takes no other field.");
    return;
  }
  // i18n-ignore: schema diagnostic, not user-facing copy
  if (!has("scheduleId")) issue("Name the schedule by its id.");
  if (action.operation === "update") {
    // i18n-ignore: schema diagnostic, not user-facing copy
    if (!has("title") && !has("request") && !has("workspaceId") && !has("when")) issue("A change names at least one thing to change.");
    return;
  }
  // i18n-ignore: schema diagnostic, not user-facing copy
  if (has("title") || has("request") || has("workspaceId") || has("when")) issue("Pausing, resuming or removing a schedule takes only its id.");
});
export type TarsScheduleAction = z.infer<typeof TarsScheduleActionSchema>;

const PROPOSAL_REQUEST_ID = /^schedule:([A-Za-z0-9._-]+):([0-7])$/;
/** A schedule proposal's confirmation request id: the retry identity of that one decision. */
export function tarsScheduleProposalRequestId(messageId: string, actionIndex: number) {
  return `schedule:${messageId}:${actionIndex}`;
}
export function parseTarsScheduleProposalRequestId(requestId: string): { messageId: string; actionIndex: number } | null {
  const match = PROPOSAL_REQUEST_ID.exec(requestId);
  return match ? { messageId: match[1]!, actionIndex: Number(match[2]) } : null;
}

/** A card's button, or Enter while the card has focus. */
export const TarsScheduleSourceSchema = z.enum(["click", "key"]);
export type TarsScheduleSource = z.infer<typeof TarsScheduleSourceSchema>;

/**
 * The user's confirmation of one schedule card. It names the proposal only:
 * the host reads what to do from the saved proposal and checks everything
 * again. `enable` (a new schedule only) turns it on at once; absent, it is
 * saved paused, as every schedule a model proposes is.
 */
export const TarsScheduleConfirmInputSchema = z.object({
  requestId: IdSchema.regex(PROPOSAL_REQUEST_ID),
  enable: z.boolean().optional(),
  source: TarsScheduleSourceSchema,
}).strict();
export type TarsScheduleConfirmInput = z.infer<typeof TarsScheduleConfirmInputSchema>;

/** The pause switch on a schedule Tars created: the user's own click, recorded like one. */
export const TarsScheduleToggleInputSchema = z.object({
  requestId: IdSchema.regex(/^schedule-switch:[A-Za-z0-9._-]+$/),
  scheduleId: IdSchema,
  paused: z.boolean(),
  source: TarsScheduleSourceSchema,
}).strict();
export type TarsScheduleToggleInput = z.infer<typeof TarsScheduleToggleInputSchema>;

export const TarsSchedulePreviewInputSchema = z.object({ requestId: IdSchema.regex(PROPOSAL_REQUEST_ID) }).strict();
export type TarsSchedulePreviewInput = z.infer<typeof TarsSchedulePreviewInputSchema>;

/** Where a schedule's runs start, as the registry names it now. */
export const TarsScheduleWorkspaceSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(200),
  branch: z.string().trim().min(1).max(500).optional(),
  repositoryName: z.string().trim().min(1).max(200),
}).strict();
export type TarsScheduleWorkspace = z.infer<typeof TarsScheduleWorkspaceSchema>;

const TitleSchema = z.string().trim().min(1).max(TARS_SCHEDULE_TITLE_MAX_CHARS);
/** A stored request can be the user's own edit in Schedules, which allows more than a proposal does. */
const RequestSchema = z.string().trim().min(1).max(100_000);
const TimeZoneSchema = z.string().trim().min(1).max(64);
const NextRunsSchema = z.array(TimestampSchema).max(TARS_SCHEDULE_NEXT_RUNS);

/** What a schedule is: what runs, where and when. */
const scheduleFacts = {
  title: TitleSchema,
  request: RequestSchema,
  /** Null when its workspace is no longer registered; its runs fail until it is changed. */
  workspace: TarsScheduleWorkspaceSchema.nullable(),
  rule: TarsScheduleRuleSchema,
};
export const TarsScheduleFactsSchema = z.object(scheduleFacts).strict();
export type TarsScheduleFacts = z.infer<typeof TarsScheduleFactsSchema>;

/**
 * What a schedule card shows before the user confirms, read by the host from
 * the saved proposal and the Schedules service as they are now. `reason` null
 * means the host would apply it now; the confirmation checks everything again.
 */
export const TarsSchedulePreviewSchema = z.object({
  requestId: IdSchema,
  operation: TarsScheduleChangeSchema,
  reason: TarsScheduleReasonSchema.nullable(),
  error: ErrorSchema.nullable(),
  scheduleId: IdSchema.nullable(),
  /** What the schedule will be once confirmed; null when the proposal cannot be read that far. */
  next: TarsScheduleFactsSchema.nullable(),
  /** What it is now, for a change, a pause, a resume or a removal; null for a new schedule. */
  current: TarsScheduleFactsSchema.extend({ enabled: z.boolean() }).strict().nullable(),
  /** The zone the times are read in: this computer's, by IANA name. */
  timezone: TimeZoneSchema,
  /** The next runs under `next`'s rule if it is on, in UTC, soonest first. Empty for a pause or a removal. */
  nextRuns: NextRunsSchema,
  /** Whether it will be on once confirmed without `enable`: a new schedule starts paused. */
  enabledAfter: z.boolean(),
  /** Whether the Schedules service lets a new schedule be turned on as it is created. */
  canEnableOnCreate: z.boolean(),
}).strict();
export type TarsSchedulePreview = z.infer<typeof TarsSchedulePreviewSchema>;

/** What one confirmation or switch applied, kept with its record so the line reads the same after the schedule changes again. */
export const TarsScheduleSummarySchema = z.object({
  title: TitleSchema,
  workspace: TarsScheduleWorkspaceSchema.nullable(),
  rule: TarsScheduleRuleSchema,
  timezone: TimeZoneSchema,
  enabled: z.boolean(),
  nextRuns: NextRunsSchema,
}).strict();
export type TarsScheduleSummary = z.infer<typeof TarsScheduleSummarySchema>;

/**
 * One confirmation (or one switch) and its outcome, in the conversation. Its
 * request id is the retry identity: the same id again returns this record and
 * applies nothing twice. Never a user message or a model proposal.
 */
export const TarsScheduleRecordSchema = z.object({
  requestId: IdSchema,
  source: TarsScheduleSourceSchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  operation: TarsScheduleChangeSchema,
  /** The word proposal this confirmed; null for the pause switch. */
  proposal: z.object({ messageId: IdSchema, actionIndex: z.number().int().min(0).max(7) }).strict().nullable(),
  /** The schedule it is about. A new schedule's id is fixed when its confirmation is recorded, before anything is created. */
  scheduleId: IdSchema,
  /** A new schedule only: the user chose to turn it on as it was created. */
  enable: z.boolean().optional(),
  status: z.enum(["pending", "applied", "rejected"]),
  reason: TarsScheduleReasonSchema.nullable(),
  error: ErrorSchema.nullable(),
  summary: TarsScheduleSummarySchema.nullable(),
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  const rejected = record.status === "rejected";
  const consistent = rejected === (record.error !== null) && rejected === (record.reason !== null)
    && (record.status === "applied") === (record.summary !== null)
    && (record.enable === undefined || record.operation === "create");
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (!consistent) context.addIssue({ code: "custom", message: "Schedule record status and outcome fields disagree." });
});
export type TarsScheduleRecord = z.infer<typeof TarsScheduleRecordSchema>;

export const TarsScheduleResultSchema = z.object({ record: TarsScheduleRecordSchema }).strict();
export type TarsScheduleResult = z.infer<typeof TarsScheduleResultSchema>;

/**
 * One run a Tars schedule started, as the conversation records it. Nobody
 * typed it and Tars did not decide it: its actor is the schedule. The
 * Schedules service owns the run; this is its last observed state.
 */
export const TarsScheduleRunSchema = z.object({
  runId: IdSchema,
  scheduleId: IdSchema,
  title: TitleSchema,
  actor: z.literal("schedule"),
  status: AutomationRunStatusSchema,
  /** The instant it was scheduled for, in UTC. */
  scheduledFor: TimestampSchema.nullable(),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
  workspaceId: IdSchema,
  /** The repository the run's workspace belongs to, for opening its task. */
  repositoryPath: z.string().min(1).max(4_096),
  /** The task the run started; null when it failed or was skipped before one existed. */
  taskId: IdSchema.nullable(),
  /** English diagnostic from the Schedules service; shown as a detail. */
  error: z.string().max(2_000).nullable(),
  updatedAt: TimestampSchema,
}).strict();
export type TarsScheduleRun = z.infer<typeof TarsScheduleRunSchema>;

/** A schedule Tars created, as the Schedules service has it now. */
export const TarsScheduleViewSchema = z.object({
  id: IdSchema,
  ...scheduleFacts,
  /** The zone in force when Tars last saved it. */
  timezone: TimeZoneSchema,
  enabled: z.boolean(),
  nextRuns: NextRunsSchema,
  /** Its newest run of any kind (scheduled, or started by hand in Schedules); null before the first. */
  lastRun: z.object({
    status: AutomationRunStatusSchema,
    at: TimestampSchema,
    trigger: z.enum(["scheduled", "manual"]),
    taskId: IdSchema.nullable(),
    workspaceId: IdSchema,
  }).strict().nullable(),
  /** Changed in Schedules since Tars last set it: Tars no longer changes, pauses or removes it. */
  editedElsewhere: z.boolean(),
  createdAt: TimestampSchema,
}).strict();
export type TarsScheduleView = z.infer<typeof TarsScheduleViewSchema>;

export const TarsScheduleListSchema = z.object({
  timezone: TimeZoneSchema,
  schedules: z.array(TarsScheduleViewSchema).max(TARS_SCHEDULE_LIST_MAX),
  /** Schedules beyond the list's limit. */
  omitted: z.number().int().min(0),
}).strict();
export type TarsScheduleList = z.infer<typeof TarsScheduleListSchema>;

export type TarsScheduleRuleResult =
  | { ok: true; rule: TarsScheduleRule }
  | { ok: false; reason: Extract<TarsScheduleReason, "invalidRule" | "invalidTime" | "pastTime" | "tooFrequent">; error: string };

const UNITS: Readonly<Record<string, AutomationSchedule["unit"]>> = {
  minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days", week: "weeks", weeks: "weeks",
};
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * A model-written `when` as a rule the Schedules service runs, or why not.
 * `now` is the instant a one-time run must come after. A local date and time
 * is read in this computer's zone (the process zone), where the service also
 * resolves every repeating rule; a time that does not exist there, such as
 * inside a daylight-saving jump, is refused instead of moved.
 */
export function resolveTarsScheduleRule(when: TarsScheduleWhen, now: Date): TarsScheduleRuleResult {
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  const refuse = (reason: Extract<TarsScheduleRuleResult, { ok: false }>["reason"], error: string): TarsScheduleRuleResult => ({ ok: false, reason, error });
  if (when.kind === "once") {
    let runAt: Date;
    const local = LOCAL_TIME.exec(when.at);
    if (local) {
      const [year, month, day, hour, minute] = local.slice(1, 6).map(Number) as [number, number, number, number, number];
      runAt = new Date(year, month - 1, day, hour, minute, 0, 0);
      const exists = runAt.getFullYear() === year && runAt.getMonth() === month - 1 && runAt.getDate() === day
        && runAt.getHours() === hour && runAt.getMinutes() === minute;
      // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
      if (!exists) return refuse("invalidTime", "That local date and time does not exist, for example inside a daylight-saving change.");
    } else if (OFFSET_TIME.test(when.at) && !Number.isNaN(Date.parse(when.at))) runAt = new Date(when.at);
    // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
    else return refuse("invalidTime", "A one-time run needs a local date and time as YYYY-MM-DDTHH:mm.");
    // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
    if (runAt.getTime() <= now.getTime()) return refuse("pastTime", "A one-time run's time must be in the future.");
    return { ok: true, rule: { kind: "once", runAt: runAt.toISOString() } };
  }
  const unit = UNITS[when.unit.toLocaleLowerCase()];
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (/^(?:milli)?seconds?$/i.test(when.unit)) return refuse("tooFrequent", `The shortest interval Schedules runs is ${TARS_SCHEDULE_MIN_INTERVAL_MINUTES} minute.`);
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (!unit) return refuse("invalidRule", "A repeating schedule runs every N minutes, hours, days or weeks.");
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (!Number.isFinite(when.every) || when.every <= 0) return refuse("invalidRule", "The interval must be a whole number of at least 1.");
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (when.every < 1) return refuse("tooFrequent", `The shortest interval Schedules runs is ${TARS_SCHEDULE_MIN_INTERVAL_MINUTES} minute.`);
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (!Number.isInteger(when.every)) return refuse("invalidRule", "The interval must be a whole number.");
  if (when.at && !(Number.isInteger(when.at.hour) && when.at.hour >= 0 && when.at.hour <= 23 && Number.isInteger(when.at.minute) && when.at.minute >= 0 && when.at.minute <= 59))
    // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
    return refuse("invalidTime", "The time of day must be an hour from 0 to 23 and a minute from 0 to 59.");
  const weekdays = when.weekdays?.length ? [...new Set(when.weekdays)].sort((left, right) => left - right) : undefined;
  const parsed = AutomationScheduleSchema.safeParse({ every: when.every, unit, ...(when.at ? { at: when.at } : {}), ...(weekdays ? { weekdays } : {}) });
  // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
  if (!parsed.success) return refuse("invalidRule", parsed.error.issues[0]?.message.slice(0, 500) || "The Schedules service does not run this rule.");
  return { ok: true, rule: { kind: "recurring", schedule: parsed.data } };
}

/** The next runs of a rule that is on, after `after`, soonest first, in UTC. */
export function tarsScheduleNextRuns(rule: TarsScheduleRule, after: Date, count = TARS_SCHEDULE_NEXT_RUNS): string[] {
  if (rule.kind === "once") return Date.parse(rule.runAt) > after.getTime() ? [rule.runAt] : [];
  const runs: string[] = [];
  let cursor: Date = after;
  for (let index = 0; index < count; index += 1) {
    const next = computeNextAutomationRunAt({ schedule: rule.schedule, after: cursor });
    runs.push(next);
    cursor = new Date(next);
  }
  return runs;
}

/** The rule of a schedule as the Schedules service saved it. */
export function tarsScheduleRuleOf(automation: { schedule: AutomationSchedule; runOnceAt?: string | undefined }): TarsScheduleRule {
  return automation.runOnceAt !== undefined ? { kind: "once", runAt: new Date(automation.runOnceAt).toISOString() } : { kind: "recurring", schedule: automation.schedule };
}

/** A local time of day to keep as a one-time schedule's fallback cadence. */
export function tarsScheduleFallbackCadence(runAt: string): AutomationSchedule {
  const at = new Date(runAt);
  return { every: 1, unit: "days", at: { hour: at.getHours(), minute: at.getMinutes() } };
}

/**
 * What Tars compares to tell its own last save from an edit made elsewhere:
 * the name, the request, the workspace, the rule and the permission mode, in
 * one fixed order. Turning a schedule on or off, and its model, are not
 * content. The permission mode is: Tars saves every schedule as Guided, so one
 * the user made unattended in Schedules is theirs, and Tars never rewrites
 * what such a schedule runs.
 */
export function tarsScheduleContentKey(content: { title: string; request: string; workspaceId: string; rule: TarsScheduleRule; trustPolicy: string }): string {
  const rule = content.rule.kind === "once" ? ["once", new Date(content.rule.runAt).toISOString()]
    : ["recurring", content.rule.schedule.every, content.rule.schedule.unit, content.rule.schedule.at?.hour ?? null, content.rule.schedule.at?.minute ?? null,
      getAutomationScheduleWeekdays(content.rule.schedule)];
  return JSON.stringify([content.title.trim(), content.request.trim(), content.workspaceId, rule, content.trustPolicy]);
}

/** A schedule proposal as the conversation shows it: its card while it waits, its record once confirmed. */
export interface TarsScheduleProposalView {
  requestId: string;
  messageId: string;
  actionIndex: number;
  action: TarsScheduleAction;
  state: "waiting" | "settled";
  record: TarsScheduleRecord | null;
}

/**
 * The schedule proposals that show a card or a record. A proposal refused
 * when it was made, and a `list` (which only opens the list), stay receipt lines.
 */
export function projectTarsScheduleProposals(
  receipts: ReadonlyArray<{ messageId: string; actionIndex: number; status: string; action: { kind: string } }>,
  records: readonly TarsScheduleRecord[],
): TarsScheduleProposalView[] {
  const byId = new Map(records.map((record) => [record.requestId, record]));
  return receipts.flatMap((receipt): TarsScheduleProposalView[] => {
    if (receipt.action.kind !== "schedule") return [];
    const action = receipt.action as TarsScheduleAction;
    if (action.operation === "list") return [];
    const requestId = tarsScheduleProposalRequestId(receipt.messageId, receipt.actionIndex);
    const record = byId.get(requestId) ?? null;
    const base = { requestId, messageId: receipt.messageId, actionIndex: receipt.actionIndex, action, record };
    if (record) return [{ ...base, state: "settled" }];
    return receipt.status === "proposed" ? [{ ...base, state: "waiting" }] : [];
  });
}

/** The user's clock as the planner reads it: local wall-clock time, never an offset to convert. */
export interface TarsPlannerClock {
  /** The current instant in UTC. */
  utc: string;
  /** The same instant as local wall-clock time, `YYYY-MM-DDTHH:mm`, in `timezone`. */
  local: string;
  /** This computer's zone by IANA name. */
  timezone: string;
  /** The local weekday, 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

export function tarsPlannerClock(now: Date, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"): TarsPlannerClock {
  const two = (value: number) => String(value).padStart(2, "0");
  return { utc: now.toISOString(), timezone, weekday: now.getDay(),
    local: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}T${two(now.getHours())}:${two(now.getMinutes())}` };
}

/** How many schedules the planner sees, and how much of each request. */
export const TARS_PLANNER_SCHEDULES_MAX = 20;
export const TARS_PLANNER_SCHEDULE_REQUEST_CHARS = 300;

/** The schedules Tars created, as the planner reads them: enough to name one, say when it runs and tell whether it is still Tars's to change. */
export function tarsPlannerSchedules(list: TarsScheduleList | null | undefined) {
  const schedules = (list?.schedules ?? []).slice(0, TARS_PLANNER_SCHEDULES_MAX).map((schedule) => ({
    id: schedule.id, title: schedule.title, requestExcerpt: schedule.request.slice(0, TARS_PLANNER_SCHEDULE_REQUEST_CHARS),
    workspaceId: schedule.workspace?.id ?? null, when: schedule.rule, enabled: schedule.enabled, nextRuns: schedule.nextRuns,
    lastRun: schedule.lastRun ? { status: schedule.lastRun.status, at: schedule.lastRun.at } : null,
    ...(schedule.editedElsewhere ? { editedElsewhere: true } : {}),
  }));
  return { schedules, omitted: (list?.schedules.length ?? 0) - schedules.length + (list?.omitted ?? 0), available: list != null };
}
