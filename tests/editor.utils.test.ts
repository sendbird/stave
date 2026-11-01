import { describe, expect, test } from "bun:test";
import {
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  isHtmlEditorTab,
  isPreviewableEditorTab,
  resolveEditorPreviewModeForTab,
} from "@/store/editor.utils";
import { normalizeEditorHtmlViewMode } from "@/store/app-settings";

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

describe("HTML editor preview", () => {
  const html = { kind: "text" as const, language: "html", filePath: "site/index.html" };
  const htm = { kind: "text" as const, language: "html", filePath: "LEGACY.HTM" };
  const vue = { kind: "text" as const, language: "html", filePath: "src/App.vue" };
  const markdown = { kind: "text" as const, language: "markdown", filePath: "README.md" };
  const code = { kind: "text" as const, language: "typescript", filePath: "src/a.ts" };

  test("treats only .html and .htm documents as previewable HTML", () => {
    expect(isHtmlEditorTab(html)).toBe(true);
    expect(isHtmlEditorTab(htm)).toBe(true);
    expect(isHtmlEditorTab(vue)).toBe(false);
    expect(isHtmlEditorTab({ ...html, kind: "image" })).toBe(false);
    expect(isPreviewableEditorTab(markdown)).toBe(true);
    expect(isPreviewableEditorTab(vue)).toBe(false);
    expect(isPreviewableEditorTab(code)).toBe(false);
  });

  test("opens and activates HTML in the remembered mode", () => {
    for (const opening of [true, false]) {
      for (const current of [true, false]) {
        expect(resolveEditorPreviewModeForTab({ tab: html, opening, current, htmlViewMode: "preview" })).toBe(true);
        expect(resolveEditorPreviewModeForTab({ tab: html, opening, current, htmlViewMode: "source" })).toBe(false);
      }
    }
  });

  test("keeps markdown opening in preview and leaves other tabs on the current flag", () => {
    expect(resolveEditorPreviewModeForTab({ tab: markdown, opening: true, current: false, htmlViewMode: "source" })).toBe(true);
    expect(resolveEditorPreviewModeForTab({ tab: markdown, opening: false, current: false, htmlViewMode: "preview" })).toBe(false);
    expect(resolveEditorPreviewModeForTab({ tab: code, opening: true, current: true, htmlViewMode: "source" })).toBe(true);
    expect(resolveEditorPreviewModeForTab({ tab: vue, opening: true, current: false, htmlViewMode: "preview" })).toBe(false);
  });

  test("normalizes a stored HTML view mode to preview unless it is source", () => {
    expect(normalizeEditorHtmlViewMode("source")).toBe("source");
    expect(normalizeEditorHtmlViewMode("preview")).toBe("preview");
    expect(normalizeEditorHtmlViewMode(undefined)).toBe("preview");
    expect(normalizeEditorHtmlViewMode("split")).toBe("preview");
  });
});
