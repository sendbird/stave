import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isGitGraphEditorTab,
  shouldShowEditorFileActions,
} from "@/components/panes/editor-tab-presentation";
import { EditorPaneChipGlyph } from "@/components/panes/PaneTabChip";
import { prepareWorkspaceShellEditorTabsPersistence } from "../electron/persistence/workspace-shell-artifacts";

describe("Git Graph editor integration", () => {
  test("classifies Git Graph tabs separately from file tabs", () => {
    expect(isGitGraphEditorTab({ kind: "git-graph" })).toBe(true);
    expect(shouldShowEditorFileActions({ kind: "git-graph" })).toBe(false);
    expect(shouldShowEditorFileActions({ kind: "text" })).toBe(true);
    expect(shouldShowEditorFileActions({ kind: "image" })).toBe(true);
    expect(shouldShowEditorFileActions(null)).toBe(false);
  });

  test("uses the Git Graph glyph only for Git Graph editor tabs", () => {
    const graphHtml = renderToStaticMarkup(
      createElement(EditorPaneChipGlyph, { kind: "git-graph" }),
    );
    const fileHtml = renderToStaticMarkup(
      createElement(EditorPaneChipGlyph, { kind: "text" }),
    );

    expect(graphHtml).toContain('data-pane-tab-icon="git-graph"');
    expect(fileHtml).toContain('data-pane-tab-icon="file"');
  });

  test("keeps Git Graph tabs inline with their persisted surface kind", () => {
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-git-graph",
      createdAt: "2026-07-31T00:00:00.000Z",
      editorTabs: [
        {
          id: "git-graph:workspace-1",
          filePath: "Git Graph",
          kind: "git-graph",
          language: "",
          content: "",
          hasConflict: false,
          isDirty: false,
        },
      ],
    });

    expect(prepared.artifact).toBeNull();
    expect(prepared.persistedEditorTabs?.[0]?.kind).toBe("git-graph");
  });
});
