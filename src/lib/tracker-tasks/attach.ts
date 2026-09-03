import { extractJiraIssueUrlReference } from "@/lib/crane-connector/jira-reference";
import {
  upsertWorkspaceResourceInState,
  type WorkspaceInformationState,
  type WorkspaceResourceInput,
} from "@/lib/workspace-information";
import type { TrackerTask } from "./types";

/**
 * Registering a tracker ticket in the Information panel.
 *
 * Kept pure and store-free so the interesting part — which sections a ticket
 * lands in, and why attaching twice changes nothing — is testable without a
 * renderer. A caller applies the returned state.
 */

/** `TrackerTaskLinkSchema.rel` value that declares the mirrored Jira issue. */
const JIRA_LINK_REL = "jira";

export interface TrackerTaskWorkspaceInformationEntry {
  section: "crane" | "jira";
  issueKey: string;
  url: string;
  /** True when the entry already existed and was merged rather than appended. */
  deduplicated: boolean;
}

export interface TrackerTaskWorkspaceInformationUpdate {
  /** The `current` reference itself when nothing changed, so callers can skip the write. */
  information: WorkspaceInformationState;
  changed: boolean;
  entries: TrackerTaskWorkspaceInformationEntry[];
}

/**
 * The Jira issue a ticket mirrors, if it declares one.
 *
 * Only the structured link is read: the connector that produced the row already
 * decided whether a mirror exists, and re-deriving one from body text here
 * would disagree with it. A link whose URL is not on a Jira host degrades to
 * key-only rather than filing a foreign address in the Jira section.
 */
function resolveDeclaredJiraLink(
  task: TrackerTask,
): { issueKey: string; url: string; title: string } | null {
  for (const link of task.links) {
    if (link.rel.trim().toLowerCase() !== JIRA_LINK_REL) {
      continue;
    }
    const fromUrl = extractJiraIssueUrlReference(link.url);
    const issueKey = link.key?.trim().toUpperCase() || fromUrl?.key || "";
    if (!issueKey) {
      continue;
    }
    return {
      issueKey,
      url: fromUrl?.url ?? "",
      title: link.title?.trim() || task.title.trim(),
    };
  }
  return null;
}

function buildResourceInputs(task: TrackerTask): WorkspaceResourceInput[] {
  const inputs: WorkspaceResourceInput[] = [];
  const status = task.status.raw.trim();

  // The ticket itself goes to the section of the tracker it came from. Crane
  // and Jira keys share a shape, so the source is the only reliable signal.
  inputs.push({
    kind: task.source === "crane" ? "crane" : "jira",
    url: task.url,
    issueKey: task.key.trim(),
    title: task.title.trim(),
    status,
  });

  // A Crane ticket that mirrors a Jira issue belongs in both sections: the
  // Crane row is where the work is tracked, the Jira row is what the rest of
  // the company refers to.
  const jiraLink = resolveDeclaredJiraLink(task);
  if (jiraLink) {
    inputs.push({
      kind: "jira",
      url: jiraLink.url,
      issueKey: jiraLink.issueKey,
      title: jiraLink.title,
    });
  }

  return inputs;
}

/**
 * Build the Information panel state that has `task` registered on it.
 *
 * Idempotent by canonical URL and issue key, matching the registration tools:
 * attaching the same ticket again returns `current` untouched with
 * `changed: false`.
 */
export function buildTrackerTaskWorkspaceInformationUpdate(args: {
  current: WorkspaceInformationState;
  task: TrackerTask;
}): TrackerTaskWorkspaceInformationUpdate {
  let information = args.current;
  const entries: TrackerTaskWorkspaceInformationEntry[] = [];

  for (const input of buildResourceInputs(args.task)) {
    const result = upsertWorkspaceResourceInState({
      current: information,
      input,
    });
    information = result.state;
    entries.push({
      section: input.kind === "crane" ? "crane" : "jira",
      issueKey: input.issueKey ?? "",
      url: input.url,
      deduplicated: result.deduplicated,
    });
  }

  return {
    information,
    changed: information !== args.current,
    entries,
  };
}
