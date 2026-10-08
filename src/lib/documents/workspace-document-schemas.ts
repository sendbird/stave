import { z } from "zod";

/**
 * Workspace documents are the Markdown files in a workspace's document
 * directory (`.stave/context/plans`, plus the legacy `.stave/plans`). The file
 * is the working copy an agent or the user edits; Stave records each new
 * version as a revision in its own database so the history survives edits
 * made outside Stave and can be compared turn by turn.
 *
 * These schemas are the contract between the renderer and the main-process
 * revision store.
 */

/** Documents larger than this are skipped rather than recorded. */
export const MAX_WORKSPACE_DOCUMENT_CHARS = 256 * 1024;
/** Upper bound on documents read and recorded in one sync. */
export const MAX_WORKSPACE_DOCUMENTS_PER_SYNC = 100;
/** Revisions kept per document; older ones are dropped. */
export const MAX_WORKSPACE_DOCUMENT_REVISIONS = 50;
/** Turn-to-revision links returned for the conversation cards. */
export const MAX_WORKSPACE_DOCUMENT_TURN_LINKS = 500;

/**
 * Who produced a revision. `agent`: the file changed during a turn of the task
 * that recorded it. `external`: it changed between turns — by the user in an
 * editor, another tool, or a turn Stave did not observe.
 */
export const WorkspaceDocumentRevisionAuthorSchema = z.enum([
  "agent",
  "external",
]);
export type WorkspaceDocumentRevisionAuthor = z.infer<
  typeof WorkspaceDocumentRevisionAuthorSchema
>;

const WorkspaceIdSchema = z.string().trim().min(1).max(512);
const DocumentPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      value.endsWith(".md") &&
      !value.startsWith("/") &&
      !value.replaceAll("\\", "/").split("/").includes(".."),
    "Expected a workspace-relative Markdown path.",
  );

export const RecordWorkspaceDocumentsArgsSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    author: WorkspaceDocumentRevisionAuthorSchema,
    taskId: z.string().trim().min(1).max(200).optional(),
    turnId: z.string().trim().min(1).max(200).optional(),
    /**
     * When set, each changed document says whether this task recorded an
     * earlier revision of it, so a task only hears about its own documents.
     */
    relevantTaskId: z.string().trim().min(1).max(200).optional(),
    documents: z
      .array(
        z
          .object({
            filePath: DocumentPathSchema,
            content: z.string().max(MAX_WORKSPACE_DOCUMENT_CHARS),
          })
          .strict(),
      )
      .max(MAX_WORKSPACE_DOCUMENTS_PER_SYNC),
  })
  .strict();
export type RecordWorkspaceDocumentsArgs = z.infer<
  typeof RecordWorkspaceDocumentsArgsSchema
>;

export interface WorkspaceDocumentChange {
  filePath: string;
  revision: number;
  /** `null` when this is the first revision Stave has seen of the document. */
  previousRevision: number | null;
  previousContent: string | null;
  content: string;
  /** Whether `relevantTaskId` recorded an earlier revision of this document. */
  touchedByTask: boolean;
}

export const WorkspaceDocumentScopeSchema = z
  .object({ workspaceId: WorkspaceIdSchema })
  .strict();
export type WorkspaceDocumentScope = z.infer<
  typeof WorkspaceDocumentScopeSchema
>;

export interface WorkspaceDocumentSummary {
  filePath: string;
  latestRevision: number;
  latestAuthor: WorkspaceDocumentRevisionAuthor;
  latestCreatedAt: string;
  revisionCount: number;
}

export interface WorkspaceDocumentTurnLink {
  turnId: string;
  taskId: string | null;
  filePath: string;
  revision: number;
}

export interface WorkspaceDocumentActivity {
  documents: WorkspaceDocumentSummary[];
  /** Agent revisions linked to the turn that wrote them, newest first. */
  turnLinks: WorkspaceDocumentTurnLink[];
}

export const WorkspaceDocumentRevisionsArgsSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    filePath: DocumentPathSchema,
  })
  .strict();
export type WorkspaceDocumentRevisionsArgs = z.infer<
  typeof WorkspaceDocumentRevisionsArgsSchema
>;

export interface WorkspaceDocumentRevisionMeta {
  revision: number;
  author: WorkspaceDocumentRevisionAuthor;
  taskId: string | null;
  turnId: string | null;
  createdAt: string;
}

export const WorkspaceDocumentRevisionArgsSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    filePath: DocumentPathSchema,
    revision: z.number().int().min(1),
  })
  .strict();
export type WorkspaceDocumentRevisionArgs = z.infer<
  typeof WorkspaceDocumentRevisionArgsSchema
>;
