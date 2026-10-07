import { create } from "zustand";
import {
  buildWorkspaceDocumentEditContextPart,
  readWorkspaceDocuments,
} from "@/lib/documents/workspace-documents";
import type {
  WorkspaceDocumentChange,
  WorkspaceDocumentRevisionAuthor,
  WorkspaceDocumentSummary,
  WorkspaceDocumentTurnLink,
} from "@/lib/documents/workspace-document-schemas";
import { documentRevisionDiffTabId } from "@/lib/editor/snapshot-diff-tabs";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";

/**
 * Revision activity of each workspace's documents, read from the main-process
 * revision store. Derived lookups are built once per refresh so selectors can
 * return stored references instead of allocating.
 */
export interface WorkspaceDocumentActivityView {
  documentsByPath: Record<string, WorkspaceDocumentSummary>;
  linksByTurn: Record<string, WorkspaceDocumentTurnLink[]>;
}

interface WorkspaceDocumentsState {
  activityByWorkspace: Record<string, WorkspaceDocumentActivityView>;
}

export const EMPTY_TURN_DOCUMENT_LINKS: readonly WorkspaceDocumentTurnLink[] =
  [];

export const useWorkspaceDocumentsStore = create<WorkspaceDocumentsState>(
  () => ({ activityByWorkspace: {} }),
);

const refreshes = new Map<string, Promise<void>>();

/** Reloads one workspace's revision activity; concurrent calls share one read. */
export function refreshWorkspaceDocumentActivity(
  workspaceId: string,
): Promise<void> {
  const pending = refreshes.get(workspaceId);
  if (pending) {
    return pending;
  }
  const next = (async () => {
    const response = await window.api?.persistence
      ?.workspaceDocumentActivity?.({ workspaceId })
      .catch(() => null);
    if (!response?.ok) {
      return;
    }
    const documentsByPath: Record<string, WorkspaceDocumentSummary> = {};
    for (const document of response.documents) {
      documentsByPath[document.filePath] = document;
    }
    const linksByTurn: Record<string, WorkspaceDocumentTurnLink[]> = {};
    for (const link of response.turnLinks) {
      (linksByTurn[link.turnId] ??= []).push(link);
    }
    useWorkspaceDocumentsStore.setState((state) => ({
      activityByWorkspace: {
        ...state.activityByWorkspace,
        [workspaceId]: { documentsByPath, linksByTurn },
      },
    }));
  })().finally(() => {
    refreshes.delete(workspaceId);
  });
  refreshes.set(workspaceId, next);
  return next;
}

/**
 * Reads the workspace's documents and records every one that changed since its
 * newest revision. Returns the changes; an unavailable bridge records nothing.
 */
export async function syncWorkspaceDocuments(args: {
  workspaceId: string;
  rootPath: string;
  author: WorkspaceDocumentRevisionAuthor;
  taskId?: string;
  turnId?: string;
  relevantTaskId?: string;
}): Promise<WorkspaceDocumentChange[]> {
  const record = window.api?.persistence?.recordWorkspaceDocuments;
  if (!record || !args.workspaceId || !args.rootPath) {
    return [];
  }
  const documents = await readWorkspaceDocuments(args.rootPath);
  if (documents.length === 0) {
    return [];
  }
  const response = await record({
    workspaceId: args.workspaceId,
    author: args.author,
    ...(args.taskId ? { taskId: args.taskId } : {}),
    ...(args.turnId ? { turnId: args.turnId } : {}),
    ...(args.relevantTaskId ? { relevantTaskId: args.relevantTaskId } : {}),
    documents,
  }).catch(() => null);
  const changes = response?.ok ? response.changes : [];
  if (changes.length > 0) {
    void refreshWorkspaceDocumentActivity(args.workspaceId);
  }
  return changes;
}

/**
 * Before a send: records documents edited since the last turn and, for the
 * ones this task wrote, returns the edits as retrieved context so the agent
 * keeps them instead of overwriting them.
 */
export async function collectWorkspaceDocumentEditContextParts(args: {
  workspaceId: string;
  rootPath: string;
  taskId: string;
}): Promise<CanonicalRetrievedContextPart[]> {
  try {
    const changes = await syncWorkspaceDocuments({
      workspaceId: args.workspaceId,
      rootPath: args.rootPath,
      author: "external",
      relevantTaskId: args.taskId,
    });
    const part = buildWorkspaceDocumentEditContextPart(changes);
    return part ? [part] : [];
  } catch {
    return [];
  }
}

/** After a turn: records the documents it wrote as that turn's revisions. */
export function syncWorkspaceDocumentsAtTurnEnd(args: {
  workspaceId: string;
  rootPath: string;
  taskId: string;
  turnId: string;
  onChanged?: () => void;
}) {
  void syncWorkspaceDocuments({
    workspaceId: args.workspaceId,
    rootPath: args.rootPath,
    author: "agent",
    taskId: args.taskId,
    turnId: args.turnId,
  })
    .then((changes) => {
      if (changes.length > 0) {
        args.onChanged?.();
      }
    })
    .catch(() => {});
}

/**
 * Opens a read-only diff of one recorded revision against the one before it.
 * The first revision is compared with an empty document. Returns false when
 * the revision can no longer be read.
 */
export async function openWorkspaceDocumentRevisionDiff(args: {
  workspaceId: string;
  filePath: string;
  revision: number;
  openDiffInEditor: (args: {
    editorTabId: string;
    filePath: string;
    oldContent: string;
    newContent: string;
  }) => Promise<void>;
}): Promise<boolean> {
  const readRevision = window.api?.persistence?.workspaceDocumentRevision;
  if (!readRevision) {
    return false;
  }
  const [current, previous] = await Promise.all([
    readRevision({
      workspaceId: args.workspaceId,
      filePath: args.filePath,
      revision: args.revision,
    }).catch(() => null),
    args.revision > 1
      ? readRevision({
          workspaceId: args.workspaceId,
          filePath: args.filePath,
          revision: args.revision - 1,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!current?.ok || current.content === null) {
    return false;
  }
  await args.openDiffInEditor({
    editorTabId: documentRevisionDiffTabId({
      filePath: args.filePath,
      fromRevision: Math.max(0, args.revision - 1),
      toRevision: args.revision,
    }),
    filePath: args.filePath,
    oldContent: previous?.ok ? (previous.content ?? "") : "",
    newContent: current.content,
  });
  return true;
}
