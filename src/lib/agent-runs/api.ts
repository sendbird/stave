/**
 * The agent run contract between the renderer, the main process and the host
 * service: command arguments, results and the change event.
 *
 * Used by:
 * - `electron/main/ipc/agent-run-schemas.ts` (validates these shapes)
 * - `electron/preload.ts` and `src/types/window-api.d.ts` (`window.api.agentRuns`)
 * - `electron/host-service/supervision/agent-run-runtime.ts` (produces them)
 */
import type {
  AgentRun,
  AgentRunCommandErrorCode,
  AgentRunEvent,
  AgentRunStageRecord,
  AgentRunStartInput,
  AgentRunState,
} from "./domain";
import type { AgentRunReport } from "./report";
import type { AgentRunUsage } from "./usage";
import type { AgentRunRouteObservation } from "./route-observation";
import type { AgentRunInsights } from "./insights";

/** IPC channels behind `window.api.agentRuns`, keyed by bridge method. */
export const AGENT_RUN_IPC = Object.freeze({
  start: "agent-runs:start",
  list: "agent-runs:list",
  insights: "agent-runs:insights",
  get: "agent-runs:get",
  signOff: "agent-runs:sign-off",
  requestChanges: "agent-runs:request-changes",
  reply: "agent-runs:reply",
  skipStage: "agent-runs:skip-stage",
  retryStage: "agent-runs:retry-stage",
  pause: "agent-runs:pause",
  resume: "agent-runs:resume",
  takeOver: "agent-runs:take-over",
  acceptRuntime: "agent-runs:accept-runtime",
  noteUserTurn: "agent-runs:note-user-turn",
  cancel: "agent-runs:cancel",
  addReportToPullRequest: "agent-runs:add-report-to-pr",
  shareReport: "agent-runs:share-report",
  /** Main → renderer: an `AgentRunChangedEvent`. */
  changed: "agent-runs:changed",
});

/**
 * The stage attempt a control was rendered against. A stage command aimed at
 * an attempt the agent run has moved past is refused with `stale-identity`.
 */
export interface AgentRunStageRef {
  agentRunId: string;
  stageId: string;
  attempt: number;
}

export interface AgentRunIdArgs {
  agentRunId: string;
}

export interface AgentRunListArgs {
  /** Omit to list the newest agent runs across every workspace. */
  workspaceId?: string;
  limit?: number;
  /** Include all active runs independently of the history limit. */
  includeActive?: boolean;
}

export interface AgentRunRequestChangesArgs extends AgentRunStageRef {
  feedback: string;
}
/** Bounded user guidance delivered by the existing delegated supervisor. */
export type AgentRunReplyArgs = AgentRunRequestChangesArgs;

/** The composer choice when the user sends a message during an agent run. */
export const AGENT_RUN_USER_TURN_INTENTS = ["continue", "take-over"] as const;
export type AgentRunUserTurnIntent = (typeof AGENT_RUN_USER_TURN_INTENTS)[number];

export interface AgentRunNoteUserTurnArgs extends AgentRunIdArgs {
  intent: AgentRunUserTurnIntent;
}

export type AgentRunStartArgs = AgentRunStartInput;

/** An agent run with its stage attempts, recent events and, once ended, its report. */
export interface AgentRunDetail {
  agentRun: AgentRun;
  stages: AgentRunStageRecord[];
  /** The newest events, oldest first. */
  events: AgentRunEvent[];
  /** Present on `get` once the agent run has ended; null otherwise. */
  report: AgentRunReport | null;
  /** What the agent run's turns spent so far, when the host reads usage. */
  usage?: AgentRunUsage;
  /** Read-only route/outcome evidence. Older hosts omit this projection. */
  routing?: AgentRunRouteObservation[];
  /** Frozen policy and shared supervised-turn capacity, never a money guarantee. */
  resources?: import("./resources").AgentResourceSnapshot;
}

/** Why an agent run command failed; `failed` is anything unexpected. */
export type AgentRunFailureCode = AgentRunCommandErrorCode | "invalid-args" | "failed";

/** What the host returns for every agent run action. */
export type AgentRunInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AgentRunFailureCode; message: string };

export interface AgentRunCommandResponse {
  ok: boolean;
  agentRun: AgentRunDetail | null;
  code?: AgentRunFailureCode;
  message?: string;
}

export interface AgentRunReportPublishResponse {
  ok: boolean;
  prUrl?: string;
  code?: AgentRunFailureCode;
  message?: string;
}

export interface AgentRunShareReportResponse {
  ok: boolean;
  code?: AgentRunFailureCode;
  message?: string;
}

export interface AgentRunInsightsResponse {
  ok: boolean;
  insights: AgentRunInsights | null;
  message?: string;
}

export interface AgentRunListResponse {
  ok: boolean;
  agentRuns: AgentRun[];
  code?: AgentRunFailureCode;
  message?: string;
}

/** Sent whenever an agent run's state, stage or records change. */
export interface AgentRunChangedEvent {
  agentRunId: string;
  workspaceId: string;
  leadTaskId: string;
  state: AgentRunState;
  currentStageIndex: number;
  updatedAt: string;
}

/** `window.api.agentRuns`. */
export interface AgentRunsBridgeApi {
  start: (args: AgentRunStartArgs) => Promise<AgentRunCommandResponse>;
  list: (args?: AgentRunListArgs) => Promise<AgentRunListResponse>;
  /** How agent runs that ended in the last `days` went, per workflow and provider. */
  insights: (args?: { days?: number }) => Promise<AgentRunInsightsResponse>;
  get: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  signOff: (args: AgentRunStageRef) => Promise<AgentRunCommandResponse>;
  requestChanges: (args: AgentRunRequestChangesArgs) => Promise<AgentRunCommandResponse>;
  reply: (args: AgentRunReplyArgs) => Promise<AgentRunCommandResponse>;
  skipStage: (args: AgentRunStageRef) => Promise<AgentRunCommandResponse>;
  retryStage: (args: AgentRunStageRef) => Promise<AgentRunCommandResponse>;
  pause: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  resume: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  takeOver: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  acceptRuntime: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  noteUserTurn: (args: AgentRunNoteUserTurnArgs) => Promise<AgentRunCommandResponse>;
  cancel: (args: AgentRunIdArgs) => Promise<AgentRunCommandResponse>;
  /** Adds the ended agent run's report to its pull request, on request. */
  addReportToPullRequest: (args: AgentRunIdArgs) => Promise<AgentRunReportPublishResponse>;
  /** Posts the ended agent run's report to a Slack thread, through a turn on its lead task. */
  shareReport: (args: { agentRunId: string; threadUrl: string }) => Promise<AgentRunShareReportResponse>;
  subscribeChanged: (listener: (event: AgentRunChangedEvent) => void) => () => void;
}
