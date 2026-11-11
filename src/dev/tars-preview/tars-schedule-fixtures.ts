import { computeNextAutomationRunAt } from "@/lib/automations";
import type { TarsActionReceipt, TarsConversation, TarsDecision } from "@/lib/tars/conversation";
import {
  parseTarsScheduleProposalRequestId, resolveTarsScheduleRule, TarsScheduleListSchema, tarsScheduleNextRuns, TarsSchedulePreviewSchema, tarsScheduleProposalRequestId,
  TarsScheduleRecordSchema, TarsScheduleRunSchema,
  type TarsScheduleAction, type TarsScheduleChange, type TarsScheduleConfirmInput, type TarsScheduleFacts, type TarsScheduleReason, type TarsScheduleRecord,
  type TarsScheduleRule, type TarsScheduleSource, type TarsScheduleToggleInput, type TarsScheduleWorkspace,
} from "@/lib/tars/schedules";
import type { TarsBridgeApi } from "@/lib/tars/types";

/** A schedule in the preview's stand-in for the Schedules service. */
interface PreviewSchedule {
  id: string;
  title: string;
  request: string;
  workspaceId: string;
  rule: TarsScheduleRule;
  enabled: boolean;
  nextRunAt: string | null;
  /** Created through Tars; the fixture's own "made in Schedules" entry is not. */
  byTars: boolean;
  editedElsewhere: boolean;
  createdAt: string;
}

interface PreviewScheduleState {
  schedules: PreviewSchedule[];
  /** Runs still going, with the tick they end at. */
  active: Array<{ runId: string; endsAt: number }>;
  sequence: number;
}

const WORKSPACE: TarsScheduleWorkspace = { id: "preview-workspace", name: "Release check", branch: "main", repositoryName: "preview" };
/** How long a preview run takes before it reads as finished. */
const RUN_MS = 5 * 60_000;

/**
 * The host's schedule path against the preview's saved state, on the page's
 * own clock: the same rule resolution (`resolveTarsScheduleRule`), next-run
 * math (the Schedules service's `computeNextAutomationRunAt`), ownership
 * refusals and record shapes. A timer fires due schedules and records their
 * runs, so a test that moves the clock sees a schedule fire. Kept in session
 * storage, so a reload behaves like a restart. `schedules=mine` also starts
 * with one schedule the user made in Schedules, which Tars must refuse.
 */
export function createPreviewScheduleBridge(args: {
  storageKey: string;
  korean: boolean;
  mode: string;
  conversation: Pick<TarsConversation, "receipts" | "schedules" | "scheduleRuns">;
  /** Saves the conversation and announces the change, as the host's notification would. */
  changed: () => void;
}) {
  const { conversation, korean } = args;
  const saved = JSON.parse(sessionStorage.getItem(args.storageKey) ?? "null") as PreviewScheduleState | null;
  const state: PreviewScheduleState = saved ?? { schedules: [], active: [], sequence: 0 };
  conversation.schedules ??= [];
  conversation.scheduleRuns ??= [];
  const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const now = () => new Date();
  if (!saved && args.mode === "mine") state.schedules.push({ id: "user-nightly", title: "Nightly dependency review", request: "Review dependency updates.", workspaceId: WORKSPACE.id,
    rule: { kind: "recurring", schedule: { every: 1, unit: "days", at: { hour: 2, minute: 0 } } }, enabled: true,
    nextRunAt: computeNextAutomationRunAt({ schedule: { every: 1, unit: "days", at: { hour: 2, minute: 0 } }, after: now() }), byTars: false, editedElsewhere: false, createdAt: now().toISOString() });
  const save = () => { sessionStorage.setItem(args.storageKey, JSON.stringify(state)); args.changed(); };
  const nextOf = (rule: TarsScheduleRule, after: Date) => tarsScheduleNextRuns(rule, after, 1)[0] ?? null;
  const factsOf = (schedule: PreviewSchedule): TarsScheduleFacts => ({ title: schedule.title, request: schedule.request, workspace: WORKSPACE, rule: schedule.rule });
  const newest = () => [...state.schedules].reverse().find((schedule) => schedule.byTars);

  /** What a proposal comes to against the saved schedules, as the host reads it at proposal, preview and confirmation. */
  function resolve(action: TarsScheduleAction, requestId: string): { scheduleId: string; schedule: PreviewSchedule | null; next: TarsScheduleFacts | null; reason: TarsScheduleReason | null } {
    if (action.operation === "create") {
      const scheduleId = `tars-${requestId.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
      const existing = state.schedules.find((entry) => entry.id === scheduleId) ?? null;
      if (action.workspaceId !== WORKSPACE.id) return { scheduleId, schedule: existing, next: null, reason: "unknownWorkspace" };
      const rule = existing ? { ok: true as const, rule: existing.rule } : resolveTarsScheduleRule(action.when!, now());
      if (!rule.ok) return { scheduleId, schedule: existing, next: null, reason: rule.reason };
      return { scheduleId, schedule: existing, next: { title: action.title!, request: action.request!, workspace: WORKSPACE, rule: rule.rule }, reason: null };
    }
    const scheduleId = action.scheduleId!;
    const schedule = state.schedules.find((entry) => entry.id === scheduleId) ?? null;
    if (!schedule) return { scheduleId, schedule: null, next: null, reason: conversation.schedules!.some((record) => record.scheduleId === scheduleId) ? "scheduleGone" : "notTarsSchedule" };
    if (!schedule.byTars) return { scheduleId, schedule: null, next: null, reason: "notTarsSchedule" };
    let next = factsOf(schedule);
    if (action.operation === "update") {
      const rule = action.when ? resolveTarsScheduleRule(action.when, now()) : null;
      next = { ...next, ...(action.title ? { title: action.title } : {}), ...(action.request ? { request: action.request } : {}) };
      if (rule && !rule.ok) return { scheduleId, schedule, next, reason: rule.reason };
      if (rule?.ok) next = { ...next, rule: rule.rule };
    }
    const reason = schedule.editedElsewhere ? "editedElsewhere" as const : action.operation === "pause" && !schedule.enabled ? "alreadyPaused" as const
      : action.operation === "resume" && schedule.enabled ? "alreadyOn" as const
        : action.operation === "resume" && schedule.rule.kind === "once" && Date.parse(schedule.rule.runAt) <= now().getTime() ? "pastTime" as const : null;
    return { scheduleId, schedule, next, reason };
  }

  function record(input: { requestId: string; source: TarsScheduleSource; operation: TarsScheduleChange; scheduleId: string; proposal: TarsScheduleRecord["proposal"]; enable?: boolean },
    outcome: { reason: TarsScheduleReason } | { facts: TarsScheduleFacts; enabled: boolean }): TarsScheduleRecord {
    const at = now().toISOString();
    const rejected = "reason" in outcome ? outcome : null;
    const applied = "facts" in outcome ? outcome : null;
    const value = TarsScheduleRecordSchema.parse({ requestId: input.requestId, source: input.source, requestHash: "e".repeat(64), operation: input.operation, proposal: input.proposal,
      scheduleId: input.scheduleId, ...(input.operation === "create" ? { enable: input.enable === true } : {}), status: rejected ? "rejected" : "applied",
      reason: rejected?.reason ?? null, error: rejected ? "Preview schedule change is not admissible." : null,
      summary: applied ? { title: applied.facts.title, workspace: applied.facts.workspace, rule: applied.facts.rule, timezone: timezone(), enabled: applied.enabled,
        nextRuns: applied.enabled ? tarsScheduleNextRuns(applied.facts.rule, now()) : [] } : null,
      revision: 2, createdAt: at, updatedAt: at });
    conversation.schedules!.push(value);
    return value;
  }

  /** Applies one admitted change to the preview's schedules; the caller has already checked `resolve`. */
  function apply(operation: TarsScheduleChange, resolved: ReturnType<typeof resolve>, enable: boolean): { facts: TarsScheduleFacts; enabled: boolean } {
    const at = now();
    const { schedule, next } = resolved;
    if (operation === "create") {
      const created: PreviewSchedule = schedule ?? { id: resolved.scheduleId, title: next!.title, request: next!.request, workspaceId: WORKSPACE.id, rule: next!.rule, enabled: enable,
        nextRunAt: enable ? nextOf(next!.rule, at) : null, byTars: true, editedElsewhere: false, createdAt: at.toISOString() };
      if (!schedule) state.schedules.push(created);
      return { facts: factsOf(created), enabled: created.enabled };
    }
    if (operation === "remove") {
      state.schedules = state.schedules.filter((entry) => entry.id !== schedule!.id);
      return { facts: factsOf(schedule!), enabled: false };
    }
    if (operation === "update") Object.assign(schedule!, { title: next!.title, request: next!.request, rule: next!.rule, nextRunAt: schedule!.enabled ? nextOf(next!.rule, at) : null });
    else Object.assign(schedule!, { enabled: operation === "resume", nextRunAt: operation === "resume" ? nextOf(schedule!.rule, at) : null });
    return { facts: factsOf(schedule!), enabled: schedule!.enabled };
  }

  /** Fires what is due and ends runs whose time is up, as the Schedules service's tick does. */
  function tick() {
    const at = now();
    let changed = false;
    for (const active of [...state.active]) {
      if (active.endsAt > at.getTime()) continue;
      state.active = state.active.filter((entry) => entry !== active);
      const run = conversation.scheduleRuns!.find((entry) => entry.runId === active.runId);
      if (run) Object.assign(run, { status: "completed", completedAt: at.toISOString(), updatedAt: at.toISOString() });
      changed = true;
    }
    for (const schedule of state.schedules) {
      if (!schedule.enabled || !schedule.nextRunAt || Date.parse(schedule.nextRunAt) > at.getTime()) continue;
      const scheduledFor = schedule.nextRunAt;
      const busy = state.active.some((entry) => conversation.scheduleRuns!.find((run) => run.runId === entry.runId)?.scheduleId === schedule.id);
      const runId = `preview-run-${++state.sequence}`;
      // A one-time schedule's run is its only one; a repeating one moves to its next instant.
      if (schedule.rule.kind === "once") Object.assign(schedule, { enabled: false, nextRunAt: null });
      else schedule.nextRunAt = nextOf(schedule.rule, at);
      // Only Tars's own schedules reach its conversation.
      if (schedule.byTars) conversation.scheduleRuns!.push(TarsScheduleRunSchema.parse({ runId, scheduleId: schedule.id, title: schedule.title, actor: "schedule",
        status: busy ? "skipped" : "running", scheduledFor, startedAt: at.toISOString(), completedAt: busy ? at.toISOString() : null, workspaceId: WORKSPACE.id,
        repositoryPath: "/tmp/preview", taskId: busy ? null : `preview-scheduled-task-${state.sequence}`,
        error: busy ? "Skipped because the automation reached its concurrency limit (1)." : null, updatedAt: at.toISOString() }));
      if (!busy) state.active.push({ runId, endsAt: at.getTime() + RUN_MS });
      changed = true;
    }
    if (changed) save();
  }
  const timer = setInterval(tick, 1_000);

  const bridge: Required<Pick<TarsBridgeApi, "previewSchedule" | "confirmSchedule" | "toggleSchedule" | "listSchedules">> = {
    previewSchedule: async ({ requestId }) => {
      const ref = parseTarsScheduleProposalRequestId(requestId);
      const receipt = ref ? conversation.receipts.find((entry) => entry.messageId === ref.messageId && entry.actionIndex === ref.actionIndex) : undefined;
      if (receipt?.action.kind !== "schedule" || receipt.action.operation === "list") throw new Error("This request does not name a schedule proposal.");
      const action = receipt.action;
      const resolved = resolve(action, requestId);
      const operation = action.operation as TarsScheduleChange;
      const current = resolved.schedule && operation !== "create" ? { ...factsOf(resolved.schedule), enabled: resolved.schedule.enabled } : null;
      return TarsSchedulePreviewSchema.parse({ requestId, operation, reason: receipt.status === "proposed" ? resolved.reason : "notWaiting",
        error: receipt.status !== "proposed" || resolved.reason ? "Preview schedule change is not admissible." : null,
        scheduleId: resolved.schedule || operation === "create" ? resolved.scheduleId : null, next: resolved.next, current, timezone: timezone(),
        nextRuns: resolved.next && operation !== "pause" && operation !== "remove" ? tarsScheduleNextRuns(resolved.next.rule, now()) : [],
        enabledAfter: operation === "create" ? false : operation === "resume" ? true : operation === "update" ? current?.enabled ?? false : false, canEnableOnCreate: true });
    },
    confirmSchedule: async ({ requestId, source, enable }: TarsScheduleConfirmInput) => {
      const existing = conversation.schedules!.find((entry) => entry.requestId === requestId);
      if (existing) return { record: structuredClone(existing) };
      const ref = parseTarsScheduleProposalRequestId(requestId);
      const receipt = ref ? conversation.receipts.find((entry) => entry.messageId === ref.messageId && entry.actionIndex === ref.actionIndex) : undefined;
      if (receipt?.action.kind !== "schedule" || receipt.action.operation === "list" || receipt.status !== "proposed") throw new Error("This proposal is not awaiting confirmation.");
      const operation = receipt.action.operation as TarsScheduleChange;
      const resolved = resolve(receipt.action, requestId);
      const base = { requestId, source, operation, scheduleId: resolved.scheduleId, proposal: ref, ...(operation === "create" ? { enable: enable === true } : {}) };
      const saved = record(base, resolved.reason ? { reason: resolved.reason } : apply(operation, resolved, enable === true));
      // The proposal settles with its record, as the host does in one transaction.
      Object.assign(receipt, resolved.reason ? { status: "rejected", error: saved.error, reason: resolved.reason } : { status: "applied" }, { revision: receipt.revision + 1 });
      save();
      return { record: structuredClone(saved) };
    },
    toggleSchedule: async ({ requestId, scheduleId, paused, source }: TarsScheduleToggleInput) => {
      const existing = conversation.schedules!.find((entry) => entry.requestId === requestId);
      if (existing) return { record: structuredClone(existing) };
      const operation = paused ? "pause" as const : "resume" as const;
      const resolved = resolve({ kind: "schedule", operation, scheduleId }, requestId);
      const saved = record({ requestId, source, operation, scheduleId, proposal: null }, resolved.reason ? { reason: resolved.reason } : apply(operation, resolved, false));
      save();
      return { record: structuredClone(saved) };
    },
    listSchedules: async () => {
      const at = now();
      return TarsScheduleListSchema.parse({ timezone: timezone(), omitted: 0, schedules: state.schedules.filter((schedule) => schedule.byTars).map((schedule) => {
        const last = [...conversation.scheduleRuns!].reverse().find((run) => run.scheduleId === schedule.id);
        return { id: schedule.id, ...factsOf(schedule), timezone: timezone(), enabled: schedule.enabled,
          nextRuns: !schedule.enabled || !schedule.nextRunAt ? [] : schedule.rule.kind === "once" ? [schedule.nextRunAt]
            : [schedule.nextRunAt, ...tarsScheduleNextRuns(schedule.rule, new Date(Math.max(Date.parse(schedule.nextRunAt), at.getTime())), 1)],
          lastRun: last ? { status: last.status, at: last.completedAt ?? last.startedAt, trigger: "scheduled" as const, taskId: last.taskId, workspaceId: last.workspaceId } : null,
          editedElsewhere: schedule.editedElsewhere, createdAt: schedule.createdAt };
      }) });
    },
  };

  /**
   * What Tars proposes for a message about schedules, as the planner would:
   * a new schedule from "every weekday at 9", "every N minutes", "tomorrow at
   * 3" or "yesterday" (a time that passed), or a change to the newest one.
   */
  function decide(text: string, decision: TarsDecision): boolean {
    const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const request = korean ? "릴리스 브랜치에 새 커밋과 실패한 검사가 있는지 확인하고 바뀐 내용을 요약합니다."
      : "Check the release branch for new commits and failing checks, and summarize what changed.";
    const create = (title: string, when: TarsScheduleAction["when"]) => {
      decision.reply = korean ? "일정 카드를 띄웠습니다. 확인하기 전에는 아무것도 만들어지지 않습니다." : "Here is the schedule card. Nothing is created until you confirm it.";
      decision.actions.push({ kind: "schedule", operation: "create", title, request, workspaceId: WORKSPACE.id, when });
      return true;
    };
    const change = (operation: "pause" | "resume" | "remove" | "update", extra: Partial<TarsScheduleAction> = {}) => {
      // `schedules=mine`: Tars names the user's own schedule, which the host must refuse.
      const target = args.mode === "mine" ? state.schedules.find((schedule) => !schedule.byTars) : newest();
      if (!target) { decision.reply = korean ? "제가 만든 일정이 없습니다." : "There is no schedule I set up."; return true; }
      decision.reply = korean ? "카드에서 확인해 주세요." : "Confirm it on the card.";
      decision.actions.push({ kind: "schedule", operation, scheduleId: target.id, ...extra });
      return true;
    };
    if (/\b(show|list|what)\b.*\bschedule|일정.*(보여|목록)/i.test(text)) {
      decision.reply = korean ? "일정 목록을 열었습니다." : "I opened the list of schedules.";
      decision.actions.push({ kind: "schedule", operation: "list" });
      return true;
    }
    if (/\b(remove|delete)\b.*\bschedule|일정.*삭제/i.test(text)) return change("remove");
    if (/\bpause\b.*\bschedule|일정.*(중지|멈)/i.test(text)) return change("pause");
    if (/\b(resume|turn on)\b.*\bschedule|일정.*켜/i.test(text)) return change("resume");
    if (/\b(change|move)\b.*\bschedule|일정.*(변경|바꿔)/i.test(text))
      return change("update", { title: korean ? "릴리스 브랜치 매일 확인" : "Check the release branch daily", when: { kind: "recurring", every: 1, unit: "days", at: { hour: 10, minute: 30 } } });
    const minutes = /every (\d+(?:\.\d+)?) (seconds?|minutes?)|(\d+)분마다/i.exec(text);
    if (minutes) return create(korean ? "릴리스 브랜치 확인" : "Check the release branch",
      { kind: "recurring", every: Number(minutes[1] ?? minutes[3]), unit: minutes[2] ?? "minutes" });
    if (/every weekday|평일/i.test(text)) return create(korean ? "릴리스 브랜치 확인" : "Check the release branch",
      { kind: "recurring", every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] });
    if (/yesterday|어제/i.test(text)) return create(korean ? "다시 확인" : "Look at this again", { kind: "once", at: `${local(new Date(now().getTime() - 86_400_000))}T15:00` });
    if (/tomorrow|내일/i.test(text)) return create(korean ? "다시 확인" : "Look at this again", { kind: "once", at: `${local(new Date(now().getTime() + 86_400_000))}T15:00` });
    return false;
  }

  /** The receipt the host would save for a schedule action: applied for a list, proposed, or refused with its reason. */
  function receiptFor(action: TarsScheduleAction, messageId: string, actionIndex: number, createdAt: string): TarsActionReceipt {
    const base = { messageId, actionIndex, requestHash: "c".repeat(64), action, responsibilityId: null, createdAt, updatedAt: createdAt };
    if (action.operation === "list") return { ...base, status: "applied", error: null, reason: null, revision: 2 };
    const { reason } = resolve(action, tarsScheduleProposalRequestId(messageId, actionIndex));
    return reason ? { ...base, status: "rejected", error: "Preview schedule change is not admissible.", reason, revision: 2 } : { ...base, status: "proposed", error: null, reason: null, revision: 1 };
  }

  return { bridge, decide, receiptFor, stop: () => clearInterval(timer) };
}
