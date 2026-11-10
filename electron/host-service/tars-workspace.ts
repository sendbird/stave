import type { WorkspaceInformationState } from "../../src/lib/workspace-information";
import { TarsWorkspaceUndoSchema, type TarsWorkspaceAction } from "../../src/lib/tars/workspace-action";
import { TarsUndoActionRefused, type TarsActionUndo } from "../../src/lib/tars/action-undo";
import type { TarsActionReceipt, TarsMessage } from "../../src/lib/tars/conversation";
import type { TarsDecisionPorts } from "./tars-decisions";
import { createLocalMcpWorkspaceInformation } from "./local-mcp-workspace-information";
import { assertTarsSource, resolveTarsWorkspace } from "../main/tars-scope";
import { isTarsStorageBusy } from "../persistence/tars-conversation-store";

export interface TarsWorkspacePorts {
  read(workspaceId: string): WorkspaceInformationState;
  write(workspaceId: string, information: WorkspaceInformationState, now: string): void;
  changed?(workspaceId: string, information: WorkspaceInformationState): void;
}

/** The same operation services as Local MCP, with persistence owned by the receipt transaction. */
async function prepare(action: TarsWorkspaceAction, before: WorkspaceInformationState) {
  let after = before;
  const service = createLocalMcpWorkspaceInformation({
    getWorkspaceInformation: async () => ({ workspaceId: action.workspaceId, workspaceInformation: before }),
    updateWorkspaceInformationState: async ({ updater }) => {
      after = updater(before);
      return { workspaceId: action.workspaceId, workspaceInformation: after };
    },
  });
  switch (action.operation) {
    case "appendNotes": await service.appendWorkspaceNotes(action); break;
    case "replaceNotes": await service.replaceWorkspaceNotes(action); break;
    case "addTodo": await service.addWorkspaceTodo(action); break;
    case "updateTodo": await service.updateWorkspaceTodo(action); break;
    case "removeTodo": await service.removeWorkspaceTodo(action); break;
    case "setField": await service.setWorkspaceCustomField(action); break;
    case "removeField": await service.removeWorkspaceCustomField(action); break;
    case "addResource": await service.addWorkspaceResource({ ...action, kind: action.resourceKind }); break;
    case "removeResource": await service.removeWorkspaceResource({ ...action, kind: action.resourceKind, itemId: action.resourceId }); break;
    default: action satisfies never;
  }
  return after;
}

export async function applyTarsWorkspace(ports: TarsDecisionPorts, message: TarsMessage, index: number,
  action: TarsWorkspaceAction, hold: { confirm: boolean; matches: TarsActionReceipt["matchedRules"] }, confirmed = false): Promise<TarsActionReceipt> {
  const ref = { messageId: message.id, actionIndex: index };
  const now = ports.now?.() ?? new Date().toISOString();
  const intent = ports.conversations.getReceipt(message.id, index)!;
  const reject = (error: unknown) => {
    if (isTarsStorageBusy(error)) throw error;
    // Another admission may have settled the same intent while the shared service awaited its result.
    const current = ports.conversations.getReceipt(message.id, index);
    if (current && current.status !== (confirmed ? "proposed" : "pending")) return current;
    const outcome = { error: (error instanceof Error ? error.message : "Workspace edit failed.").slice(0, 2_000).trim() || "Workspace edit failed." };
    return confirmed ? ports.conversations.rejectProposal(ref, outcome, now)
      : ports.conversations.settleReceipt(message.id, index, intent.revision, { status: "rejected", ...outcome }, now);
  };
  try {
    const scope = resolveTarsWorkspace(action.workspaceId, ports.readRegistry());
    const workspace = ports.workspace;
    if (!workspace) throw new Error("This host cannot edit workspace information.");
    const before = workspace.read(action.workspaceId);
    // Validate even held proposals before offering Confirm; all inputs are admitted again at confirmation.
    const after = await prepare(action, before);
    if (hold.confirm && !confirmed) return ports.conversations.settleReceipt(message.id, index, intent.revision,
      { status: "proposed", ...(hold.matches?.length ? { matchedRules: hold.matches } : {}) }, now);
    const registration = ports.readRegistry().flatMap(repository => repository.workspaces).find(item => item.id === action.workspaceId);
    const undo = TarsWorkspaceUndoSchema.parse({ kind: "workspace", workspaceName: registration?.name || action.workspaceId,
      repositoryPath: scope.repositoryPath, before: JSON.stringify(before), after: JSON.stringify(after) });
    const receipt = ports.conversations.applyWorkspaceReceipt(ref, () => {
      assertTarsSource(scope, ports.readRegistry());
      if (JSON.stringify(workspace.read(action.workspaceId)) !== undo.before) throw new Error("The workspace information changed. Ask Tars to try the edit again.");
      workspace.write(action.workspaceId, after, now);
      return undo;
    }, now);
    // The write is committed before publishing the update; notification failure never reclassifies an applied edit.
    try { workspace.changed?.(action.workspaceId, workspace.read(action.workspaceId)); } catch { /* Readers refresh on their next change. */ }
    return receipt;
  } catch (error) { return reject(error); }
}

export function restoreTarsWorkspace(action: TarsWorkspaceAction, undo: TarsActionUndo, ports: TarsWorkspacePorts,
  registry: ReturnType<TarsDecisionPorts["readRegistry"]>, now: string) {
  if (undo.kind !== "workspace") throw new TarsUndoActionRefused("unsupported");
  try { assertTarsSource({ workspaceId: action.workspaceId, repositoryPath: undo.repositoryPath }, registry); }
  catch { throw new TarsUndoActionRefused("outOfScope"); }
  if (JSON.stringify(ports.read(action.workspaceId)) !== undo.after) throw new TarsUndoActionRefused("stale");
  ports.write(action.workspaceId, JSON.parse(undo.before) as WorkspaceInformationState, now);
}
