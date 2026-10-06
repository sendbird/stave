import { i18n } from "@/i18n/runtime";
import type { RecordTaskAgentInput } from "@/lib/agents/assign";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";

/** Record and apply the acknowledged agent before Kickoff dispatches its prompt. */
export async function recordKickoffTaskAgent(input: RecordTaskAgentInput) {
  const api = typeof window === "undefined" ? null : window.api?.agents;
  if (!api?.recordTask) throw new Error(i18n.t("kickoff:whoPicker.recordUnavailable"));
  const outcome = await api.recordTask(input);
  if (!outcome.ok) throw new Error(outcome.message);
  // A list refresh can fail or omit a newly recorded task. The successful
  // record response is enough to make this send an agent send immediately.
  useAgentAssignmentsStore.getState().apply(outcome.value);
}
