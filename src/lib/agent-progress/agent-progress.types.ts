import type { WorkState } from "@/components/aui/components/state-vocabulary";
import type { DelegationSpend } from "@/lib/delegation/exchange";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Where an agent's progress comes from. Every agent surface reads one shape,
 * so a subagent, a delegated task or a review opens the same detail view.
 */
export type AgentProgressSource =
  /** A provider subagent started inside a turn (Claude or Codex). */
  | "subagent"
  /** A durable Stave task another task delegated. */
  | "delegated-task"
  /** A read-only review task the composer started. */
  | "review"
  | "compare-candidate"
  | "agent-run-stage"
  | "tars"
  /** A session another app on this machine is running (read only). */
  | "external-session"
  | "external-subagent";

/** What one step of an agent's work is. */
export type AgentStepKind =
  /** Something a person sent: a follow-up or steering message. */
  | "user"
  /** What the agent said between steps. */
  | "text"
  | "tool"
  | "thinking"
  /** A message between agents (a reply, a hand-off). */
  | "message"
  /** A notice: an approval, a question, a system event, reported progress. */
  | "note"
  /** Another agent this one started; opens in place. */
  | "subagent";

/** `running` and `error` steps stay visible even when their group is folded. */
export type AgentStepStatus = "running" | "done" | "error";

/**
 * Where a step's full input and output come from. Rows are folded by default
 * and only an opened row renders its detail, bounded by `boundStepDetail`.
 */
export interface InlineStepDetail {
  source: "inline";
  input?: string;
  output?: string;
  /** The source already cut the payload short. */
  truncated?: boolean;
}

export type StepDetailRef = InlineStepDetail;

/** The agent a `subagent` step opens, as the panel addresses it. */
export type AgentChildRef =
  | {
      kind: "subagent";
      /** The task whose conversation holds the spawning call. */
      taskId?: string;
      workspaceId?: string;
      toolUseId?: string;
      agentId?: string;
      providerId?: ProviderId;
      title: string;
    }
  | {
      kind: "delegated-task";
      delegatedTaskId: string;
      delegatedWorkspaceId?: string;
      delegationKey?: string;
      title: string;
    };

export interface AgentStep {
  id: string;
  kind: AgentStepKind;
  /** Present tense while it runs: "Reading src/x.ts". */
  doing: string;
  /** Past tense once it settled: "Read src/x.ts". */
  done: string;
  status: AgentStepStatus;
  /** Epoch ms; steps sort by it and never move once placed. */
  startedAt?: number;
  /** Measured only; a step without a measurement shows no duration. */
  durationMs?: number;
  /** The provider's tool name, for the row's glyph. Never shown as text. */
  toolName?: string;
  /** The words of a `text`, `user`, `message`, `thinking` or `note` step. */
  text?: string;
  /** Stable id of the agent a `subagent` step opens. */
  childId?: string;
  child?: AgentChildRef;
  detail?: StepDetailRef;
}

export interface AgentProgressFacts {
  providerId?: ProviderId;
  model?: string;
  effort?: string;
  /** Epoch ms. */
  startedAt?: number;
  /** Epoch ms; once set the elapsed time stops. */
  endedAt?: number;
  /** A duration the provider measured, used when the timestamps are stand-ins. */
  elapsedMs?: number;
  steps: number;
  contextTokens?: number;
  spend?: DelegationSpend;
}

/** Where the agent was started from, so the panel can lead back to it. */
export interface AgentProgressParent {
  label: string;
  taskId?: string;
  workspaceId?: string;
  /** The call that started the agent, for revealing it in the conversation. */
  toolUseId?: string;
}

export interface AgentProgress {
  id: string;
  source: AgentProgressSource;
  /** What the agent was asked to do, or its name. */
  title: string;
  /** Explore, Reviewer, Subagent, Codex… */
  kindLabel?: string;
  parent?: AgentProgressParent;
  state: WorkState;
  facts: AgentProgressFacts;
  /** The step it is on while it runs. */
  now?: AgentStep;
  /** The full instruction it was given. */
  ask?: string;
  /** Its final answer. */
  result?: string;
  /** Why it ended without an answer. */
  error?: string;
  steps: readonly AgentStep[];
  /** Nothing here can be stopped or messaged (another app's session). */
  readOnly: boolean;
}
