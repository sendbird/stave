import type { CanonicalConversationRequest, ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";
import type { UserInputQuestion } from "../../src/types/chat";
import type {
  ConnectedToolStatusRequest,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";

export type ProviderId = "claude-code" | "codex" | "stave";

export interface ProviderSlashCommand {
  name: string;
  command: string;
  description: string;
  argumentHint?: string;
}

export interface ProviderCommandCatalogResult {
  ok: boolean;
  supported: boolean;
  commands: ProviderSlashCommand[];
  detail: string;
}

export interface StreamTurnArgs {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

/**
 * Result returned by the provider-runtime approval/user-input responders.
 *
 * We used to return a plain `boolean`, but that made it impossible for the
 * caller to tell the user *why* delivery failed — which matters when the
 * approve/revise buttons on the plan viewer hang waiting for a responder that
 * never fires. Returning `pendingRequestIds` on failure lets `runtime.ts`
 * include that snapshot in the IPC response and in the bridge warning event
 * surfaced to the renderer, so stale request IDs become diagnosable instead
 * of triggering a silent UI lock.
 */
export type ProviderResponderResult =
  | { ok: true }
  | { ok: false; reason: "unknown-request"; pendingRequestIds: string[] };

export type BridgeEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string; segmentId?: string }
  | { type: "provider_session"; providerId: ProviderId; nativeSessionId: string }
  | {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
    ttftMs?: number;
  }
  | { type: "prompt_suggestions"; suggestions: string[] }
  | { type: "tool"; toolUseId?: string; toolName: string; input: string; output?: string; state: "input-streaming" | "input-available" | "output-available" | "output-error" }
  | { type: "tool_result"; tool_use_id: string; output: string; isError?: boolean; isPartial?: boolean }
  | { type: "diff"; filePath: string; oldContent: string; newContent: string; status?: "pending" | "accepted" | "rejected" }
  | { type: "approval"; toolName: string; requestId: string; description: string }
  | {
    type: "user_input";
    toolName: string;
    requestId: string;
    questions: UserInputQuestion[];
  }
  | { type: "tool_progress"; toolUseId: string; toolName: string; elapsedSeconds: number }
  | { type: "plan_ready"; planText: string; sourceSegmentId?: string }
  | {
    type: "system";
    content: string;
    compactBoundary?: {
      trigger?: string;
      gitRef?: string;
    };
  }
  | { type: "subagent_progress"; toolUseId?: string; content: string }
  | { type: "model_resolved"; resolvedProviderId: "claude-code" | "codex"; resolvedModel: string }
  | {
    type: "stave:execution_processing";
    strategy: "direct" | "orchestrate";
    model?: string;
    supervisorModel?: string;
    reason: string;
    fastModeRequested?: boolean;
    fastModeApplied?: boolean;
  }
  | { type: "stave:orchestration_processing"; supervisorModel: string; subtasks: Array<{ id: string; title: string; model: string; dependsOn: string[] }> }
  | { type: "stave:subtask_started"; subtaskId: string; index: number; total: number; title: string; model: string }
  | { type: "stave:subtask_done"; subtaskId: string; success: boolean }
  | { type: "stave:synthesis_started" }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done"; stop_reason?: string };

export interface ProviderRuntime {
  streamTurn: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
  startTurnStream: (
    args: StreamTurnArgs,
    options?: {
      onEvent?: (event: BridgeEvent) => void;
      onDone?: () => void;
      bufferEvents?: boolean;
    }
  ) => { ok: boolean; streamId: string };
  readTurnStream: (args: { streamId: string; cursor: number }) => {
    ok: boolean;
    events: BridgeEvent[];
    cursor: number;
    done: boolean;
    message?: string;
  };
  ackTurnStream: (args: { streamId: string; cursor: number }) => {
    ok: boolean;
    message?: string;
  };
  abortTurn: (args: { turnId: string }) => { ok: boolean; message: string };
  cleanupTask: (args: { taskId: string }) => { ok: boolean; message: string };
  respondApproval: (args: { turnId: string; requestId: string; approved: boolean }) => { ok: boolean; message: string };
  respondUserInput: (args: {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => { ok: boolean; message: string };
  checkAvailability: (args: { providerId: ProviderId; runtimeOptions?: StreamTurnArgs["runtimeOptions"] }) => Promise<{
    ok: boolean;
    available: boolean;
    detail: string;
  }>;
  getCommandCatalog: (args: {
    providerId: ProviderId;
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }) => Promise<ProviderCommandCatalogResult>;
  getConnectedToolStatus: (args: ConnectedToolStatusRequest) => Promise<ConnectedToolStatusResponse>;
  shutdown: () => Promise<void>;
}
