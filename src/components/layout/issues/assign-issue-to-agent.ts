import { buildTrackerIssueInstruction } from "@/lib/tracker-issues/context";
import type { TrackerIssue } from "@/lib/tracker-issues/types";
import { useAgentsUiStore } from "@/store/agents-ui-store";

/**
 * Opens Assign to agent with the issue as the request. The issue's own
 * assignee is untouched: the agent is shown on the task it starts, not on the
 * ticket.
 */
export function assignTrackerIssueToAgent(task: TrackerIssue) {
  useAgentsUiStore.getState().openAssignSheet({
    assignment: buildTrackerIssueInstruction(task),
    source: task.key,
  });
}
