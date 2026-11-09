import type { AttachmentContext } from "../providers/attachment-context";
import type { AgentRunInitialContext } from "../agent-runs/initial-context";
import { TarsDelegateRejection } from "./agents";
import { tarsAttachmentSummary, type TarsMessage } from "./conversation";
import { TarsWorkAttachmentsSchema, type TarsResponsibility, type TarsWorkAttachments } from "./types";

/**
 * Which of the admitting message's attachments one delegated unit carries.
 * Every unit carries all of them unless Tars named the positions this unit
 * needs (`named`; empty gives it none): the user attached them to explain the
 * work, so a unit missing a screenshot is worse than one seeing an extra one,
 * and only Tars, which read the message, can tell that an attachment belongs
 * to one unit. Undefined when the unit carries none. A position the message
 * does not have refuses the unit (`attachmentUnknown`) instead of guessing.
 */
export function tarsWorkAttachmentsOf(message: Pick<TarsMessage, "id" | "attachments">, named?: readonly number[]): TarsWorkAttachments | undefined {
  const parts = message.attachments ?? [];
  const missing = named?.find((index) => index >= parts.length);
  if (missing !== undefined) {
    // i18n-ignore: diagnostic only; the interface translates the typed refusal reason
    throw new TarsDelegateRejection("attachmentUnknown", `Tars gave this work attachment ${missing + 1}, but the message has ${parts.length}.`);
  }
  const indexes = named ? [...new Set(named)].sort((a, b) => a - b) : parts.map((_, index) => index);
  if (!indexes.length) return undefined;
  return TarsWorkAttachmentsSchema.parse({ messageId: message.id, items: indexes.map((index) => ({ index, ...tarsAttachmentSummary(parts[index]!) })) });
}

const SOURCE_PREFIX = "tars-work:";

/** What a work's run names its attachments by (`AgentRunInitialContext.attachmentSource`); undefined when it carries none. */
export function tarsAttachmentSource(row: Pick<TarsResponsibility, "id" | "attachments">): string | undefined {
  return row.attachments ? `${SOURCE_PREFIX}${row.id}` : undefined;
}

/** The responsibility a run's attachment source names; null for any other source. */
export function parseTarsAttachmentSource(source: string): string | null {
  return source.startsWith(SOURCE_PREFIX) && source.length > SOURCE_PREFIX.length ? source.slice(SOURCE_PREFIX.length) : null;
}

type FirstTurnAttachments = Pick<AgentRunInitialContext, "fileContexts" | "imageContexts">;

/**
 * The attachments a work's reference names, read from its message's saved
 * content and passed the way the task composer sends them: files as file
 * contexts, images as image contexts, which both providers send as native
 * image input. Throws when the message, or any attachment the work carries,
 * is gone or no longer matches its summary, so a work never runs without
 * what the user showed it.
 */
export function tarsRunAttachmentContext(reference: TarsWorkAttachments, parts: readonly AttachmentContext[] | null): FirstTurnAttachments {
  // i18n-ignore: run diagnostic recorded with the turn that could not start
  if (!parts) throw new Error("The message whose attachments this work carries is no longer saved.");
  const fileContexts: NonNullable<FirstTurnAttachments["fileContexts"]> = [];
  const imageContexts: NonNullable<FirstTurnAttachments["imageContexts"]> = [];
  for (const item of reference.items) {
    const part = parts[item.index];
    const summary = part ? tarsAttachmentSummary(part) : null;
    if (!part || !summary || summary.kind !== item.kind || summary.name !== item.name || summary.type !== item.type || summary.size !== item.size) {
      // i18n-ignore: run diagnostic recorded with the turn that could not start
      throw new Error(`The attachment "${item.name}" of this work's message is no longer saved.`);
    }
    if (part.type === "file_context") fileContexts.push({ filePath: part.filePath, content: part.content, language: part.language });
    else imageContexts.push({ dataUrl: part.dataUrl, label: part.label, mimeType: part.mimeType });
  }
  return { ...(fileContexts.length ? { fileContexts } : {}), ...(imageContexts.length ? { imageContexts } : {}) };
}

/** What resolving a run's Tars attachment source reads, each from its own store. */
export interface TarsRunAttachmentReads {
  responsibility: (id: string) => Pick<TarsResponsibility, "id" | "taskId" | "executionWorkspaceId" | "attachments"> | null;
  /** The message's saved attachments, content included; null when the message is gone. */
  attachments: (messageId: string) => readonly AttachmentContext[] | null;
}

/**
 * The first-turn attachments of the run a Tars work started. Only the run
 * that leads the work's own task, in its execution workspace, may read them;
 * any other run naming the source is refused.
 */
export function resolveTarsRunAttachments(source: string, run: { leadTaskId: string; workspaceId: string }, read: TarsRunAttachmentReads): FirstTurnAttachments {
  const id = parseTarsAttachmentSource(source);
  const row = id ? read.responsibility(id) : null;
  if (!row?.attachments || row.taskId !== run.leadTaskId || row.executionWorkspaceId !== run.workspaceId) {
    // i18n-ignore: run diagnostic recorded with the turn that could not start
    throw new Error("This run does not lead the work whose attachments it names.");
  }
  return tarsRunAttachmentContext(row.attachments, read.attachments(row.attachments.messageId));
}
