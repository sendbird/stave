import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { byteLengthUtf8 } from "../shared/bounded-text";
import type { PersistenceWorkspaceShell } from "./types";

export const WORKSPACE_SHELL_ARTIFACT_KIND = "workspace_shell_editor_tabs";
export const WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES = 64 * 1024;

const WORKSPACE_SHELL_ARTIFACTS_DIR = "workspace-shells";

type PersistedEditorTab = NonNullable<PersistenceWorkspaceShell["editorTabs"]>[number];

export interface PersistedWorkspaceShellEditorTabArtifactRecord {
  id: string;
  kind: typeof WORKSPACE_SHELL_ARTIFACT_KIND;
  relativePath: string;
  byteSize: number;
  createdAt: string;
  content: string;
}

export interface PersistedWorkspaceShellArtifactPointer {
  id: string;
  relativePath: string;
}

interface PersistedWorkspaceEditorTabBodyEntry {
  id: string;
  content: string;
  originalContent?: string;
  savedContent?: string;
}

function normalizePersistedEditorTab(tab: PersistedEditorTab): PersistedEditorTab {
  if (tab.contentState !== "loading") {
    return tab;
  }
  return {
    ...tab,
    contentState: "deferred",
  };
}

function canExternalizeEditorTabBody(tab: PersistedEditorTab) {
  return tab.id.startsWith("file:") && !tab.isDirty;
}

export function prepareWorkspaceShellEditorTabsPersistence(args: {
  artifactId: string;
  editorTabs: PersistedEditorTab[] | undefined;
  createdAt: string;
  previousBodyByTabId?: Map<string, PersistedWorkspaceEditorTabBodyEntry>;
}) {
  const editorTabs = args.editorTabs ?? [];
  const externalizableTabs = editorTabs.filter(canExternalizeEditorTabBody);
  if (externalizableTabs.length === 0) {
    return {
      persistedEditorTabs: editorTabs.map(normalizePersistedEditorTab),
      artifact: null,
    };
  }

  const externalizedBodies = externalizableTabs.flatMap((tab) => {
    if (tab.contentState === "deferred" || tab.contentState === "loading") {
      const previousBody = args.previousBodyByTabId?.get(tab.id);
      return previousBody ? [previousBody] : [];
    }
    return [{
      id: tab.id,
      content: tab.content ?? "",
      ...(tab.originalContent !== undefined
        ? { originalContent: tab.originalContent }
        : {}),
      ...(tab.savedContent !== undefined
        ? { savedContent: tab.savedContent }
        : {}),
    }];
  }) satisfies PersistedWorkspaceEditorTabBodyEntry[];

  const serializedBodies = JSON.stringify(externalizedBodies);
  const byteSize = byteLengthUtf8(serializedBodies);
  const hasDeferredExternalizableTabs = externalizableTabs.some((tab) =>
    tab.contentState === "deferred" || tab.contentState === "loading"
  );
  if (byteSize <= WORKSPACE_SHELL_INLINE_EDITOR_TABS_MAX_BYTES && !hasDeferredExternalizableTabs) {
    return {
      persistedEditorTabs: editorTabs.map(normalizePersistedEditorTab),
      artifact: null,
    };
  }

  const bodyByTabId = new Map(
    externalizedBodies.map((entry) => [entry.id, entry] as const),
  );
  const persistedEditorTabs = editorTabs.map((tab) => {
    const body = bodyByTabId.get(tab.id);
    if (!body) {
      return normalizePersistedEditorTab({
        ...tab,
        contentState: tab.contentState ?? "ready",
      });
    }
    const {
      content: _content,
      originalContent: _originalContent,
      savedContent: _savedContent,
      ...metadataOnlyTab
    } = tab;
    return {
      ...metadataOnlyTab,
      contentState: "deferred" as const,
    };
  });

  if (externalizedBodies.length === 0) {
    return {
      persistedEditorTabs,
      artifact: null,
    };
  }

  return {
    persistedEditorTabs,
    artifact: {
      id: args.artifactId,
      kind: WORKSPACE_SHELL_ARTIFACT_KIND,
      relativePath: path.posix.join(
        WORKSPACE_SHELL_ARTIFACTS_DIR,
        `${args.artifactId}.json`,
      ),
      byteSize,
      createdAt: args.createdAt,
      content: serializedBodies,
    } satisfies PersistedWorkspaceShellEditorTabArtifactRecord,
  };
}

export function hydratePersistedWorkspaceEditorTabs(args: {
  rootDir: string;
  persistedEditorTabs: PersistedEditorTab[] | undefined;
  artifactRelativePath?: string | null;
}) {
  const persistedEditorTabs = args.persistedEditorTabs ?? [];
  if (!args.artifactRelativePath) {
    return persistedEditorTabs.map((tab) => ({
      ...tab,
      content: tab.content ?? "",
      contentState: "ready" as const,
    }));
  }

  const bodiesByTabId = readPersistedWorkspaceEditorTabBodies({
    rootDir: args.rootDir,
    artifactRelativePath: args.artifactRelativePath,
  });

  return persistedEditorTabs.map((tab) => {
    const body = bodiesByTabId.get(tab.id);
    if (!body) {
      return {
        ...tab,
        content: tab.content ?? "",
        contentState: tab.contentState === "deferred" ? "deferred" : "ready",
      };
    }
    return {
      ...tab,
      content: body.content,
      contentState: "ready" as const,
      ...(body.originalContent !== undefined
        ? { originalContent: body.originalContent }
        : {}),
      ...(body.savedContent !== undefined
        ? { savedContent: body.savedContent }
        : {}),
    };
  });
}

export function restorePersistedWorkspaceEditorTabs(args: {
  rootDir: string;
  persistedEditorTabs: PersistedEditorTab[] | undefined;
  artifactRelativePath?: string | null;
  activeEditorTabId?: string | null;
}) {
  const persistedEditorTabs = args.persistedEditorTabs ?? [];
  if (!args.artifactRelativePath) {
    return persistedEditorTabs.map((tab) => ({
      ...tab,
      content: tab.content ?? "",
      contentState: "ready" as const,
    }));
  }

  const requestedIds = args.activeEditorTabId ? [args.activeEditorTabId] : [];
  const bodiesByTabId = readPersistedWorkspaceEditorTabBodies({
    rootDir: args.rootDir,
    artifactRelativePath: args.artifactRelativePath,
    tabIds: requestedIds,
  });

  return persistedEditorTabs.map((tab) => {
    const body = bodiesByTabId.get(tab.id);
    if (body) {
      return {
        ...tab,
        content: body.content,
        contentState: "ready" as const,
        ...(body.originalContent !== undefined
          ? { originalContent: body.originalContent }
          : {}),
        ...(body.savedContent !== undefined
          ? { savedContent: body.savedContent }
          : {}),
      };
    }

    if (tab.contentState === "deferred") {
      return {
        ...tab,
        content: tab.content ?? "",
        contentState: "deferred" as const,
      };
    }

    return {
      ...tab,
      content: tab.content ?? "",
      contentState: "ready" as const,
    };
  });
}

export function readPersistedWorkspaceEditorTabBodies(args: {
  rootDir: string;
  artifactRelativePath?: string | null;
  tabIds?: string[];
}) {
  const requestedIds = args.tabIds?.length ? new Set(args.tabIds) : null;
  const bodiesByTabId = new Map<string, PersistedWorkspaceEditorTabBodyEntry>();
  if (!args.artifactRelativePath) {
    return bodiesByTabId;
  }

  try {
    const raw = readFileSync(
      path.join(args.rootDir, args.artifactRelativePath),
      "utf8",
    );
    const parsed = JSON.parse(raw) as PersistedWorkspaceEditorTabBodyEntry[];
    for (const entry of parsed) {
      if (requestedIds && !requestedIds.has(entry.id)) {
        continue;
      }
      bodiesByTabId.set(entry.id, entry);
    }
  } catch {
    // Fall back to inline values that still exist in persisted metadata.
  }

  return bodiesByTabId;
}

export function writePreparedWorkspaceShellArtifact(args: {
  rootDir: string;
  artifact: PersistedWorkspaceShellEditorTabArtifactRecord;
}) {
  const absolutePath = path.join(args.rootDir, args.artifact.relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, args.artifact.content, "utf8");
}

export function deletePersistedWorkspaceShellArtifacts(args: {
  rootDir: string;
  relativePaths: string[];
}) {
  for (const relativePath of args.relativePaths) {
    try {
      rmSync(path.join(args.rootDir, relativePath), { force: true });
    } catch {
      // Best-effort cleanup; stale artifacts should not break workspace persistence.
    }
  }
}
