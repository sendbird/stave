import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale, i18n } from "@/i18n";
import {
  advanceTaskAnnouncement,
  resolveTaskAnnouncementState,
  selectTaskAnnouncementState,
  TASK_ANNOUNCEMENT_KEYS,
  type TaskAnnouncementBaseline,
  type TaskAnnouncementState,
} from "@/lib/task-status-announcement";
import type { ChatMessage } from "@/types/chat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskStatusAnnouncerRegion } from "@/components/layout/TaskStatusAnnouncer";

afterEach(() => applyAppLocale("en"));

const user = (): ChatMessage =>
  ({ id: "u", role: "user", content: "Go", parts: [], providerId: "claude-code", model: "m" }) as ChatMessage;

function assistant(extra: Partial<ChatMessage> = {}, parts: unknown[] = []): ChatMessage {
  return {
    id: "a",
    role: "assistant",
    content: "",
    parts,
    providerId: "claude-code",
    model: "m",
    ...extra,
  } as ChatMessage;
}

function receipt(outcome: "completed" | "failed" | "cancelled") {
  return {
    version: 1,
    completedAt: "2026-10-27T00:00:00.000Z",
    outcome,
    outputObserved: true,
    error: null,
    lastError: null,
    stopReason: null,
    doneObserved: true,
    nativeTurnId: null,
    responseText: null,
  } as const;
}

describe("task announcement state", () => {
  test("maps the task's state to the spoken words", () => {
    expect(resolveTaskAnnouncementState({ messages: [] })).toBe("idle");
    expect(resolveTaskAnnouncementState({ messages: [user()], activeTurnId: "t1" })).toBe("working");
    expect(
      resolveTaskAnnouncementState({
        messages: [user(), assistant({}, [{ type: "approval", toolName: "Bash", description: "", requestId: "r", state: "approval-requested" }])],
        activeTurnId: "t1",
      }),
    ).toBe("needsApproval");
    expect(
      resolveTaskAnnouncementState({
        messages: [user(), assistant({}, [{ type: "user_input", toolName: "Ask", requestId: "q", state: "input-requested", questions: [] }])],
        activeTurnId: "t1",
      }),
    ).toBe("needsInput");
    expect(resolveTaskAnnouncementState({ messages: [user(), assistant({ terminalReceipt: receipt("completed") })] })).toBe("done");
    expect(resolveTaskAnnouncementState({ messages: [user(), assistant({ terminalReceipt: receipt("cancelled") })] })).toBe("stopped");
    expect(resolveTaskAnnouncementState({ messages: [user(), assistant({ terminalReceipt: receipt("failed") })] })).toBe("failed");
    expect(resolveTaskAnnouncementState({ messages: [user(), assistant({ terminalStopReason: "end_turn" })] })).toBe("done");
    // A turn that has not reported its end says nothing.
    expect(resolveTaskAnnouncementState({ messages: [user(), assistant()] })).toBe("idle");
  });

  test("an error the running turn may recover from is not a failure until the turn ends on it", () => {
    // A recoverable provider error lands as an error line while the turn keeps running.
    const erroring = [user(), assistant({}, [{ type: "system_event", content: "[error] Reconnecting… 1/5" }])];
    expect(resolveTaskAnnouncementState({ messages: erroring, activeTurnId: "t1" })).toBe("working");
    // The same turn ending on the error has failed.
    expect(resolveTaskAnnouncementState({ messages: erroring })).toBe("failed");

    // Spoken: Working, then (the retry says nothing), then Failed only at the end.
    let baseline: TaskAnnouncementBaseline | null = { taskId: "t", state: "working" };
    const spoken: TaskAnnouncementState[] = [];
    for (const activeTurnId of ["t1", "t1", null]) {
      const result = advanceTaskAnnouncement(baseline, {
        taskId: "t",
        state: resolveTaskAnnouncementState({ messages: erroring, activeTurnId }),
      });
      baseline = result.baseline;
      if (result.announce) spoken.push(result.announce);
    }
    expect(spoken).toEqual(["failed"]);

    // A turn that recovers and completes is Done, never Failed.
    const recovered = [user(), assistant({ terminalReceipt: receipt("completed") }, [
      { type: "system_event", content: "[error] Reconnecting… 1/5" },
      { type: "text", text: "All set." },
    ])];
    expect(resolveTaskAnnouncementState({ messages: recovered })).toBe("done");
  });

  test("a loading transcript has no state yet, and reads are cached per message list", () => {
    const messages = [user()];
    expect(selectTaskAnnouncementState({ messages, activeTurnId: "t1", archived: false, loading: true })).toBeNull();
    expect(selectTaskAnnouncementState({ messages, activeTurnId: "t1", archived: false, loading: false })).toBe("working");
    expect(selectTaskAnnouncementState({ messages, activeTurnId: null, archived: false, loading: false })).toBe("idle");
  });
});

describe("announcement transitions", () => {
  function run(steps: Array<[string, TaskAnnouncementState | null]>) {
    let baseline: TaskAnnouncementBaseline | null = null;
    const spoken: TaskAnnouncementState[] = [];
    for (const [taskId, state] of steps) {
      const result = advanceTaskAnnouncement(baseline, { taskId, state });
      baseline = result.baseline;
      if (result.announce) spoken.push(result.announce);
    }
    return spoken;
  }

  test("each change of the open task is spoken once", () => {
    expect(
      run([
        ["t1", "idle"],
        ["t1", "working"],
        ["t1", "working"],
        ["t1", "needsApproval"],
        ["t1", "working"],
        ["t1", "done"],
        ["t1", "done"],
      ]),
    ).toEqual(["working", "needsApproval", "working", "done"]);
    expect(run([["t1", "working"], ["t1", "needsInput"], ["t1", "stopped"]])).toEqual(["needsInput", "stopped"]);
    expect(run([["t1", "working"], ["t1", "failed"]])).toEqual(["failed"]);
  });

  test("opening or switching to a task is silent: its first state is the baseline", () => {
    expect(run([["t1", "working"]])).toEqual([]);
    expect(
      run([
        ["t1", "working"],
        ["t2", "needsApproval"],
        ["t2", "working"],
      ]),
    ).toEqual(["working"]);
    // Switching back takes a new baseline too.
    expect(run([["t1", "working"], ["t2", "done"], ["t1", "done"]])).toEqual([]);
  });

  test("a transcript that finishes loading is not news", () => {
    expect(run([["t1", "idle"], ["t1", null], ["t1", "done"]])).toEqual([]);
    expect(run([["t1", null], ["t1", "needsApproval"]])).toEqual([]);
    // A turn's end is spoken only after the task was seen in a turn.
    expect(run([["t1", "idle"], ["t1", "done"]])).toEqual([]);
    expect(run([["t1", "done"], ["t1", "failed"]])).toEqual([]);
  });

  test("going quiet is never spoken", () => {
    expect(run([["t1", "working"], ["t1", "idle"]])).toEqual([]);
  });

  test("every spoken state has English and Korean words", () => {
    for (const key of Object.values(TASK_ANNOUNCEMENT_KEYS)) {
      expect(i18n.t(key)).not.toBe(key);
    }
    expect(i18n.t(TASK_ANNOUNCEMENT_KEYS.needsApproval)).toBe("Needs approval");
    applyAppLocale("ko");
    expect(i18n.t(TASK_ANNOUNCEMENT_KEYS.needsApproval)).toBe("승인 필요");
  });
});

describe("announcement region", () => {
  test("keeps the announced state and words it in the current language", () => {
    const region = () =>
      renderToStaticMarkup(createElement(TaskStatusAnnouncerRegion, { announcement: "needsApproval" }));
    expect(region()).toContain('aria-live="polite"');
    expect(region()).toContain("Needs approval");
    // The same announcement after a language switch reads in the new language.
    applyAppLocale("ko");
    expect(region()).toContain("승인 필요");
    expect(region()).not.toContain("Needs approval");
    expect(
      renderToStaticMarkup(createElement(TaskStatusAnnouncerRegion, { announcement: null })),
    ).toMatch(/<span[^>]*role="status"[^>]*><\/span>/);
  });
});
