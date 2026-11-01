import { describe, expect, test } from "bun:test";
import {
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  isHtmlEditorTab,
  resolveEditorTabHtmlViewMode,
  shouldShowEditorPreview,
} from "@/store/editor.utils";
import { resolveEditorLayoutForActivatedTab } from "@/store/layout.utils";
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
    expect(isHtmlEditorTab(markdown)).toBe(false);
    expect(isHtmlEditorTab(code)).toBe(false);
    expect(isHtmlEditorTab({ ...html, kind: "image" })).toBe(false);
  });

  test("an HTML tab keeps its own mode and falls back to the remembered one", () => {
    expect(resolveEditorTabHtmlViewMode({ tab: { htmlViewMode: "source" }, remembered: "preview" })).toBe("source");
    expect(resolveEditorTabHtmlViewMode({ tab: { htmlViewMode: "preview" }, remembered: "source" })).toBe("preview");
    expect(resolveEditorTabHtmlViewMode({ tab: {}, remembered: "source" })).toBe("source");
    expect(resolveEditorTabHtmlViewMode({ tab: null, remembered: "preview" })).toBe("preview");
  });

  test("HTML shows its own mode in every panel, active or not, unless a diff is shown", () => {
    for (const isActiveEditorTab of [true, false]) {
      for (const markdownPreviewFlag of [true, false]) {
        const base = { previewKind: "html" as const, isActiveEditorTab, markdownPreviewFlag, diffMode: false };
        expect(shouldShowEditorPreview({ ...base, htmlViewMode: "preview" })).toBe(true);
        expect(shouldShowEditorPreview({ ...base, htmlViewMode: "source" })).toBe(false);
        expect(shouldShowEditorPreview({ ...base, diffMode: true, htmlViewMode: "preview" })).toBe(false);
      }
    }
  });

  test("markdown keeps following the layout flag on the active tab only", () => {
    const base = { previewKind: "markdown" as const, diffMode: false, htmlViewMode: "preview" as const };
    expect(shouldShowEditorPreview({ ...base, isActiveEditorTab: true, markdownPreviewFlag: true })).toBe(true);
    expect(shouldShowEditorPreview({ ...base, isActiveEditorTab: false, markdownPreviewFlag: true })).toBe(false);
    expect(shouldShowEditorPreview({ ...base, isActiveEditorTab: true, markdownPreviewFlag: false })).toBe(false);
    expect(shouldShowEditorPreview({ ...base, previewKind: null, isActiveEditorTab: true, markdownPreviewFlag: true })).toBe(false);
  });

  test("a tab switch takes the new tab's diff mode instead of the previous tab's", () => {
    const layout = { editorDiffMode: true, editorMarkdownPreviewMode: true };
    const fileTab = { id: "file:index.html", kind: "text" as const, originalContent: "<p></p>" };
    const diffTab = { id: "scm-diff:index.html", kind: "text" as const, originalContent: "<p></p>" };
    expect(resolveEditorLayoutForActivatedTab({ tab: fileTab, layout })).toEqual({
      editorDiffMode: false,
      editorMarkdownPreviewMode: true,
    });
    expect(resolveEditorLayoutForActivatedTab({ tab: diffTab, layout: { editorDiffMode: false, editorMarkdownPreviewMode: true } })).toEqual({
      editorDiffMode: true,
      editorMarkdownPreviewMode: false,
    });
  });

  test("normalizes a stored HTML view mode to preview unless it is source", () => {
    expect(normalizeEditorHtmlViewMode("source")).toBe("source");
    expect(normalizeEditorHtmlViewMode("preview")).toBe("preview");
    expect(normalizeEditorHtmlViewMode(undefined)).toBe("preview");
    expect(normalizeEditorHtmlViewMode("split")).toBe("preview");
  });
});
