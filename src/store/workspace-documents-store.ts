import { create } from "zustand";
import {
  buildWorkspaceDocumentEditContextPart,
  readWorkspaceDocuments,
} from "@/lib/documents/workspace-documents";
import {
  buildAttachedDocumentRetrievedContext,
  MAX_ATTACHED_DOCUMENTS,
  type DocumentContextAttachment,
} from "@/lib/documents/attached-document-context";
import type {
  WorkspaceDocumentCatalogEntry,
  WorkspaceDocumentChange,
  WorkspaceDocumentRevisionAuthor,
  WorkspaceDocumentSummary,
  WorkspaceDocumentTurnLink,
} from "@/lib/documents/workspace-document-schemas";
import { documentRevisionDiffTabId } from "@/lib/editor/snapshot-diff-tabs";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import { getPromptDraftAttachments } from "@/store/prompt-draft-context";
import type { PromptDraft } from "@/types/chat";

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
/**
 * Document syncs in flight per workspace. Forgetting a workspace cancels them,
 * so a `record()` that answers after the close cannot start a new refresh that
 * re-adds the closed workspace's activity.
 */
const syncsInFlight = new Map<string, Set<{ cancelled: boolean }>>();

/** Reloads one workspace's revision activity; concurrent calls share one read. */
export function refreshWorkspaceDocumentActivity(
  workspaceId: string,
): Promise<void> {
  const pending = refreshes.get(workspaceId);
  if (pending) {
    return pending;
  }
  // Assigned before the read resolves; the callback compares identity later.
  let next!: Promise<void>;
  next = (async () => {
    const response = await window.api?.persistence
      ?.workspaceDocumentActivity?.({ workspaceId })
      .catch(() => null);
    // A workspace forgotten while this read was in flight stays forgotten.
    if (!response?.ok || refreshes.get(workspaceId) !== next) {
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
    if (refreshes.get(workspaceId) === next) {
      refreshes.delete(workspaceId);
    }
  });
  refreshes.set(workspaceId, next);
  return next;
}

/** Drops closed or removed workspaces' revision activity. */
export function forgetWorkspaceDocumentActivity(
  workspaceIds: readonly string[],
): void {
  for (const workspaceId of workspaceIds) {
    refreshes.delete(workspaceId);
    for (const sync of syncsInFlight.get(workspaceId) ?? []) {
      sync.cancelled = true;
    }
    syncsInFlight.delete(workspaceId);
  }
  useWorkspaceDocumentsStore.setState((state) => {
    if (!workspaceIds.some((id) => id in state.activityByWorkspace)) {
      return state;
    }
    const activityByWorkspace = { ...state.activityByWorkspace };
    for (const workspaceId of workspaceIds) {
      delete activityByWorkspace[workspaceId];
    }
    return { activityByWorkspace };
  });
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
  const sync = { cancelled: false };
  let workspaceSyncs = syncsInFlight.get(args.workspaceId);
  if (!workspaceSyncs) {
    workspaceSyncs = new Set();
    syncsInFlight.set(args.workspaceId, workspaceSyncs);
  }
  workspaceSyncs.add(sync);
  try {
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
    if (changes.length > 0 && !sync.cancelled) {
      void refreshWorkspaceDocumentActivity(args.workspaceId);
    }
    return changes;
  } finally {
    const current = syncsInFlight.get(args.workspaceId);
    current?.delete(sync);
    if (current?.size === 0) {
      syncsInFlight.delete(args.workspaceId);
    }
  }
}

/**
 * Refreshes after a host turn finished, but only for a workspace the app still
 * has: a turn of a closed workspace can finish after the close.
 */
export function refreshRegisteredWorkspaceDocumentActivity(args: {
  workspaceId: string;
  workspaces: readonly { id: string }[];
  recentRepositories: readonly { workspaces: readonly { id: string }[] }[];
}): Promise<void> {
  const registered =
    args.workspaces.some((workspace) => workspace.id === args.workspaceId) ||
    args.recentRepositories.some((repository) =>
      repository.workspaces.some(
        (workspace) => workspace.id === args.workspaceId,
      ),
    );
  return registered
    ? refreshWorkspaceDocumentActivity(args.workspaceId)
    : Promise.resolve();
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
  /** Set when the document belongs to a workspace other than the open one. */
  foreign?: boolean;
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
      ...(args.foreign ? { foreignWorkspaceId: args.workspaceId } : {}),
    }),
    filePath: args.filePath,
    oldContent: previous?.ok ? (previous.content ?? "") : "",
    newContent: current.content,
  });
  return true;
}

/**
 * Retrieved context for the documents from other workspaces a prompt has
 * attached: each one's pinned revision, read from the revision history so a
 * deleted workspace's document still arrives.
 */
export async function collectAttachedDocumentContextParts(args: {
  promptDraft: PromptDraft;
}): Promise<CanonicalRetrievedContextPart[]> {
  const attached = getPromptDraftAttachments(args.promptDraft)
    .filter(
      (attachment): attachment is DocumentContextAttachment =>
        attachment.kind === "document-context",
    )
    .filter(
      (attachment, index, all) =>
        all.findIndex((other) => other.id === attachment.id) === index,
    )
    .slice(0, MAX_ATTACHED_DOCUMENTS);
  if (attached.length === 0) {
    return [];
  }
  const readRevision = window.api?.persistence?.workspaceDocumentRevision;
  const results = await Promise.all(
    attached.map(async (attachment) => {
      const response = await readRevision?.({
        workspaceId: attachment.workspaceId,
        filePath: attachment.filePath,
        revision: attachment.revision,
      }).catch(() => null);
      return {
        attachment,
        content: response?.ok ? response.content : null,
      };
    }),
  );
  const part = buildAttachedDocumentRetrievedContext({
    documents: results.flatMap(({ attachment, content }) =>
      content === null ? [] : [{ attachment, content }],
    ),
    missing: results.flatMap(({ attachment, content }) =>
      content === null ? [attachment] : [],
    ),
  });
  return part ? [part] : [];
}

/** Documents in other workspaces, newest first, for the `@` palette. */
export async function loadWorkspaceDocumentCatalog(args: {
  excludeWorkspaceId: string;
}): Promise<WorkspaceDocumentCatalogEntry[]> {
  const response = await window.api?.persistence
    ?.workspaceDocumentCatalog?.(
      args.excludeWorkspaceId ? { excludeWorkspaceId: args.excludeWorkspaceId } : {},
    )
    .catch(() => null);
  return response?.ok ? response.entries : [];
}
