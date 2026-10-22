import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { buildProviderTurnPrompt } from "@/lib/providers/provider-request-translators";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import {
  applyHandoffDraft,
  emptyHandoffRecord,
  handoffRecordToDraft,
  type HandoffDraft,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import { parseWorkspaceShell } from "@/lib/task-context/schemas";
import { collectTurnStartRetrievedContextParts } from "@/store/repository-memory-runtime";
import { createEmptyWorkspaceState, type WorkspaceSessionState } from "@/store/workspace-session-state";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import type { ChatMessage } from "@/types/chat";

const WORKSPACE_ID = "handoff-delivery-ws";
const TASK_ID = "handoff-delivery-task";
const MARKER = "[Task Handoff Record]";
const AT = "2026-10-22T10:00:00.000Z";

let stored: TaskHandoffRecord = emptyHandoffRecord();
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

beforeEach(() => {
  stored = emptyHandoffRecord();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { api: { persistence: { readTaskHandoff: async () => ({ ok: true, record: stored }) } } },
  });
});
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

/** What the user's Save does to the stored record. */
function save(changes: Partial<HandoffDraft>) {
  stored = applyHandoffDraft({ record: stored, draft: { ...handoffRecordToDraft(stored), ...changes }, at: AT });
}

function emptySession(): WorkspaceSessionState {
  return { ...createEmptyWorkspaceState(), activeTurnIdsByTask: {}, nativeSessionReadyByTask: {} };
}

function occurrences(text: string, needle: string) {
  return text.split(needle).length - 1;
}

/**
 * One turn the way the window runs it: the turn-start context and request for
 * the task's session of this provider, the prompt the provider's translator
 * builds, then the provider's events replayed into the task.
 */
async function runTurn(args: {
  session: WorkspaceSessionState;
  providerId: ProviderId;
  turnId: string;
  text: string;
  events?: NormalizedProviderEvent[];
}) {
  const history = args.session.messagesByTask[TASK_ID] ?? [];
  const cursor = getProviderSessionCursor({ sessions: args.session.providerSessionByTask[TASK_ID], providerId: args.providerId });
  const retrievedContextParts = await collectTurnStartRetrievedContextParts({
    workspaceId: WORKSPACE_ID,
    turnId: args.turnId,
    providerSession: cursor,
    repositoryPath: null,
    parentTaskId: TASK_ID,
    history,
    prompt: args.text,
  } as Parameters<typeof collectTurnStartRetrievedContextParts>[0]);
  const prompt = buildProviderTurnPrompt({
    providerId: args.providerId,
    prompt: args.text,
    conversation: buildCanonicalConversationRequest({
      turnId: args.turnId,
      taskId: TASK_ID,
      workspaceId: WORKSPACE_ID,
      providerId: args.providerId,
      model: "test-model",
      history,
      userInput: args.text,
      nativeSessionId: cursor?.nativeSessionId ?? null,
      syncedThroughMessageId: cursor?.syncedThroughMessageId ?? null,
      retrievedContextParts,
    }),
  });
  const input: ChatMessage = {
    id: `${TASK_ID}-m-${history.length + 1}`,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.text,
    parts: [{ type: "text", text: args.text }],
  };
  const applied = applyProviderEventsToWorkspaceSession({
    session: {
      ...args.session,
      messagesByTask: { ...args.session.messagesByTask, [TASK_ID]: [...history, input] },
      messageCountByTask: { ...args.session.messageCountByTask, [TASK_ID]: history.length + 1 },
      activeTurnIdsByTask: { ...args.session.activeTurnIdsByTask, [TASK_ID]: args.turnId },
    },
    taskId: TASK_ID,
    events: args.events ?? [
      { type: "provider_session", providerId: args.providerId, nativeSessionId: `native-${args.providerId}` },
      { type: "text", text: "Done." },
      { type: "done" },
    ],
    provider: args.providerId,
    model: "test-model",
    turnId: args.turnId,
  });
  return { prompt, session: applied.session };
}

describe("a changed handoff record reaches a provider session that is up to date", () => {
  test("Claude, Codex and ACP: a saved revision goes to the same provider's next turn once, without the excerpt", async () => {
    for (const providerId of ["claude-code", "codex", "cursor"] as const) {
      stored = emptyHandoffRecord();
      save({ goal: "Ship the export" });
      const turn = (n: number) => `handoff-delivery-${providerId}-${n}`;

      const first = await runTurn({ session: emptySession(), providerId, turnId: turn(1), text: "Start" });
      expect(occurrences(first.prompt, MARKER)).toBe(1);

      const second = await runTurn({ session: first.session, providerId, turnId: turn(2), text: "Continue" });
      expect(second.prompt).not.toContain(MARKER);

      save({ decisions: "- Keep the public API stable" });
      const third = await runTurn({ session: second.session, providerId, turnId: turn(3), text: "Next step" });
      expect(occurrences(third.prompt, MARKER)).toBe(1);
      expect(third.prompt).toContain("- Keep the public API stable");
      expect(third.prompt).toContain("Ship the export");
      // The session already has the conversation: only the record goes again.
      expect(third.prompt).not.toContain("[Task Shared Context]");

      const fourth = await runTurn({ session: third.session, providerId, turnId: turn(4), text: "And then" });
      expect(fourth.prompt).not.toContain(MARKER);
    }
  });

  test("a turn that fails has not delivered the record, so the next turn sends it", async () => {
    save({ goal: "Ship the export" });
    const first = await runTurn({ session: emptySession(), providerId: "claude-code", turnId: "handoff-delivery-fail-1", text: "Start" });
    save({ cautions: "- The staging database is shared" });
    const failed = await runTurn({
      session: first.session,
      providerId: "claude-code",
      turnId: "handoff-delivery-fail-2",
      text: "Next step",
      events: [{ type: "error", message: "Overloaded", recoverable: false }, { type: "done" }],
    });
    expect(occurrences(failed.prompt, MARKER)).toBe(1);
    const retried = await runTurn({ session: failed.session, providerId: "claude-code", turnId: "handoff-delivery-fail-3", text: "Try again" });
    expect(occurrences(retried.prompt, MARKER)).toBe(1);
    expect(retried.prompt).toContain("- The staging database is shared");
  });

  test("a record the user emptied tells the session the earlier one no longer applies", async () => {
    save({ decisions: "- Keep the public API stable" });
    const first = await runTurn({ session: emptySession(), providerId: "codex", turnId: "handoff-delivery-clear-1", text: "Start" });
    save({ decisions: "" });
    const cleared = await runTurn({ session: first.session, providerId: "codex", turnId: "handoff-delivery-clear-2", text: "Next step" });
    expect(occurrences(cleared.prompt, MARKER)).toBe(1);
    expect(cleared.prompt).not.toContain("- Keep the public API stable");
    expect(cleared.prompt).toContain("no longer applies");
    const after = await runTurn({ session: cleared.session, providerId: "codex", turnId: "handoff-delivery-clear-3", text: "And then" });
    expect(after.prompt).not.toContain(MARKER);
  });

  test("the revision a session received is kept with its cursor across a restart", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        activeTaskId: "",
        tasks: [],
        promptDraftByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        terminalDocked: false,
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeSurface: { kind: "task", taskId: "" },
        workspaceInformation: {
          jiraIssues: [], confluencePages: [], figmaResources: [], storybookResources: [],
          linkedPullRequests: [], slackThreads: [], notes: "", todos: [], customFields: [],
        },
        messageCountByTask: {},
        providerSessionByTask: {
          [TASK_ID]: {
            codex: { nativeSessionId: "thread-1", syncedThroughMessageId: "m-4", handoffRevision: 3 },
            "claude-code": { nativeSessionId: "session-1", handoffRevision: -1 },
          },
        },
      },
    });
    expect(parsed?.providerSessionByTask[TASK_ID]?.codex).toEqual({
      nativeSessionId: "thread-1",
      syncedThroughMessageId: "m-4",
      handoffRevision: 3,
    });
    // A malformed revision is dropped, not a reason to reject the workspace.
    expect(parsed?.providerSessionByTask[TASK_ID]?.["claude-code"]).toEqual({ nativeSessionId: "session-1" });
    expect(getProviderSessionCursor({ sessions: parsed?.providerSessionByTask[TASK_ID], providerId: "codex" })).toEqual({
      nativeSessionId: "thread-1",
      syncedThroughMessageId: "m-4",
      handoffRevision: 3,
    });
  });
});
