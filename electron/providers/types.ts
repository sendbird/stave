import type {
  AdvisorActivityPhase,
  AdvisorEffort,
  AdvisorIsolationMode,
  CanonicalConversationRequest,
  ProviderAvailabilityResponse,
  ProviderGoalSnapshot,
  ProviderRuntimeOptions,
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
} from "../../src/lib/providers/provider.types";
import type { AdvisorConsultOutcome } from "./advisor-consult";
import type { UserInputQuestion } from "../../src/types/chat";
import type { WorkerExecutionMetadata } from "../../src/lib/providers/worker-mode";
import type {
  ConnectedToolStatusRequest,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";

export type ProviderId = "claude-code" | "codex";

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
  executionPolicy?: "secondary-read-only";
  /**
   * Host-owned capability for one unattended routine turn. This is never part
   * of the renderer IPC schema or persisted runtime options.
   */
  unattendedAutomation?: {
    authorizationToken: string;
  };
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
  | { ok: false; reason: "unknown-request"; pendingRequestIds: string[] }
  | { ok: false; reason: "turn-not-steerable"; pendingRequestIds: string[] };

export type ProviderSteerResponder = (args: {
  text: string;
  clientMessageId?: string;
}) => Promise<ProviderResponderResult>;

export type BridgeEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string; segmentId?: string }
  | {
      type: "provider_session";
      providerId: ProviderId;
      nativeSessionId: string;
    }
  | {
      type: "provider_turn";
      providerId: ProviderId;
      nativeSessionId: string;
      nativeTurnId: string;
    }
  | {
      type: "browser_connection";
      providerId: ProviderId;
      status: "connecting" | "connected" | "failed";
      at: number;
    }
  | {
      type: "goal_status";
      providerId: "codex";
      goal: ProviderGoalSnapshot | null;
    }
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
  | {
      /** Structured advisor lifecycle signal. Mirrors `NormalizedProviderEvent`. */
      type: "advisor_activity";
      phase: AdvisorActivityPhase;
      /** Identity of one consult; absent on the turn-level `armed` event. */
      exchangeId?: string;
      /** 1-based index of this consult within the turn. */
      consultIndex?: number;
      /** Per-turn consult budget the primary was granted. */
      consultLimit?: number;
      /** Question the primary asked, bounded by the runtime. */
      question?: string;
      primaryProviderId: ProviderId;
      /** Primary model id, so "a different model answered" is verifiable. */
      primaryModel?: string;
      advisorProviderId?: ProviderId;
      advisorModel?: string;
      /** Tier the call carries, after defaulting and clamping. */
      advisorEffort?: AdvisorEffort;
      isolation?: AdvisorIsolationMode;
      at: number;
      timeoutMs?: number;
      durationMs?: number;
      advice?: string;
      adviceChars?: number;
      injectedChars?: number;
      injectedPartIndex?: number;
      detail?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalCostUsd?: number;
    }
  | {
      type: "history_boundary";
      providerId: ProviderId;
      boundaryKind: "thread" | "turn" | "message";
      nativeId: string;
      targetRole: "user" | "assistant";
    }
  | {
      type: "permission_denial";
      toolName: string;
      message: string;
      reasonType?: string;
      reason?: string;
    }
  | {
      type: "hook_activity";
      hookId: string;
      hookName: string;
      hookEvent: string;
      status: "running" | "completed" | "failed" | "cancelled" | "blocked";
    }
  | {
      type: "tool";
      toolUseId?: string;
      toolName: string;
      input: string;
      output?: string;
      state:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error";
      workerExecution?: WorkerExecutionMetadata;
      /**
       * Provider-owned identity of the agent this event is *about* — the agent
       * a delegating call spawned (Codex's child `agentThreadId`). The work
       * graph keys nodes off this rather than off `toolUseId`, because a
       * tool-use id names one call while an agent id names the worker that
       * outlives it.
       *
       * Distinct from `ownerAgentId`, and the two must never be merged: this
       * one points *down* to a spawned worker, that one points *up* to the
       * worker we are already inside. Collapsing them inverts an edge.
       */
      agentId?: string;
      /**
       * Provider-owned identity of the agent that *emitted* this event, when
       * the activity happened inside a subagent rather than the main loop
       * (Claude's hook `agent_id`). Absent means the main loop.
       */
      ownerAgentId?: string;
      /**
       * The tool call this one ran *inside*, when the provider reports nesting
       * (Claude's `parent_tool_use_id`). Absent means top level; it never means
       * "unknown parent" — the graph leaves such nodes attached to the turn.
       */
      parentToolUseId?: string;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      output: string;
      isError?: boolean;
      isPartial?: boolean;
    }
  | {
      type: "diff";
      filePath: string;
      oldContent: string;
      newContent: string;
      status?: "pending" | "accepted" | "rejected";
    }
  | {
      type: "approval";
      toolName: string;
      requestId: string;
      description: string;
      input?: string;
      /**
       * See `tool.ownerAgentId`: the subagent whose work is stopped until this
       * is answered. Absent means the main loop asked.
       */
      ownerAgentId?: string;
    }
  | {
      type: "user_input";
      toolName: string;
      requestId: string;
      questions: UserInputQuestion[];
      /** See `approval.ownerAgentId`. */
      ownerAgentId?: string;
    }
  | {
      type: "tool_progress";
      toolUseId: string;
      toolName: string;
      elapsedSeconds: number;
    }
  | { type: "plan_ready"; planText: string; sourceSegmentId?: string }
  | {
      type: "system";
      content: string;
      compactBoundary?: {
        trigger?: string;
        gitRef?: string;
      };
    }
  | {
      type: "subagent_progress";
      toolUseId?: string;
      content: string;
      /** See `tool.agentId`: the subagent this progress is reporting on. */
      agentId?: string;
      /** See `tool.ownerAgentId`: the subagent that emitted this progress. */
      ownerAgentId?: string;
      /**
       * How confidently `toolUseId` was correlated to this progress. Absent
       * means `authoritative`. A `guess` (Claude's positional fallback) may
       * route the text to a row, but the work graph must never create or
       * overwrite a spawn↔identity binding from it — a laundered guess
       * permanently cross-wires two concurrent workers.
       */
      binding?: "authoritative" | "guess";
    }
  | {
      type: "model_resolved";
      resolvedProviderId: "claude-code" | "codex";
      resolvedModel: string;
    }
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
    },
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
  /**
   * Cancels only the Advisor preflight for a turn. The primary turn continues
   * with an `advisor_activity` `skipped` phase, so a slow advisor never forces
   * the user to abort work they still want.
   */
  skipAdvisor: (args: { turnId: string }) => { ok: boolean; message: string };
  /**
   * Runs one on-demand Advisor consult against a turn-scoped grant.
   *
   * Exposed on the runtime because the grant registry is process-local: grants
   * are minted here, in the host-service child, while the
   * `stave_consult_advisor` Local MCP tool is served from the Electron main
   * process. Main must cross the boundary rather than consult a registry that
   * is, in its own process, permanently empty.
   */
  consultAdvisor: (args: {
    consultKey: string;
    question: string;
    context?: string;
  }) => Promise<AdvisorConsultOutcome>;
  cleanupTask: (args: { taskId: string }) => { ok: boolean; message: string };
  respondApproval: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  respondUserInput: (args: {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  steerTurn: (
    args: ProviderSteerTurnRequest,
  ) => Promise<ProviderSteerTurnResponse>;
  checkAvailability: (args: {
    providerId: ProviderId;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }) => Promise<ProviderAvailabilityResponse>;
  getCommandCatalog: (args: {
    providerId: ProviderId;
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  }) => Promise<ProviderCommandCatalogResult>;
  getConnectedToolStatus: (
    args: ConnectedToolStatusRequest,
  ) => Promise<ConnectedToolStatusResponse>;
  shutdown: () => Promise<void>;
}
