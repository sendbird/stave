import { describe, expect, test } from "bun:test";
import {
  ATTACHED_TASK_CONTEXT_SOURCE_ID,
  MAX_ATTACHED_TASKS,
  PARTIAL_TASK_REPLY_NOTE,
  TASK_DRAG_MIME,
  addTaskContextAttachment,
  buildAttachedTaskRetrievedContext,
  buildAttachedTaskSection,
  buildTaskMentionOptions,
  createTaskContextAttachment,
  decodeTaskDragPayload,
  encodeTaskDragPayload,
  filterTaskMentionOptions,
  hasPartialAttachedTaskReply,
  selectTaskContextEntries,
} from "../src/lib/task-context/attached-task-context";
import {
  buildMentionPaletteItems,
  readDroppedTask,
} from "../src/components/ai-elements/prompt-input-mentions";
import { buildPromptDraftDisplayPartsForSend } from "../src/store/prompt-draft-message-content";
import { describeQueuedTurnAttachments } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { toCanonicalConversationMessage } from "../src/lib/providers/canonical-request";
import { parseWorkspaceSnapshot } from "../src/lib/task-context/schemas";
import type { WorkspaceInformationReferenceOption } from "../src/lib/workspace-information-references";
import type { Attachment, ChatMessage, Task } from "../src/types/chat";

const task = (id: string, title: string, updatedAt: string, patch: Partial<Task> = {}): Task =>
  ({
    id,
    title,
    provider: "claude-code",
    updatedAt,
    unread: false,
    archivedAt: null,
    ...patch,
  }) as Task;

const message = (role: "user" | "assistant", content: string, id = `${role}-${content}`): ChatMessage =>
  ({ id, role, model: "m", content, parts: [{ type: "text", text: content }] }) as ChatMessage;

describe("task mention options", () => {
  const tasks = [
    task("current", "Current work", "2026-10-03T10:00:00.000Z"),
    task("old", "Research login flow", "2026-10-01T10:00:00.000Z"),
    task("new", "Fix login redirect", "2026-10-03T09:00:00.000Z"),
    task("archived", "Login archive", "2026-10-03T08:00:00.000Z", { archivedAt: "2026-10-03T08:30:00.000Z" }),
    task("child", "Login subagent", "2026-10-03T08:00:00.000Z", { parentTaskId: "new" }),
  ];

  test("lists other live tasks of the workspace, most recent first", () => {
    const options = buildTaskMentionOptions({ tasks, workspaceId: "ws-1", currentTaskId: "current" });
    expect(options.map((option) => option.taskId)).toEqual(["new", "old"]);
    expect(options[0]).toMatchObject({ workspaceId: "ws-1", title: "Fix login redirect" });
    expect(
      buildTaskMentionOptions({
        tasks,
        workspaceId: "ws-1",
        currentTaskId: "current",
        attachedTaskIds: new Set(["new"]),
      }).map((option) => option.taskId),
    ).toEqual(["old"]);
  });

  test("matches every word of the query in the title", () => {
    const options = buildTaskMentionOptions({ tasks, workspaceId: "ws-1", currentTaskId: "current" });
    expect(filterTaskMentionOptions({ options, query: "login" }).map((o) => o.taskId)).toEqual(["new", "old"]);
    expect(filterTaskMentionOptions({ options, query: "login research" }).map((o) => o.taskId)).toEqual(["old"]);
    expect(filterTaskMentionOptions({ options, query: "", limit: 1 }).map((o) => o.taskId)).toEqual(["new"]);
  });

  test("the @ palette walks sections, then tasks, then items", () => {
    const info = (token: string, kind: "section" | "item"): WorkspaceInformationReferenceOption => ({
      reference: { section: "notes", scope: kind, label: token, token },
      title: token,
      description: "",
      group: "Notes",
      kind,
      searchText: token.toLowerCase(),
    }) as WorkspaceInformationReferenceOption;
    const items = buildMentionPaletteItems({
      query: "",
      informationOptions: [info("@info:notes", "section"), info("@info:todo/1", "item")],
      taskOptions: buildTaskMentionOptions({ tasks, workspaceId: "ws-1", currentTaskId: "current" }),
    });
    expect(items.map((item) => item.key)).toEqual([
      "@info:notes",
      "@task:new",
      "@task:old",
      "@info:todo/1",
    ]);
  });
});

describe("attaching", () => {
  const attachment = createTaskContextAttachment({ taskId: "t1", workspaceId: "ws-1", title: "  " });

  test("defaults to the latest reply and names an untitled task", () => {
    expect(attachment).toEqual({
      kind: "task-context",
      id: "task-context-t1",
      taskId: "t1",
      workspaceId: "ws-1",
      title: "Untitled task",
      scope: "latest-reply",
    });
  });

  test("attaches a task once, never the current task, and up to the limit", () => {
    const once = addTaskContextAttachment({ attachments: [], attachment });
    expect(once).toHaveLength(1);
    expect(addTaskContextAttachment({ attachments: once, attachment })).toBe(once);
    const none: Attachment[] = [];
    expect(addTaskContextAttachment({ attachments: none, attachment, currentTaskId: "t1" })).toBe(none);
    const full = Array.from({ length: MAX_ATTACHED_TASKS }, (_, index) =>
      createTaskContextAttachment({ taskId: `full-${index}`, workspaceId: "ws-1", title: "x" }),
    );
    expect(addTaskContextAttachment({ attachments: full, attachment })).toBe(full);
  });

  test("a drag carries the task and nothing else is accepted", () => {
    const payload = encodeTaskDragPayload({ taskId: "t1", workspaceId: "ws-2", title: "Research" });
    expect(decodeTaskDragPayload(payload)).toEqual({ taskId: "t1", workspaceId: "ws-2", title: "Research" });
    expect(decodeTaskDragPayload("{nope")).toBeNull();
    expect(decodeTaskDragPayload(JSON.stringify({ taskId: "t1" }))).toBeNull();
    expect(
      readDroppedTask({ types: [TASK_DRAG_MIME], getData: () => payload }),
    ).toEqual({ taskId: "t1", workspaceId: "ws-2", title: "Research" });
    expect(readDroppedTask({ types: ["text/plain"], getData: () => payload })).toBeNull();
  });
});

describe("context sent with the prompt", () => {
  const conversation = [
    message("user", "Research the login flow"),
    message("assistant", "The redirect drops the state parameter."),
    message("user", "Where exactly?"),
    message("assistant", "In callback.ts, line 40."),
  ];

  test("the latest reply is the default", () => {
    const section = buildAttachedTaskSection({
      attachment: { taskId: "t1", title: "Research", scope: "latest-reply" },
      messages: conversation,
    });
    expect(section).toBe("task: Research\nstave task id: t1\nlatest reply:\nIn callback.ts, line 40.");
  });

  test("recent conversation keeps the asks and answers in order", () => {
    const section = buildAttachedTaskSection({
      attachment: { taskId: "t1", title: "Research", scope: "conversation" },
      messages: conversation,
    });
    expect(section).toContain("recent conversation, oldest first:");
    expect(section!.indexOf("Research the login flow")).toBeLessThan(section!.indexOf("In callback.ts"));
    expect(section).toContain("[user]\nWhere exactly?");
  });

  test("a streaming reply is labelled partial, and completion removes the label", () => {
    const attachment = { taskId: "t1", title: "Research", scope: "latest-reply" as const };
    const streaming = { ...message("assistant", "The redirect might be the cause."), isStreaming: true };
    const messages = [...conversation, streaming];
    expect(selectTaskContextEntries({ scope: "latest-reply", messages })[0]?.isStreaming).toBe(true);
    expect(hasPartialAttachedTaskReply({ attachment, messages })).toBe(true);
    expect(buildAttachedTaskSection({ attachment, messages })).toContain(PARTIAL_TASK_REPLY_NOTE);
    const completed = [...conversation, { ...streaming, content: "Confirmed the redirect cause.", isStreaming: false }];
    expect(hasPartialAttachedTaskReply({ attachment, messages: completed })).toBe(false);
    expect(buildAttachedTaskSection({ attachment, messages: completed })).not.toContain(PARTIAL_TASK_REPLY_NOTE);
  });

  test("conversation marks only streaming assistant entries; an empty stream does not replace a reply", () => {
    const streaming = { ...message("assistant", "Work in progress"), isStreaming: true };
    const messages = [streaming, message("user", "Continue"), message("assistant", "Final reply")];
    const attachment = { taskId: "t1", title: "Research", scope: "conversation" as const };
    expect(buildAttachedTaskSection({ attachment, messages })).toContain(`[assistant]\n${PARTIAL_TASK_REPLY_NOTE}\nWork in progress`);
    expect(hasPartialAttachedTaskReply({ attachment, messages })).toBe(true);
    expect(hasPartialAttachedTaskReply({ attachment: { ...attachment, scope: "latest-reply" }, messages })).toBe(false);
    const empty = { ...streaming, content: "", parts: [] };
    expect(selectTaskContextEntries({ scope: "latest-reply", messages: [...conversation, empty] })[0]?.isStreaming).toBe(false);
  });

  test("selected findings retain their streaming status without including unselected findings", () => {
    const content = "```stave-review-findings\n" + JSON.stringify({ verdict: "request-changes", findings: [
      { id: "F1", severity: "major", title: "Selected problem" },
      { id: "F2", severity: "minor", title: "Excluded problem" },
    ] }) + "\n```";
    const messages = [{ ...message("assistant", content, "review-reply"), isStreaming: true }];
    const attachment = { taskId: "t1", title: "Review", scope: "latest-reply" as const, findingIds: ["F1"], findingsReplyId: "review-reply" };
    const section = buildAttachedTaskSection({ attachment, messages });
    expect(section).toContain(PARTIAL_TASK_REPLY_NOTE);
    expect(section).toContain("Selected problem");
    expect(section).not.toContain("Excluded problem");
    expect(hasPartialAttachedTaskReply({ attachment, messages })).toBe(true);
    messages[0]!.isStreaming = false;
    expect(hasPartialAttachedTaskReply({ attachment, messages })).toBe(false);
    expect(buildAttachedTaskSection({ attachment, messages })).not.toContain(PARTIAL_TASK_REPLY_NOTE);
  });

  test("a long reply keeps its opening and its end", () => {
    const long = `START ${"x".repeat(20_000)} END`;
    const section = buildAttachedTaskSection({
      attachment: { taskId: "t1", title: "Long", scope: "latest-reply" },
      messages: [message("assistant", long)],
    })!;
    expect(section.length).toBeLessThan(6_200);
    expect(section).toContain("START");
    expect(section).toContain("END");
    expect(section).toContain("[clipped]");
  });

  test("a task with no reply yet is reported, not invented", () => {
    expect(
      buildAttachedTaskSection({
        attachment: { taskId: "t1", title: "Empty", scope: "latest-reply" },
        messages: [message("user", "only a question")],
      }),
    ).toBeNull();
    const context = buildAttachedTaskRetrievedContext({ sections: [], missing: ["Empty"] });
    expect(context?.sourceId).toBe(ATTACHED_TASK_CONTEXT_SOURCE_ID);
    expect(context?.content).toContain("- Empty");
    expect(buildAttachedTaskRetrievedContext({ sections: [], missing: [] })).toBeNull();
  });

  test("the sent message shows the task, and history does not carry the chip", () => {
    const draft = {
      text: "Use this research",
      attachedFilePaths: [],
      attachments: [createTaskContextAttachment({ taskId: "t1", workspaceId: "ws-1", title: "Research" })],
    };
    const parts = buildPromptDraftDisplayPartsForSend(draft);
    expect(parts).toEqual([
      { type: "text", text: "Use this research" },
      { type: "task_context", taskId: "t1", workspaceId: "ws-1", title: "Research", scope: "latest-reply" },
    ]);
    const canonical = toCanonicalConversationMessage({
      message: { ...message("user", "Use this research"), parts: parts! },
    });
    expect(canonical.parts.map((part) => part.type)).toEqual(["text"]);
    expect(
      describeQueuedTurnAttachments({ attachedFilePaths: [], attachments: draft.attachments }),
    ).toBe("1 task");
  });

  test("a task attached to a staged batch item still shows on the sent message", () => {
    const attachment = createTaskContextAttachment({ taskId: "t2", workspaceId: "ws-1", title: "Plan" });
    const parts = buildPromptDraftDisplayPartsForSend({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      promptBatch: [
        { id: "b1", createdAt: "2026-10-03T10:00:00.000Z", content: "Follow the plan", attachments: [attachment] },
      ],
    });
    expect(parts).toContainEqual({
      type: "task_context",
      taskId: "t2",
      workspaceId: "ws-1",
      title: "Plan",
      scope: "latest-reply",
    });
  });

  test("an attached task survives a workspace save and load", () => {
    const attachment = createTaskContextAttachment({ taskId: "t1", workspaceId: "ws-1", title: "Research", scope: "conversation" });
    const snapshot = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "current",
        tasks: [],
        messagesByTask: {},
        promptDraftByTask: {
          current: {
            text: "",
            attachedFilePaths: [],
            attachments: [attachment],
            queuedTurns: [
              {
                id: "q1",
                queuedAt: "2026-10-03T10:00:00.000Z",
                content: "later",
                attachedFilePaths: [],
                attachments: [attachment],
              },
            ],
          },
        },
      },
    });
    expect(snapshot?.promptDraftByTask.current?.attachments).toEqual([attachment]);
    expect(snapshot?.promptDraftByTask.current?.queuedTurns?.[0]?.attachments).toEqual([attachment]);
  });

  test("a review chip's chosen findings survive a save and load, and bad ones are dropped", () => {
    const attachment = {
      ...createTaskContextAttachment({ taskId: "r1", workspaceId: "ws-1", title: "Review" }),
      findingIds: ["F1", "F3"],
    };
    const snapshot = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "current",
        tasks: [],
        messagesByTask: {},
        promptDraftByTask: {
          current: {
            text: "",
            attachedFilePaths: [],
            attachments: [attachment, { ...attachment, id: "bad", taskId: "r2", findingIds: "F1" }],
          },
        },
      },
    });
    const [kept, bad] = snapshot?.promptDraftByTask.current?.attachments ?? [];
    expect(kept).toEqual(attachment);
    expect(bad).not.toHaveProperty("findingIds", "F1");
  });
});
