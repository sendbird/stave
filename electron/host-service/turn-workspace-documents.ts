import { readWorkspaceDocumentFiles } from "../persistence/workspace-document-files";
import { ensureHostServicePersistenceReady } from "./persistence";

/**
 * Records the workspace documents a host-run turn changed as that turn's agent
 * revisions. Without this, a turn the renderer did not start (Local MCP, agent
 * run, automation, wake-up) left its edits to be recorded later as edits made
 * outside a turn, and the next message would report them as user edits.
 */
export async function recordTurnWorkspaceDocuments(args: {
  workspaceId: string;
  workspacePath: string;
  taskId?: string;
  turnId?: string;
  /** `external` before a turn starts, for edits made since the last one. */
  author?: "agent" | "external";
}) {
  try {
    const documents = await readWorkspaceDocumentFiles(args.workspacePath);
    if (documents.length === 0) {
      return;
    }
    ensureHostServicePersistenceReady().documents.record({
      workspaceId: args.workspaceId,
      author: args.author ?? "agent",
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(args.turnId ? { turnId: args.turnId } : {}),
      documents,
    });
  } catch (error) {
    console.warn("[stave-mcp] failed to record workspace documents", error, {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
    });
  }
}
