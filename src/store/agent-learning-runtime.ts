/**
 * Runs learned suggestions after a turn: when the completed turn belongs to a
 * task a custom agent runs, learning is on for that agent, and the user
 * corrected the agent in that task, one utility-lane turn asks whether the
 * agent's instructions should change. At most one call per task: a task that
 * was already asked (this session) or already has a suggestion is skipped.
 *
 * Only user and assistant prose from the task is sent; secrets are never in
 * that channel and the turn runs read-only without bound secrets.
 */
import {
  addAgentSuggestion,
  buildLearningPrompt,
  buildLearningTranscript,
  hasSuggestionForTask,
  hasUserCorrection,
  parseLearningAnswer,
} from "@/lib/agents/learned-suggestions";
import type { AgentConfig } from "@/lib/agents/schema";
import { useAgentAssignmentsStore } from "./agent-assignments-store";
import { useAppStore } from "./app.store";
import { getWorkspaceSessionForState } from "./workspace-runtime-state";
import { runUtilityTextTurn } from "./utility-text-turn";

const askedTaskIds = new Set<string>();

function findCustomAgent(agents: readonly AgentConfig[], id: string): AgentConfig | undefined {
  return agents.find((agent) => agent.id === id);
}

export async function learnFromAgentTask(args: { workspaceId: string; taskId: string }): Promise<void> {
  if (askedTaskIds.has(args.taskId)) return;
  const assignments = useAgentAssignmentsStore.getState();
  if (!assignments.loaded) await assignments.load();
  const taskAgent = useAgentAssignmentsStore.getState().byTaskId[args.taskId];
  if (!taskAgent) return;
  const state = useAppStore.getState();
  const agent = findCustomAgent(state.settings.customAgents, taskAgent.agentConfigId);
  if (!agent || agent.source !== "custom" || agent.archived) return;
  if (state.settings.agentLearningDisabled.includes(agent.id)) return;
  if (hasSuggestionForTask(state.settings.agentSuggestions, agent.id, args.taskId)) return;
  const session = getWorkspaceSessionForState({ state, workspaceId: args.workspaceId });
  const messages = session?.messagesByTask[args.taskId] ?? state.messagesByTask[args.taskId] ?? [];
  if (!hasUserCorrection(messages)) return;

  askedTaskIds.add(args.taskId);
  const result = await runUtilityTextTurn({
    prompt: buildLearningPrompt({ agent, transcript: buildLearningTranscript(messages) }),
    turnIdPrefix: "agent-learning",
  });
  if (!result.ok) return;
  const parsed = parseLearningAnswer(result.text, agent.instructions);
  if (!parsed.ok || !parsed.suggestion) return;

  // Re-read: the agent may have been edited or deleted while the model answered.
  const latest = useAppStore.getState();
  const current = findCustomAgent(latest.settings.customAgents, agent.id);
  if (!current || current.instructions !== agent.instructions) return;
  latest.updateSettings({
    patch: {
      agentSuggestions: addAgentSuggestion(latest.settings.agentSuggestions, {
        id: `${agent.id}:${args.taskId}`,
        agentConfigId: agent.id,
        taskId: args.taskId,
        createdAt: new Date().toISOString(),
        summary: parsed.suggestion.summary,
        instructions: parsed.suggestion.instructions,
        basedOn: agent.instructions,
      }),
    },
  });
}

/** Fire-and-forget entry used by the turn-completed path. */
export function learnFromAgentTaskInBackground(args: { workspaceId: string; taskId: string }): void {
  void learnFromAgentTask(args).catch(() => undefined);
}
