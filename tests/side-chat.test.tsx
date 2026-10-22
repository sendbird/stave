import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { SideChatPanel } from "@/components/session/side-chat/SideChatPanel";
import { shouldAbortTaskOnEscape } from "@/components/layout/app-shell.shortcuts";
import { askSideQuestion } from "../electron/host-service/side-question";
import { buildCommandPaletteItems } from "@/lib/commands";
import {
  appendQuotedAnswer,
  buildSideChatPrompt,
  describeSideChatActivity,
  parseSideChatCommand,
} from "@/lib/side-chat/side-chat";
import type { AskSideQuestionArgs, AskSideQuestionResponse } from "@/lib/side-chat/side-chat-ipc";
import { useAppStore } from "@/store/app.store";
import {
  askAsideFromComposer,
  copySideAnswerToComposer,
  useSideChatStore,
} from "@/store/side-chat-store";
import type { ChatMessage } from "@/types/chat";

const TASK_ID = "task-1";
const WORKSPACE_ID = "ws-1";

function message(id: string, role: "user" | "assistant", content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role,
    model: role === "user" ? "user" : "claude-sonnet-5",
    providerId: role === "user" ? "user" : "claude-code",
    content,
    parts: content ? [{ type: "text", text: content }] : [],
    ...extra,
  };
}

const RUNNING_REPLY = message("a2", "assistant", "", {
  isStreaming: true,
  parts: [
    { type: "tool_use", toolUseId: "t1", toolName: "Bash", input: JSON.stringify({ command: "bun test tests/export.test.ts" }), output: "3 pass", state: "output-available" },
    { type: "tool_use", toolUseId: "t2", toolName: "Edit", input: JSON.stringify({ file_path: "src/export.ts" }), state: "input-available" },
    { type: "text", text: "Now wiring the CSV header." },
  ],
});
const CONVERSATION: ChatMessage[] = [
  message("u1", "user", "Add CSV export to the billing page."),
  message("a1", "assistant", "I will add an export button and a CSV writer."),
  message("u2", "user", "Keep the column order of the table."),
  RUNNING_REPLY,
];

const originalWindow = (globalThis as { window?: unknown }).window;
let calls: AskSideQuestionArgs[] = [];
let respond: (args: AskSideQuestionArgs) => Promise<AskSideQuestionResponse> = async () => ({ ok: true, text: "It is editing src/export.ts." });

beforeEach(() => {
  calls = [];
  respond = async () => ({ ok: true, text: "It is editing src/export.ts." });
  (globalThis as { window?: unknown }).window = {
    api: {
      provider: {
        askSideQuestion: (args: AskSideQuestionArgs) => {
          calls.push(args);
          return respond(args);
        },
      },
    },
  };
  useAppStore.setState({
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId: TASK_ID,
    repositoryPath: "/tmp/project",
    workspacePathById: { [WORKSPACE_ID]: "/tmp/project" },
    tasks: [
      { id: TASK_ID, title: "CSV export", provider: "claude-code", updatedAt: "", unread: false, controlMode: "interactive", controlOwner: "stave" },
      { id: "task-cursor", title: "Cursor task", provider: "cursor", updatedAt: "", unread: false, controlMode: "interactive", controlOwner: "stave" },
    ],
    messagesByTask: { [TASK_ID]: CONVERSATION },
    activeTurnIdsByTask: { [TASK_ID]: "turn-2" },
    providerTurnActivityByTask: {},
    promptDraftByTask: { [TASK_ID]: { text: "Next: add a filename prompt", attachedFilePaths: [], attachments: [] } },
  } as never);
  useSideChatStore.setState({ openTaskId: null, draftByTask: {}, exchangeByTask: {} });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  applyAppLocale("en");
});

describe("the side question command", () => {
  test("is /aside with an optional question, and nothing else", () => {
    expect(parseSideChatCommand("/aside what is it doing?")).toEqual({ question: "what is it doing?" });
    expect(parseSideChatCommand("  /ASIDE  why\nthis")).toEqual({ question: "why\nthis" });
    expect(parseSideChatCommand("/aside")).toEqual({ question: "" });
    expect(parseSideChatCommand("/asides now")).toBeNull();
    expect(parseSideChatCommand("please /aside")).toBeNull();
  });

  test("is listed first in the composer's slash menu for Claude and Codex tasks only", () => {
    for (const provider of ["claude-code", "codex"] as const) {
      const [first] = buildCommandPaletteItems({ provider }).items;
      expect(first).toMatchObject({ command: "/aside", insertText: "/aside ", source: "stave_builtin" });
    }
    expect(buildCommandPaletteItems({ provider: "cursor" }).items.some((item) => item.command === "/aside")).toBe(false);
  });

  test("from the composer opens the panel and asks, and other text goes on to the provider", async () => {
    expect(askAsideFromComposer({ taskId: TASK_ID, text: "Keep going" })).toBe(false);
    expect(askAsideFromComposer({ taskId: TASK_ID, text: "/aside what is it doing?" })).toBe(true);
    expect(useSideChatStore.getState().openTaskId).toBe(TASK_ID);
    await Bun.sleep(0);
    expect(calls.map((call) => call.prompt.endsWith("what is it doing?"))).toEqual([true]);
  });
});

describe("the side question prompt", () => {
  test("carries the bounded conversation, then the live activity, then the question", () => {
    const activity = describeSideChatActivity({ messages: CONVERSATION, running: true });
    const prompt = buildSideChatPrompt({ messages: CONVERSATION, activity, question: "Why the CSV writer?" });
    const order = ["[Side Question Instructions]", "[Task Conversation]", "[Current Activity]", "[Side Question]"]
      .map((header) => prompt.indexOf(header));
    expect(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]!))).toBe(true);
    expect(prompt).toContain("user: Keep the column order of the table.");
    // The reply being written is activity, not conversation.
    expect(prompt.slice(prompt.indexOf("[Task Conversation]"), prompt.indexOf("[Current Activity]"))).not.toContain("wiring the CSV header");
    expect(activity).toContain("- Bash: bun test tests/export.test.ts (done)");
    expect(activity).toContain("- Edit: src/export.ts (running)");
    expect(activity).toContain("Now wiring the CSV header.");
    expect(prompt.trimEnd().endsWith("Why the CSV writer?")).toBe(true);
  });

  test("says when the turn waits on the user or nothing runs", () => {
    expect(describeSideChatActivity({ messages: CONVERSATION, running: true, pendingInteraction: "approval" }))
      .toContain("waits for the user to approve");
    expect(describeSideChatActivity({ messages: CONVERSATION, running: false })).toContain("No turn is running");
  });
});

describe("asking a side question", () => {
  test("answers in the panel and leaves the transcript and the composer draft as they were", async () => {
    const messagesBefore = useAppStore.getState().messagesByTask[TASK_ID];
    const draftBefore = useAppStore.getState().promptDraftByTask[TASK_ID];
    const store = useSideChatStore.getState();
    store.open(TASK_ID);
    store.setDraft(TASK_ID, "What is it doing right now?");
    await store.ask(TASK_ID);
    expect(useSideChatStore.getState().exchangeByTask[TASK_ID]).toMatchObject({
      status: "answered",
      question: "What is it doing right now?",
      answer: "It is editing src/export.ts.",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      providerId: "claude-code",
      cwd: "/tmp/project",
      runtimeOptions: { claudeAccountProfileId: expect.any(String) },
    });
    expect(useAppStore.getState().messagesByTask[TASK_ID]).toBe(messagesBefore);
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]).toBe(draftBefore);
  });

  test("a task on another provider is told so without a request", async () => {
    const store = useSideChatStore.getState();
    store.setDraft("task-cursor", "Why?");
    await store.ask("task-cursor");
    expect(useSideChatStore.getState().exchangeByTask["task-cursor"]).toMatchObject({ status: "failed", reason: "unsupported" });
    expect(calls).toEqual([]);
  });

  test("an answer that arrives after the panel moved on is dropped", async () => {
    let release: (value: AskSideQuestionResponse) => void = () => {};
    respond = () => new Promise((resolve) => { release = resolve; });
    const store = useSideChatStore.getState();
    store.setDraft(TASK_ID, "Slow question");
    const pending = store.ask(TASK_ID);
    store.clearExchange(TASK_ID);
    release({ ok: true, text: "Late answer" });
    await pending;
    expect(useSideChatStore.getState().exchangeByTask[TASK_ID]).toBeUndefined();
  });

  test("a failed answer keeps the provider's detail", async () => {
    respond = async () => ({ ok: false, message: "Claude Side question failed: offline" });
    const store = useSideChatStore.getState();
    store.setDraft(TASK_ID, "Why?");
    await store.ask(TASK_ID);
    expect(useSideChatStore.getState().exchangeByTask[TASK_ID]).toMatchObject({
      status: "failed",
      reason: "error",
      detail: "Claude Side question failed: offline",
    });
  });

  test("Copy to composer quotes the answer below the draft, for the user to send", () => {
    copySideAnswerToComposer(TASK_ID, "It is editing src/export.ts.\n\nNext it runs the tests.");
    expect(useAppStore.getState().promptDraftByTask[TASK_ID]?.text).toBe(
      "Next: add a filename prompt\n\n> It is editing src/export.ts.\n>\n> Next it runs the tests.\n\n",
    );
    expect(appendQuotedAnswer("", "Yes.")).toBe("> Yes.\n\n");
  });
});

describe("the host's side question", () => {
  const ok = async () => ({ ok: true, text: "  Answer  " });
  const runners = { "claude-code": ok, codex: ok };

  test("runs the task provider's read-only path and returns its text", async () => {
    const seen: string[] = [];
    const result = await askSideQuestion(
      { providerId: "codex", model: "gpt-5.5", prompt: "Q", runtimeOptions: { codexAccountProfileId: "system-default" } },
      { "claude-code": ok, codex: async (args) => { seen.push(`${args.providerId}:${args.model}`); return { ok: true, text: "From Codex" }; } },
    );
    expect(result).toEqual({ ok: true, text: "From Codex" });
    expect(seen).toEqual(["codex:gpt-5.5"]);
    expect(await askSideQuestion({ providerId: "claude-code", model: "m", prompt: "Q" }, runners)).toEqual({ ok: true, text: "Answer" });
  });

  test("refuses a malformed request and reports a provider's failure", async () => {
    expect(await askSideQuestion({ providerId: "cursor", model: "m", prompt: "Q" }, runners)).toMatchObject({ ok: false });
    expect(await askSideQuestion({ providerId: "claude-code", model: "m", prompt: "" }, runners)).toMatchObject({ ok: false });
    expect(await askSideQuestion(
      { providerId: "claude-code", model: "m", prompt: "Q" },
      { ...runners, "claude-code": async () => ({ ok: false, detail: "Claude Side question failed: offline" }) },
    )).toEqual({ ok: false, message: "Claude Side question failed: offline" });
  });
});

describe("the side question panel", () => {
  const render = () => renderToStaticMarkup(createElement(SideChatPanel, { taskId: TASK_ID }));
  // Server rendering reads the store's initial state, so the panel's state is seeded there.
  const initial = useSideChatStore.getInitialState();
  const original = { openTaskId: initial.openTaskId, exchangeByTask: initial.exchangeByTask };
  afterEach(() => Object.assign(initial, original));

  test("shows only for its task, says it stays out of the conversation, and offers Copy to composer", () => {
    expect(render()).toBe("");
    Object.assign(initial, { openTaskId: TASK_ID });
    const empty = render();
    expect(empty).toContain("Side question");
    expect(empty).toContain("Nothing here is added to the conversation.");
    expect(empty).toContain("data-task-abort-exempt");
    Object.assign(initial, {
      exchangeByTask: { [TASK_ID]: { id: "x", question: "Why?", providerId: "claude-code", status: "answered", answer: "Because of the export." } },
    });
    const answered = render();
    expect(answered).toContain("Because of the export.");
    expect(answered).toContain("Copy to composer");
    applyAppLocale("ko");
    expect(render()).toContain("컴포저에 복사");
  });

  test("opening it while the task shows Review brings the task's conversation back, where the panel sits", async () => {
    const { useTaskReviewModeStore } = await import("@/store/task-review-mode-store");
    const before = useSideChatStore.getState().openTaskId;
    try {
      useTaskReviewModeStore.getState().openReview("task-review");
      expect(useTaskReviewModeStore.getState().byTask["task-review"]?.mode).toBe("review");
      useSideChatStore.getState().open("task-review");
      expect(useTaskReviewModeStore.getState().byTask["task-review"]?.mode).toBe("conversation");
      expect(useSideChatStore.getState().openTaskId).toBe("task-review");
    } finally {
      useSideChatStore.setState({ openTaskId: before });
    }
  });

  test("Escape inside the panel never stops the task's turn", () => {
    const inside = { closest: (selector: string) => (selector === "[data-task-abort-exempt]" || selector === "[data-task-abort-scope]" ? {} : null) };
    const pane = { closest: (selector: string) => (selector === "[data-task-abort-scope]" ? {} : null) };
    expect(shouldAbortTaskOnEscape({ key: "Escape", target: inside as never, activeElement: inside as never })).toBe(false);
    expect(shouldAbortTaskOnEscape({ key: "Escape", target: pane as never, activeElement: pane as never })).toBe(true);
  });
});
