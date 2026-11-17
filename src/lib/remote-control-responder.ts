import { i18n } from "@/i18n/runtime";
import { isFleetAttentionSuppressedTask } from "@/lib/fleet/attention-projection";
import { deliverFleetInteraction } from "@/lib/fleet/interaction-respond";
import {
  REMOTE_SNAPSHOT_MAX_REQUESTS,
  REMOTE_SNAPSHOT_MAX_TASKS,
  RemoteActionSchema,
  RemoteRendererRequestSchema,
  RemoteSnapshotSchema,
  type RemoteAction,
  type RemoteControlApi,
  type RemoteRequest,
  type RemoteResult,
  type RemoteSnapshot,
  type RemoteTask,
} from "@/lib/remote-control";
import { isTaskArchived } from "@/lib/tasks";
import { getUserInputAnswerKey, isUserInputAnswerRequired } from "@/lib/user-input-answers";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { ApprovalPart, ChatMessage, UserInputPart } from "@/types/chat";

/**
 * The renderer half of remote control. A phone's request reaches this window
 * through main; nothing here is reachable over the network directly.
 *
 * Snapshots and answers read the same loaded task state the desktop shows,
 * and an answer goes through `deliverFleetInteraction`, the path Fleet rows
 * and a parent's child-request slot use to answer a request from outside its
 * task. That path re-checks the exact workspace, task, turn, request and
 * message at the moment of sending, then calls the store's own respond
 * action, so the transcript records the answer exactly as a desktop click.
 *
 * Work owned by an external controller is left to that controller, as Fleet
 * does: it never appears in a snapshot and an answer to it is `invalid`.
 */

const QUESTION_SETTLE_TIMEOUT_MS = 10_000;

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

interface WorkspaceIdentity {
  repositoryPath: string;
  workspaceName: string;
}

function workspaceIdentities(state: AppState) {
  const identities = new Map<string, WorkspaceIdentity>();
  for (const repository of state.recentRepositories) {
    for (const workspace of repository.workspaces) {
      identities.set(workspace.id, { repositoryPath: repository.repositoryPath, workspaceName: workspace.name });
    }
  }
  if (state.repositoryPath) {
    for (const workspace of state.workspaces) {
      identities.set(workspace.id, { repositoryPath: state.repositoryPath, workspaceName: workspace.name });
    }
  }
  return identities;
}

type PendingPart =
  | { message: ChatMessage; part: ApprovalPart }
  | { message: ChatMessage; part: UserInputPart };

/** A request that still waits on the user: blocking ones only in the running turn. */
function isAnswerable(entry: PendingPart, activeTurnId: string | null) {
  if (entry.part.type === "approval") {
    return entry.part.state === "approval-requested" && activeTurnId !== null && entry.message.turnId === activeTurnId;
  }
  if (entry.part.state !== "input-requested") return false;
  return entry.part.delivery === "async" || (activeTurnId !== null && entry.message.turnId === activeTurnId);
}

function listPendingParts(messages: readonly ChatMessage[] | undefined, activeTurnId: string | null) {
  const result: PendingPart[] = [];
  for (const message of messages ?? []) {
    for (const part of message.parts) {
      if (part.type !== "approval" && part.type !== "user_input") continue;
      const entry = { message, part } as PendingPart;
      if (isAnswerable(entry, activeTurnId)) result.push(entry);
    }
  }
  return result;
}

function toRemoteRequest(args: {
  workspaceId: string;
  taskId: string;
  activeTurnId: string | null;
  entry: PendingPart;
}): RemoteRequest | null {
  const { entry } = args;
  const base = {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    requestId: entry.part.requestId,
    messageId: entry.message.id,
    tool: clip(entry.part.toolName ?? "", 200),
  };
  if (entry.part.type === "approval") {
    const summary = entry.part.input ? `${entry.part.description}\n\n${entry.part.input}` : entry.part.description;
    return { ...base, kind: "approval", turnId: args.activeTurnId, summary: clip(summary, 24_000), questions: [] };
  }
  const questions = entry.part.questions.filter((question) => question.inputType !== "url_notice");
  // More questions than the phone contract carries: answer this one on the desktop.
  if (questions.length > 12 || questions.length === 0) return null;
  return {
    ...base,
    kind: "question",
    turnId: entry.part.delivery === "async" ? null : args.activeTurnId,
    summary: "",
    questions: questions.map((question) => ({
      key: clip(getUserInputAnswerKey(question), 4000),
      question: clip(question.question || question.header, 4000),
      // The desktop card answers with the option's value, or its label when it has none.
      options: question.options.slice(0, 100).map((option) => ({
        label: clip(option.label, 4000),
        value: clip(option.value ?? option.label, 4000),
      })),
      multiSelect: Boolean(question.multiSelect),
      required: isUserInputAnswerRequired(question),
    })),
  };
}

/** Running tasks and the requests that wait on the user, from loaded desktop state. */
export function buildRemoteSnapshot(state: AppState = useAppStore.getState()): RemoteSnapshot {
  const tasks: RemoteTask[] = [];
  const requests: RemoteRequest[] = [];
  for (const [workspaceId, identity] of workspaceIdentities(state)) {
    const session = getWorkspaceSessionForState({ state, workspaceId });
    if (!session) continue;
    for (const task of session.tasks) {
      if (isTaskArchived(task)) continue;
      const activeTurnId = session.activeTurnIdsByTask[task.id] ?? null;
      const pending = isFleetAttentionSuppressedTask(task)
        ? []
        : listPendingParts(session.messagesByTask[task.id], activeTurnId)
            .map((entry) => toRemoteRequest({ workspaceId, taskId: task.id, activeTurnId, entry }))
            .filter((entry): entry is RemoteRequest => entry !== null);
      if (!activeTurnId && pending.length === 0) continue;
      tasks.push({
        workspaceId,
        workspaceName: clip(identity.workspaceName, 200),
        taskId: task.id,
        turnId: activeTurnId,
        title: clip(task.title, 1000),
        updatedAt: clip(task.updatedAt ?? "", 100),
        running: activeTurnId !== null,
      });
      requests.push(...pending);
    }
  }
  tasks.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return RemoteSnapshotSchema.parse({
    tasks: tasks.slice(0, REMOTE_SNAPSHOT_MAX_TASKS),
    requests: requests.slice(0, REMOTE_SNAPSHOT_MAX_REQUESTS),
  });
}

const result = (reason: RemoteResult["reason"]): RemoteResult => ({ ok: reason === "applied", reason });

function findPart(state: AppState, action: RemoteAction) {
  const session = getWorkspaceSessionForState({ state, workspaceId: action.workspaceId });
  const task = session?.tasks.find((candidate) => candidate.id === action.taskId) ?? null;
  const message = session?.messagesByTask[action.taskId]?.find((candidate) => candidate.id === action.messageId) ?? null;
  const part =
    message?.parts.find(
      (candidate): candidate is ApprovalPart | UserInputPart =>
        candidate.type === (action.kind === "approval" ? "approval" : "user_input") &&
        "requestId" in candidate &&
        candidate.requestId === action.requestId,
    ) ?? null;
  return { session, task, message, part };
}

function questionAnswersFit(part: UserInputPart, answers: Record<string, string>) {
  const questions = part.questions.filter((question) => question.inputType !== "url_notice");
  const keys = new Set(questions.map(getUserInputAnswerKey));
  if (Object.keys(answers).some((key) => !keys.has(key))) return false;
  return questions.every(
    (question) => !isUserInputAnswerRequired(question) || Boolean(answers[getUserInputAnswerKey(question)]?.trim()),
  );
}

/** Resolves when the question leaves pending, or null when the delivery did not land in time. */
function waitForQuestion(action: RemoteAction, timeoutMs: number) {
  return new Promise<UserInputPart["state"] | null>((resolve) => {
    let settled = false;
    const finish = (value: UserInputPart["state"] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const check = (state: AppState) => {
      const { part } = findPart(state, action);
      if (part?.type === "user_input" && part.state !== "input-requested") finish(part.state);
    };
    const unsubscribe = useAppStore.subscribe(check);
    const timer = setTimeout(() => finish(null), timeoutMs);
    check(useAppStore.getState());
  });
}

/**
 * Answer one remote action as a desktop click would, after re-checking that
 * the request still waits and that the desktop would let the user answer it.
 */
export async function answerRemoteAction(
  raw: unknown,
  options: { questionTimeoutMs?: number } = {},
): Promise<RemoteResult> {
  const parsed = RemoteActionSchema.safeParse(raw);
  if (!parsed.success) return result("invalid");
  const action = parsed.data;
  const state = useAppStore.getState();
  const identity = workspaceIdentities(state).get(action.workspaceId);
  if (!identity) return result("invalid");
  const { session, task, message, part } = findPart(state, action);
  if (!session || !task || !message || !part) return result("invalid");
  if (isFleetAttentionSuppressedTask(task)) return result("invalid");
  const activeTurnId = session.activeTurnIdsByTask[task.id] ?? null;
  if (!isAnswerable({ message, part } as PendingPart, activeTurnId)) return result("expired");
  const asyncQuestion = part.type === "user_input" && part.delivery === "async";
  if (!asyncQuestion && action.turnId !== activeTurnId) return result("expired");
  if (action.kind === "question" && (part.type !== "user_input" || !questionAnswersFit(part, action.answers))) {
    return result("invalid");
  }

  const { validation, delivery } = deliverFleetInteraction(
    {
      repositoryPath: identity.repositoryPath,
      workspaceId: action.workspaceId,
      taskId: action.taskId,
      turnId: asyncQuestion ? null : activeTurnId,
      kind: action.kind === "approval" ? "approval" : "user-input",
      requestId: action.requestId,
      messageId: action.messageId,
    },
    action.kind === "approval"
      ? { kind: "approval", approved: action.approved }
      : { kind: "user-input", answers: action.answers },
  );
  if (!validation.ok) return result("expired");

  if (action.kind === "approval") {
    if (!delivery) return result("unavailable");
    const outcome = await delivery.catch(() => null);
    if (outcome?.status === "delivered") return result("applied");
    if (outcome?.status === "skipped") return result("expired");
    if (outcome?.status === "failed" && outcome.message === i18n.t("notifications:approvalAnswer.alreadyAnswering")) {
      return result("expired");
    }
    return result("unavailable");
  }
  const settled = await waitForQuestion(action, options.questionTimeoutMs ?? QUESTION_SETTLE_TIMEOUT_MS);
  if (settled === "input-responded") return result("applied");
  return settled ? result("expired") : result("unavailable");
}

/** Listen for main's requests and tell main this window can answer. Returns the teardown. */
export function installRemoteControlResponder(api: RemoteControlApi | undefined) {
  if (!api) return () => undefined;
  const unsubscribe = api.onRequest((raw) => {
    const request = RemoteRendererRequestSchema.safeParse(raw);
    if (!request.success) return;
    const { requestId } = request.data;
    if (request.data.kind === "snapshot") {
      let snapshot: RemoteSnapshot;
      try {
        snapshot = buildRemoteSnapshot();
      } catch {
        // No reply: main answers the phone `unavailable` when its wait ends.
        return;
      }
      void api.respond({ requestId, kind: "snapshot", snapshot }).catch(() => undefined);
      return;
    }
    void answerRemoteAction(request.data.action)
      .catch((): RemoteResult => result("unavailable"))
      .then((answer) => api.respond({ requestId, kind: "act", result: answer }))
      .catch(() => undefined);
  });
  void api.setResponderReady(true).catch(() => undefined);
  return () => {
    unsubscribe();
    void api.setResponderReady(false).catch(() => undefined);
  };
}
