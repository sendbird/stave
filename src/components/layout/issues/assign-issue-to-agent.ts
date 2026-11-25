import { buildTrackerIssueInstruction } from "@/lib/tracker-issues/context";
import type { TrackerIssue, TrackerIssueDetail } from "@/lib/tracker-issues/types";
import { useAgentsUiStore } from "@/store/agents-ui-store";

/**
 * Opens Kickoff with the issue as the work source, so the user chooses who
 * does the work. The issue's own assignee is untouched: the agent is shown on
 * the task it starts, not on the ticket.
 */
export function assignTrackerIssueToAgent(task: TrackerIssue, detail?: TrackerIssueDetail | null) {
  useAgentsUiStore.getState().openKickoffWithAgent({
    text: buildTrackerIssueInstruction(task, detail),
    source: task.key,
  });
}
