import { webContents } from "electron";
import type { HostLocalMcpAction } from "../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";

export type {
  CreatedWorkspaceInfo,
  RegisteredProjectInfo,
  RegisteredWorkspaceInfo,
  TaskRunResult,
  TaskStatusResult,
  WorkspaceInformationMutationResult,
} from "../host-service/local-mcp-runtime";

let localMcpEventBridgeRegistered = false;

function ensureLocalMcpEventBridge() {
  if (localMcpEventBridgeRegistered) {
    return;
  }
  localMcpEventBridgeRegistered = true;
  onHostServiceEvent("local-mcp.workspace-information-updated", (payload) => {
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed()) {
        continue;
      }
      contents.send("local-mcp:workspace-information-updated", payload);
    }
  });
}

async function invokeLocalMcp<TResult>(
  action: HostLocalMcpAction,
  args: unknown,
) {
  ensureLocalMcpEventBridge();
  return invokeHostService("local-mcp.invoke", {
    action,
    args,
  }) as Promise<TResult>;
}

ensureLocalMcpEventBridge();

export async function getWorkspaceInformation(args: { workspaceId: string }) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("get-workspace-information", args);
}

export async function replaceWorkspaceNotes(args: {
  workspaceId: string;
  notes: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("replace-workspace-notes", args);
}

export async function appendWorkspaceNotes(args: {
  workspaceId: string;
  text: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("append-workspace-notes", args);
}

export async function clearWorkspaceNotes(args: { workspaceId: string }) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("clear-workspace-notes", args);
}

export async function addWorkspaceTodo(args: {
  workspaceId: string;
  text: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-todo", args);
}

export async function updateWorkspaceTodo(args: {
  workspaceId: string;
  todoId: string;
  text?: string;
  completed?: boolean;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("update-workspace-todo", args);
}

export async function removeWorkspaceTodo(args: {
  workspaceId: string;
  todoId: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("remove-workspace-todo", args);
}

export async function addWorkspaceResource(args: {
  workspaceId: string;
  kind: string;
  url: string;
  title?: string;
  issueKey?: string;
  status?: string;
  note?: string;
  nodeId?: string;
  channelName?: string;
  spaceKey?: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-resource", args);
}

export async function removeWorkspaceResource(args: {
  workspaceId: string;
  kind: string;
  itemId: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("remove-workspace-resource", args);
}

export async function addWorkspaceCustomField(args: {
  workspaceId: string;
  fieldType: string;
  label: string;
  value?: string | number | boolean | null;
  options?: string[];
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-custom-field", args);
}

export async function setWorkspaceCustomField(args: {
  workspaceId: string;
  fieldId: string;
  value?: string | number | boolean | null;
  label?: string;
  options?: string[];
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("set-workspace-custom-field", args);
}

export async function removeWorkspaceCustomField(args: {
  workspaceId: string;
  fieldId: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("remove-workspace-custom-field", args);
}

export async function addWorkspaceJiraIssue(args: {
  workspaceId: string;
  url: string;
  issueKey?: string;
  title?: string;
  status?: string;
  note?: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-jira-issue", args);
}

export async function addWorkspaceConfluencePage(args: {
  workspaceId: string;
  url: string;
  title?: string;
  spaceKey?: string;
  note?: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-confluence-page", args);
}

export async function addWorkspaceFigmaResource(args: {
  workspaceId: string;
  url: string;
  title?: string;
  nodeId?: string;
  note?: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-figma-resource", args);
}

export async function addWorkspaceSlackThread(args: {
  workspaceId: string;
  url: string;
  channelName?: string;
  note?: string;
}) {
  return invokeLocalMcp<{
    workspaceId: string;
    workspaceInformation: import("../../src/lib/workspace-information").WorkspaceInformationState;
  }>("add-workspace-slack-thread", args);
}

export async function registerProject(args: {
  projectPath: string;
  projectName?: string;
  defaultBranch?: string;
}) {
  return invokeLocalMcp<
    import("../host-service/local-mcp-runtime").RegisteredProjectInfo
  >("register-project", args);
}

export async function createWorkspace(args: {
  projectPath: string;
  name: string;
  mode: "branch" | "clean";
  fromBranch?: string;
  fromBranchKind?: "local" | "remote";
  initCommand?: string;
  useRootNodeModulesSymlink?: boolean;
}) {
  return invokeLocalMcp<
    import("../host-service/local-mcp-runtime").CreatedWorkspaceInfo
  >("create-workspace", args);
}

export async function runTask(args: {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  provider?: import("../../src/lib/providers/provider.types").ProviderId;
  runtimeOptions?: import("../../src/lib/providers/provider.types").ProviderRuntimeOptions;
}) {
  return invokeLocalMcp<
    import("../host-service/local-mcp-runtime").TaskRunResult
  >("run-task", args);
}

export async function getTaskStatus(args: {
  workspaceId: string;
  taskId: string;
}) {
  return invokeLocalMcp<
    import("../host-service/local-mcp-runtime").TaskStatusResult
  >("get-task-status", args);
}

export async function respondApproval(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  approved: boolean;
}) {
  return invokeLocalMcp<{
    ok: boolean;
    workspaceId: string;
    taskId: string;
    requestId: string;
    approved: boolean;
  }>("respond-approval", args);
}

export async function respondUserInput(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}) {
  return invokeLocalMcp<{
    ok: boolean;
    workspaceId: string;
    taskId: string;
    requestId: string;
    denied: boolean;
  }>("respond-user-input", args);
}

export async function listKnownProjects() {
  return invokeLocalMcp<
    import("../host-service/local-mcp-runtime").RegisteredProjectInfo[]
  >("list-known-projects", undefined);
}
