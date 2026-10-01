import { ActionButton } from "@/components/system/ActionButton";
import { useAppStore } from "@/store/app.store";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { ChatMessage, Task } from "@/types/chat";

const child: DelegatedTaskSummary = { runId: "attention-run", stepId: "attention-step", parentTaskId: "preview-parent", delegationKey: "Implementation",
  delegatedTaskId: "attention-child", delegatedWorkspaceId: "attention-workspace", delegatedTurnId: "attention-turn", providerId: "codex",
  lifecycle: "one-turn", phase: "running", reason: null, attempt: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null };
// Shaped like a real delegated child: externally managed, with a parent link.
const task: Task = { id: child.delegatedTaskId, title: "Implementation", provider: "codex", updatedAt: new Date().toISOString(), unread: false,
  controlMode: "managed", controlOwner: "external", parentTaskId: child.parentTaskId };
// What the host attributes a child's request to: the root of its delegation chain.
const root = { parentTaskId: child.parentTaskId, ancestorTaskIds: [child.parentTaskId], rootTaskId: child.parentTaskId, rootWorkspaceId: "preview-workspace",
  rootWorkspaceName: "Preview", rootTaskTitle: "Preview", controlMode: "managed", controlOwner: "external" };
const requests = ["first", "second", "question"];
function message(request: string): ChatMessage {
  return { id: `message-${request}`, role: "assistant", providerId: "codex", model: "gpt-6.1-sol", content: "", parts: request === "question" ? [{
    type: "user_input", requestId: request, toolName: "request_user_input", state: "input-requested", questions: [{ question: "Which branch should receive the result?", header: "Branch", options: [{ label: "Current branch", description: "Keep this work together." }, { label: "Review branch", description: "Prepare a separate review." }] }],
  }] : [{ type: "approval", requestId: request, toolName: "Shell", description: `Run ${request} verification command`, state: "approval-requested" }] };
}
function notification(request: string): AppNotification {
  return { id: `notification-${request}`, kind: request === "question" ? "task.user_input_requested" : "task.approval_requested", title: "Preview",
    body: request === "question" ? "Choose the result branch" : `Run ${request} verification command`, repositoryPath: "/tmp/preview-project", repositoryName: "Preview",
    workspaceId: child.delegatedWorkspaceId, workspaceName: "Implementation", taskId: task.id, taskTitle: task.title, turnId: "attention-turn", providerId: "codex",
    action: request === "question" ? null : { type: "approval", requestId: request, messageId: `message-${request}` }, payload: { ...root, requestId: request, messageId: `message-${request}` },
    createdAt: new Date().toISOString(), readAt: null, resolvedAt: null };
}
/** Dev-only backend responses; the renderer's actual Fleet/store handlers remain in use. */
export function installChildAttentionFixture() {
  const api = window.api; if (!api) return;
  const oldRuns = api.runs; const oldMcp = api.localMcp;
  const responses: unknown[] = [];
  api.runs = { ...oldRuns, listDelegatedTasks: async ({ parentTaskId }) => parentTaskId === child.parentTaskId ? [child] : [] };
  api.localMcp = { ...oldMcp,
    respondApproval: async args => { responses.push({ kind: "approval", ...args }); document.body.dataset.attentionResponses = JSON.stringify(responses); return { ok: true, result: { ok: true, ...args } }; },
    respondUserInput: async args => { responses.push({ kind: "user-input", ...args }); document.body.dataset.attentionResponses = JSON.stringify(responses); return { ok: true, result: { ok: true, ...args } }; },
  };
  useAppStore.setState(state => ({
    workspaces: [...state.workspaces.filter(workspace => workspace.id !== child.delegatedWorkspaceId), { id: child.delegatedWorkspaceId, name: "Implementation", updatedAt: new Date().toISOString() }],
    notifications: requests.map(notification), taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [task.id]: child.delegatedWorkspaceId },
    workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [child.delegatedWorkspaceId]: { ...createEmptyWorkspaceState(), nativeSessionReadyByTask: {}, tasks: [task], activeTaskId: task.id,
      messagesByTask: { [task.id]: requests.map(message) }, activeTurnIdsByTask: { [task.id]: "attention-turn" } } },
  }));
  document.body.dataset.attentionResponses = "[]";
  return () => { api.runs = oldRuns; api.localMcp = oldMcp; };
}

export function ChildAttentionProbe() {
  const activeTaskId = useAppStore(state => state.activeTaskId);
  const activeWorkspaceId = useAppStore(state => state.activeWorkspaceId);
  const replace = (changeTurn: boolean) => useAppStore.setState(state => {
    const session = state.workspaceRuntimeCacheById[child.delegatedWorkspaceId]!;
    return { workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [child.delegatedWorkspaceId]: { ...session,
      activeTurnIdsByTask: { [task.id]: changeTurn ? "replacement-turn" : "attention-turn" },
      messagesByTask: { [task.id]: session.messagesByTask[task.id]!.map(item => item.id === "message-first" ? { ...item, id: "replacement-message" } : item) } } } };
  });
  return <aside aria-label="Attention fixture state"><output aria-label="Selected task">{activeTaskId}</output><output aria-label="Selected workspace">{activeWorkspaceId}</output>
    <ActionButton onClick={() => replace(false)}>Replace request message</ActionButton><ActionButton onClick={() => replace(true)}>Start another child turn</ActionButton></aside>;
}
