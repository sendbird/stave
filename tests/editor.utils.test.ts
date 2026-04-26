import { describe, expect, test } from "bun:test";
import {
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
} from "@/store/editor.utils";

describe("canSendEditorContextToTask", () => {
  test("allows send to agent when the task is idle and an editor tab is active", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: true,
      isTaskResponding: false,
    })).toBe(true);
  });

  test("blocks send to agent when there is no active editor tab", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: false,
      isTaskResponding: false,
    })).toBe(false);
  });

  test("blocks send to agent while the task already has an active turn", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: true,
      isTaskResponding: true,
    })).toBe(false);
  });
});

describe("canSendWorkspaceFileToTask", () => {
  test("allows send to agent when the task is idle and a workspace file exists", () => {
    expect(canSendWorkspaceFileToTask({
      taskId: "task-a",
      filePath: ".stave/context/plans/task-a_2026-04-06T10-00-00.md",
      isTaskResponding: false,
    })).toBe(true);
  });

  test("blocks send to agent when there is no file path", () => {
    expect(canSendWorkspaceFileToTask({
      taskId: "task-a",
      filePath: "",
      isTaskResponding: false,
    })).toBe(false);
  });

  test("blocks send to agent while the task already has an active turn", () => {
    expect(canSendWorkspaceFileToTask({
      taskId: "task-a",
      filePath: ".stave/context/plans/task-a_2026-04-06T10-00-00.md",
      isTaskResponding: true,
    })).toBe(false);
  });
});
