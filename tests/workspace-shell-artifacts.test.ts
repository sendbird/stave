import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  hydratePersistedWorkspaceEditorTabs,
  prepareWorkspaceShellEditorTabsPersistence,
  readPersistedWorkspaceEditorTabBodies,
  restorePersistedWorkspaceEditorTabs,
  WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES,
  writePreparedWorkspaceShellArtifact,
} from "../electron/persistence/workspace-shell-artifacts";

describe("workspace shell artifact persistence", () => {
  let rootDir = "";

  beforeEach(() => {
    rootDir = path.join(
      tmpdir(),
      `stave-workspace-shell-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(rootDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("keeps small editor tab payloads inline", () => {
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-small",
      createdAt: "2026-04-14T08:00:00.000Z",
      editorTabs: [{
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        kind: "text",
        language: "typescript",
        content: "const answer = 42;\n",
        originalContent: "const answer = 42;\n",
        savedContent: "const answer = 42;\n",
        baseRevision: "rev-1",
        hasConflict: false,
        isDirty: false,
      }],
    });

    expect(prepared.artifact).toBeNull();
    expect(prepared.persistedEditorTabs?.[0]?.content).toBe("const answer = 42;\n");
    expect(prepared.persistedEditorTabs?.[0]?.contentState).toBeUndefined();
  });

  test("externalizes only clean file tab bodies and keeps dirty tabs inline", () => {
    const largeBody = "x".repeat(WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES + 4096);
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-large",
      createdAt: "2026-04-14T08:00:00.000Z",
      editorTabs: [
        {
          id: "file:/tmp/project/src/app.ts",
          filePath: "/tmp/project/src/app.ts",
          kind: "text",
          language: "typescript",
          content: largeBody,
          originalContent: largeBody,
          savedContent: largeBody,
          baseRevision: "rev-1",
          hasConflict: false,
          isDirty: false,
        },
        {
          id: "scm-diff:src/app.ts",
          filePath: "src/app.ts",
          kind: "text",
          language: "typescript",
          content: "new diff",
          originalContent: "old diff",
          savedContent: "new diff",
          baseRevision: null,
          hasConflict: false,
          isDirty: false,
        },
        {
          id: "file:/tmp/project/src/dirty.ts",
          filePath: "/tmp/project/src/dirty.ts",
          kind: "text",
          language: "typescript",
          content: "unsaved edit",
          originalContent: "saved",
          savedContent: "saved",
          baseRevision: "rev-2",
          hasConflict: false,
          isDirty: true,
        },
      ],
    });

    expect(prepared.artifact).not.toBeNull();
    expect(prepared.persistedEditorTabs?.[0]).toEqual({
      id: "file:/tmp/project/src/app.ts",
      filePath: "/tmp/project/src/app.ts",
      kind: "text",
      language: "typescript",
      contentState: "deferred",
      baseRevision: "rev-1",
      hasConflict: false,
      isDirty: false,
    });
    expect(prepared.persistedEditorTabs?.[1]?.content).toBe("new diff");
    expect(prepared.persistedEditorTabs?.[2]?.content).toBe("unsaved edit");
  });

  test("hydrates externalized clean file bodies back into editor tabs", () => {
    const largeBody = "x".repeat(WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES + 4096);
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-hydrate",
      createdAt: "2026-04-14T08:00:00.000Z",
      editorTabs: [{
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        kind: "text",
        language: "typescript",
        content: largeBody,
        originalContent: largeBody,
        savedContent: largeBody,
        baseRevision: "rev-1",
        hasConflict: false,
        isDirty: false,
      }],
    });

    expect(prepared.artifact).not.toBeNull();
    writePreparedWorkspaceShellArtifact({
      rootDir,
      artifact: prepared.artifact!,
    });

    const hydrated = hydratePersistedWorkspaceEditorTabs({
      rootDir,
      persistedEditorTabs: prepared.persistedEditorTabs,
      artifactRelativePath: prepared.artifact?.relativePath,
    });

    expect(hydrated).toEqual([{
      id: "file:/tmp/project/src/app.ts",
      filePath: "/tmp/project/src/app.ts",
      kind: "text",
      language: "typescript",
      content: largeBody,
      contentState: "ready",
      originalContent: largeBody,
      savedContent: largeBody,
      baseRevision: "rev-1",
      hasConflict: false,
      isDirty: false,
    }]);
  });

  test("restores only the active externalized tab body eagerly", () => {
    const largeBody = "x".repeat(WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES + 4096);
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-restore",
      createdAt: "2026-04-14T08:00:00.000Z",
      editorTabs: [
        {
          id: "file:/tmp/project/src/active.ts",
          filePath: "/tmp/project/src/active.ts",
          kind: "text",
          language: "typescript",
          content: largeBody,
          originalContent: largeBody,
          savedContent: largeBody,
          baseRevision: "rev-1",
          hasConflict: false,
          isDirty: false,
        },
        {
          id: "file:/tmp/project/src/other.ts",
          filePath: "/tmp/project/src/other.ts",
          kind: "text",
          language: "typescript",
          content: `${largeBody}-other`,
          originalContent: `${largeBody}-other`,
          savedContent: `${largeBody}-other`,
          baseRevision: "rev-2",
          hasConflict: false,
          isDirty: false,
        },
      ],
    });

    writePreparedWorkspaceShellArtifact({
      rootDir,
      artifact: prepared.artifact!,
    });

    const restored = restorePersistedWorkspaceEditorTabs({
      rootDir,
      persistedEditorTabs: prepared.persistedEditorTabs,
      artifactRelativePath: prepared.artifact?.relativePath,
      activeEditorTabId: "file:/tmp/project/src/active.ts",
    });

    expect(restored).toEqual([
      {
        id: "file:/tmp/project/src/active.ts",
        filePath: "/tmp/project/src/active.ts",
        kind: "text",
        language: "typescript",
        content: largeBody,
        contentState: "ready",
        originalContent: largeBody,
        savedContent: largeBody,
        baseRevision: "rev-1",
        hasConflict: false,
        isDirty: false,
      },
      {
        id: "file:/tmp/project/src/other.ts",
        filePath: "/tmp/project/src/other.ts",
        kind: "text",
        language: "typescript",
        content: "",
        contentState: "deferred",
        baseRevision: "rev-2",
        hasConflict: false,
        isDirty: false,
      },
    ]);
  });

  test("reads only requested externalized tab bodies", () => {
    const largeBody = "x".repeat(WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES + 4096);
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-selective-read",
      createdAt: "2026-04-14T08:00:00.000Z",
      editorTabs: [
        {
          id: "file:/tmp/project/src/a.ts",
          filePath: "/tmp/project/src/a.ts",
          kind: "text",
          language: "typescript",
          content: largeBody,
          originalContent: largeBody,
          savedContent: largeBody,
          baseRevision: "rev-a",
          hasConflict: false,
          isDirty: false,
        },
        {
          id: "file:/tmp/project/src/b.ts",
          filePath: "/tmp/project/src/b.ts",
          kind: "text",
          language: "typescript",
          content: `${largeBody}-b`,
          originalContent: `${largeBody}-b`,
          savedContent: `${largeBody}-b`,
          baseRevision: "rev-b",
          hasConflict: false,
          isDirty: false,
        },
      ],
    });

    writePreparedWorkspaceShellArtifact({
      rootDir,
      artifact: prepared.artifact!,
    });

    const bodies = readPersistedWorkspaceEditorTabBodies({
      rootDir,
      artifactRelativePath: prepared.artifact?.relativePath,
      tabIds: ["file:/tmp/project/src/b.ts"],
    });

    expect([...bodies.keys()]).toEqual(["file:/tmp/project/src/b.ts"]);
    expect(bodies.get("file:/tmp/project/src/b.ts")?.content).toBe(`${largeBody}-b`);
  });

  test("preserves previous externalized bodies for deferred tabs", () => {
    const largeBody = "x".repeat(WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES + 4096);
    const prepared = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: "workspace-shell-preserve",
      createdAt: "2026-04-14T08:00:00.000Z",
      previousBodyByTabId: new Map([[
        "file:/tmp/project/src/app.ts",
        {
          id: "file:/tmp/project/src/app.ts",
          content: largeBody,
          originalContent: largeBody,
          savedContent: largeBody,
        },
      ]]),
      editorTabs: [{
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        kind: "text",
        language: "typescript",
        content: "",
        contentState: "deferred",
        baseRevision: "rev-1",
        hasConflict: false,
        isDirty: false,
      }],
    });

    expect(prepared.artifact?.content).toContain(largeBody);
    expect(prepared.persistedEditorTabs).toEqual([{
      id: "file:/tmp/project/src/app.ts",
      filePath: "/tmp/project/src/app.ts",
      kind: "text",
      language: "typescript",
      contentState: "deferred",
      baseRevision: "rev-1",
      hasConflict: false,
      isDirty: false,
    }]);
  });
});
