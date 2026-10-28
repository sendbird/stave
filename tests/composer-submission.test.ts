import { afterEach, describe, expect, test } from "bun:test";
import {
  sendComposerSubmission,
  trackSubmittedDraft,
  type ComposerDraftText,
} from "../src/components/session/composer-submission";
import type { SendUserMessageResult } from "../src/store/app-store.types";
import { useAppStore } from "../src/store/app.store";

type SendArgs = Parameters<ReturnType<typeof useAppStore.getState>["sendUserMessage"]>[0];

const originalWindow = globalThis.window;
afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  Object.assign(globalThis, { window: originalWindow });
});

/** An editor holding `text` on `taskId`, and a draft submitted from it. */
function editorWith(text: string, taskId = "task-1") {
  const editor: { current: ComposerDraftText } = { current: { taskId, text } };
  const draft = trackSubmittedDraft({
    submitted: { taskId, text },
    readCurrent: () => editor.current,
    replace: (next) => {
      editor.current = next;
    },
  });
  return { editor, draft };
}

describe("trackSubmittedDraft", () => {
  test("clears only while the editor still shows the submitted text on its task", () => {
    const unchanged = editorWith("run the tests");
    expect(unchanged.draft.isCurrent()).toBe(true);
    unchanged.draft.clear();
    expect(unchanged.editor.current).toEqual({ taskId: "task-1", text: "" });

    const edited = editorWith("run the tests");
    edited.editor.current = { taskId: "task-1", text: "run the tests, then lint" };
    expect(edited.draft.isCurrent()).toBe(false);
    edited.draft.clear();
    expect(edited.editor.current.text).toBe("run the tests, then lint");

    const switched = editorWith("run the tests");
    switched.editor.current = { taskId: "task-2", text: "run the tests" };
    expect(switched.draft.isCurrent()).toBe(false);
    switched.draft.clear();
    expect(switched.editor.current).toEqual({ taskId: "task-2", text: "run the tests" });
  });

  test("restores only into an empty editor on the submitted task", () => {
    const emptied = editorWith("run the tests");
    emptied.editor.current = { taskId: "task-1", text: "" };
    emptied.draft.restore();
    expect(emptied.editor.current).toEqual({ taskId: "task-1", text: "run the tests" });

    const retyped = editorWith("run the tests");
    retyped.editor.current = { taskId: "task-1", text: "something new" };
    retyped.draft.restore();
    expect(retyped.editor.current.text).toBe("something new");

    const switched = editorWith("run the tests");
    switched.editor.current = { taskId: "task-2", text: "" };
    switched.draft.restore();
    expect(switched.editor.current).toEqual({ taskId: "task-2", text: "" });
  });
});

describe("sendComposerSubmission", () => {
  function setup(send: (sendArgs: SendArgs) => SendUserMessageResult) {
    const log: string[] = [];
    const sends: SendArgs[] = [];
    Object.assign(globalThis, { window: {} });
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      sendUserMessage: async (sendArgs) => {
        log.push(`send:${sendArgs.submitIntent ?? "none"}`);
        sends.push(sendArgs);
        return send(sendArgs);
      },
    });
    const { editor, draft } = editorWith("run the tests");
    const submit = (args: {
      intent?: "steer" | "queue";
      approvalRedirectMode?: "steer" | "queue" | null;
    }) =>
      sendComposerSubmission({
        taskId: "task-1",
        text: "run the tests",
        intent: args.intent,
        imageContexts: [],
        approvalRedirectMode: args.approvalRedirectMode ?? null,
        draft,
        clearLensAnnotations: () => log.push("clear-lens"),
      });
    return { log, sends, editor, submit };
  }

  const steered: SendUserMessageResult = {
    status: "steered",
    taskId: "task-1",
    workspaceId: "ws-1",
    turnId: "turn-1",
  };

  test("a plain send clears Lens annotations first and an accepted steer clears the draft", async () => {
    const { log, sends, editor, submit } = setup(() => steered);
    await submit({ intent: "steer" });
    expect(log).toEqual(["clear-lens", "send:steer"]);
    expect(sends[0]).toMatchObject({
      taskId: "task-1",
      content: "run the tests",
      imageContexts: undefined,
      turnOrigin: "conversation",
    });
    expect(sends[0]?.declinePendingApprovals).toBeUndefined();
    expect(editor.current.text).toBe("");
  });

  test("a refused send or steer restores the emptied draft", async () => {
    for (const result of [
      { status: "blocked" },
      { status: "steer-unavailable", message: "The turn cannot take a steer." },
    ] as SendUserMessageResult[]) {
      const { editor, submit } = setup(() => result);
      editor.current = { taskId: "task-1", text: "" };
      await submit({ intent: "steer" });
      expect(editor.current.text).toBe("run the tests");
    }
  });

  test("a queued send leaves the draft alone", async () => {
    const { editor, submit } = setup(() => ({
      status: "queued",
      taskId: "task-1",
      workspaceId: "ws-1",
    }));
    editor.current = { taskId: "task-1", text: "" };
    await submit({ intent: "queue" });
    expect(editor.current.text).toBe("");
  });

  test("a redirect keeps Lens annotations and the draft until the message is delivered", async () => {
    const { log, sends, editor, submit } = setup(() => {
      expect(editor.current.text).toBe("run the tests");
      return steered;
    });
    await submit({ approvalRedirectMode: "steer" });
    expect(log).toEqual(["send:steer", "clear-lens"]);
    expect(sends[0]?.declinePendingApprovals).toBeFunction();
    expect(editor.current.text).toBe("");
  });
});
