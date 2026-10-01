/**
 * Agent runs: an Agent-mode prompt runs on the mission engine instead of as a
 * single turn. The run is a mission with an implicit one-stage playbook built
 * from the task's agent; it completes only through the stage report, checks
 * in only when stuck, and ends when the user stops it or the task stops
 * running as the agent.
 *
 * The agent's instructions are not copied into the stage: the task's agent
 * assignment delivers them on every turn, and its turns resolve as the agent
 * (autonomous, guardrails on) at the host turn entry.
 *
 * Used by: `src/store/agent-run-send.ts` (start and send branching) and
 * `electron/host-service/supervision/mission-runtime.ts` (ending a run).
 *
 * Pure: no clock, no I/O. Callers pass `now`.
 */
import type { AgentConfig } from "@/lib/agents/schema";
import { PLAYBOOK_LIMITS, PLAYBOOK_VERSION, type Playbook } from "@/lib/playbooks/schema";
import { MISSION_LIMITS, type Mission, type MissionStartInput } from "./domain";

export const AGENT_RUN_PLAYBOOK_ID = "agent-run";
export const AGENT_RUN_STAGE_ID = "work";
export const AGENT_RUN_DEFAULT_DONE_WHEN = "The assignment is complete and verified.";

const AGENT_RUN_INSTRUCTION = [
  "Complete the assignment.",
  "Plan your steps first with your own plan or todo tools, and keep that plan current as you work.",
  "Do the work, then verify it: run the checks that prove it works and fix what they find.",
  "When it is done and verified, report the stage. If you cannot finish without the user, block the stage and say exactly what you need.",
].join(" ");

export function isAgentRun(mission: Pick<Mission, "origin"> | null | undefined): boolean {
  return mission?.origin === "agent";
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * The implicit playbook of an agent run: one AI stage, "Work". `doneWhen` is
 * the assignment's own criteria when the user gave any.
 */
export function buildAgentRunPlaybook(args: {
  agent: Pick<AgentConfig, "name">;
  doneWhen?: string | null;
  now: Date;
}): Playbook {
  const timestamp = args.now.toISOString();
  const doneWhen = args.doneWhen?.trim() ? clip(args.doneWhen, PLAYBOOK_LIMITS.doneWhen) : AGENT_RUN_DEFAULT_DONE_WHEN;
  return {
    version: PLAYBOOK_VERSION,
    id: AGENT_RUN_PLAYBOOK_ID,
    name: clip(args.agent.name, PLAYBOOK_LIMITS.name),
    purpose: clip(`Carry out the user's assignment as ${args.agent.name}.`, PLAYBOOK_LIMITS.purpose),
    checkIns: "when-stuck",
    // The agent may hand bounded parts to helpers; its own `canCall` decides which.
    team: "workers",
    stages: [
      {
        id: AGENT_RUN_STAGE_ID,
        title: "Work",
        kind: "ai",
        instruction: AGENT_RUN_INSTRUCTION,
        doneWhen,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * What starting an agent run asks the mission engine for. Consent is the
 * user's own settings (`manual`); the agent actor makes the turns autonomous
 * at the host turn entry. No external-effect stage exists, so none is
 * authorized, and the default turn cap applies.
 */
export function buildAgentRunStartInput(args: {
  workspaceId: string;
  taskId: string;
  agent: Pick<AgentConfig, "name">;
  assignment: string;
  doneWhen?: string | null;
  now: Date;
}): MissionStartInput {
  return {
    workspaceId: args.workspaceId,
    leadTaskId: args.taskId,
    playbook: buildAgentRunPlaybook({ agent: args.agent, doneWhen: args.doneWhen, now: args.now }),
    assignment: args.assignment.trim(),
    consent: { checkIns: "when-stuck", permissionMode: "manual", authorizedEffectStageIds: [] },
    origin: "agent",
  };
}

export type AgentPromptSendPlan =
  | { kind: "start-run" }
  | {
      kind: "plain-turn";
      reason: "chat" | "run-active" | "turn-active" | "not-a-prompt" | "attachments" | "too-long" | "provider";
    };

/**
 * Whether a composer send starts an agent run or stays a plain turn.
 *
 * - Chat (no agent): a plain turn, as always.
 * - Agent, a run already active: a plain user turn. It steers the run, which
 *   continues after it ("a user turn always wins").
 * - Agent, a turn running, a queued item, a utility send: the composer's own
 *   queue and steer paths stay in charge.
 * - Agent, otherwise: start a run with the prompt as the assignment.
 */
export function planAgentPromptSend(args: {
  taskRunsAsAgent: boolean;
  runActive: boolean;
  turnActive: boolean;
  queued: boolean;
  turnOrigin: "conversation" | "utility";
  providerId: string;
  prompt: string;
  hasAttachments: boolean;
}): AgentPromptSendPlan {
  if (!args.taskRunsAsAgent) return { kind: "plain-turn", reason: "chat" };
  if (args.runActive) return { kind: "plain-turn", reason: "run-active" };
  if (args.turnActive) return { kind: "plain-turn", reason: "turn-active" };
  if (args.queued || args.turnOrigin !== "conversation" || !args.prompt.trim()) {
    return { kind: "plain-turn", reason: "not-a-prompt" };
  }
  // Missions run on Claude and Codex tasks only.
  if (args.providerId !== "claude-code" && args.providerId !== "codex") {
    return { kind: "plain-turn", reason: "provider" };
  }
  // The assignment is text; images and attached files go with a plain turn.
  if (args.hasAttachments) return { kind: "plain-turn", reason: "attachments" };
  if (args.prompt.trim().length > MISSION_LIMITS.maxAssignmentChars) return { kind: "plain-turn", reason: "too-long" };
  return { kind: "start-run" };
}

/**
 * Why an active agent run ends without a report, or null when it goes on:
 * the task no longer runs as an agent (the selector moved to a model), or the
 * user stopped the run's own turn that just ended. A turn Stave interrupted by
 * quitting is not a stop; the run resumes after a restart. The composer
 * cancels the run itself before it stops one of the user's turns
 * (`src/store/agent-run-stop.ts`), so only the run's turns are read here.
 */
export function agentRunEndCause(args: {
  taskRunsAsAgent: boolean;
  lastEndedTurn: { startedBy: "mission" | "user"; interrupted?: boolean } | null;
  lastTurnEnding: "completed" | "stopped" | "failed" | null;
  turnActive: boolean;
}): "released" | "stopped" | null {
  if (!args.taskRunsAsAgent) return "released";
  const last = args.lastEndedTurn;
  if (args.turnActive || !last || last.startedBy !== "mission" || last.interrupted) return null;
  return args.lastTurnEnding === "stopped" ? "stopped" : null;
}
