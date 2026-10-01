/**
 * What the Start mission sheet checks before Start is enabled. Each check says
 * what it found and, when it blocks, how to fix it. Pure: the sheet gathers
 * the facts and renders the result.
 */
import type { LocalMcpReadiness } from "@/lib/local-mcp-readiness";
import { playbookNeedsExistingPullRequest, type Playbook } from "@/lib/playbooks/schema";

export type PreStartCheckId = "task" | "reporting" | "github" | "pull-request" | "workspace" | "mission";
export type PreStartCheckState = "pass" | "warn" | "fail" | "pending";

export interface PreStartCheck {
  id: PreStartCheckId;
  label: string;
  state: PreStartCheckState;
  detail: string;
  /** A failing or pending blocking check disables Start. */
  blocking: boolean;
  /** A warning the user must acknowledge before Start. */
  needsAcknowledgement?: boolean;
  /** The acknowledgement's checkbox label, shown whether or not it is checked. */
  acknowledgeLabel?: string;
}

/** What the GitHub CLI told us, read from the branch's pull request status. */
export type GitHubReading =
  | { state: "pending" }
  | { state: "authenticated"; pullRequest: { number: number; url: string; isDraft: boolean } | null }
  | { state: "unauthenticated"; detail: string }
  | { state: "unknown"; detail: string };

/** Classifies `sourceControl.getPrStatus` into what the checks need. */
export function readGitHubStatus(result: {
  ok: boolean;
  pr: { number: number; url: string; isDraft?: boolean; state?: string } | null;
  stderr?: string;
} | null): GitHubReading {
  if (!result) return { state: "unknown", detail: "The GitHub CLI status could not be read." };
  if (result.ok) {
    const pr = result.pr && (result.pr.state ?? "OPEN").toUpperCase() === "OPEN" ? result.pr : null;
    return {
      state: "authenticated",
      pullRequest: pr ? { number: pr.number, url: pr.url, isDraft: Boolean(pr.isDraft) } : null,
    };
  }
  const stderr = result.stderr?.trim() ?? "";
  if (/not authenticated|auth login/i.test(stderr)) {
    return { state: "unauthenticated", detail: "Run `gh auth login` in a terminal, then check again." };
  }
  if (/no pull requests? found|no open pull requests?/i.test(stderr)) {
    return { state: "authenticated", pullRequest: null };
  }
  return { state: "unknown", detail: stderr || "The GitHub CLI did not answer." };
}

/** What the working tree read found: its uncommitted files, or why it could not be read. */
export type WorkingTreeReading =
  | { dirtyFileCount: number | null; error: null }
  | { dirtyFileCount: null; error: string };

export const WORKING_TREE_PENDING: WorkingTreeReading = { dirtyFileCount: null, error: null };

/** Classifies `sourceControl.getStatus`. A failed read is never taken for a clean tree. */
export function readWorkingTreeStatus(
  result: { ok: boolean; items: readonly unknown[]; stderr?: string } | null,
): WorkingTreeReading {
  if (result?.ok) return { dirtyFileCount: result.items.length, error: null };
  return { dirtyFileCount: null, error: result?.stderr?.trim() || "Stave could not read the working tree." };
}

export interface PreStartFacts {
  playbook: Pick<Playbook, "stages">;
  providerSupported: boolean;
  reporting: LocalMcpReadiness;
  github: GitHubReading;
  /** Uncommitted files in the workspace, or null while loading or unreadable. */
  dirtyFileCount: number | null;
  /** Why the working tree could not be read, when it could not. */
  workingTreeError?: string | null;
  dirtyAcknowledged: boolean;
  activeMission: boolean;
}

function usesPullRequests(playbook: Pick<Playbook, "stages">) {
  return playbook.stages.some((stage) => stage.kind === "action");
}

export function evaluatePreStartChecks(facts: PreStartFacts): PreStartCheck[] {
  const checks: PreStartCheck[] = [];

  checks.push(
    facts.providerSupported
      ? { id: "task", label: "Task", state: "pass", detail: "Runs on this task's Claude or Codex model.", blocking: true }
      : {
          id: "task",
          label: "Task",
          state: "fail",
          detail: "Missions run on Claude and Codex tasks. Switch this task's provider, or start from a new task.",
          blocking: true,
        },
  );

  checks.push(
    facts.activeMission
      ? {
          id: "mission",
          label: "No mission running",
          state: "fail",
          detail: "This task is already running a mission. Cancel it in the task's Progress tab, or wait for it to end.",
          blocking: true,
        }
      : { id: "mission", label: "No mission running", state: "pass", detail: "The task is free.", blocking: true },
  );

  switch (facts.reporting.state) {
    case "ready":
      checks.push({
        id: "reporting",
        label: "Stage reports",
        state: "pass",
        detail: "Stave's local tools are on, so the agent can report each stage.",
        blocking: true,
      });
      break;
    case "unavailable":
      checks.push({
        id: "reporting",
        label: "Stage reports",
        state: "fail",
        detail: `${facts.reporting.detail ?? "Stave's local tools are off."} Without them the agent cannot report its stages.`,
        blocking: true,
      });
      break;
    case "unknown":
      checks.push({ id: "reporting", label: "Stage reports", state: "pending", detail: "Checking Stave's local tools…", blocking: true });
      break;
  }

  if (usesPullRequests(facts.playbook)) {
    const github = facts.github;
    switch (github.state) {
      case "pending":
        checks.push({ id: "github", label: "GitHub CLI", state: "pending", detail: "Checking `gh`…", blocking: true });
        break;
      case "authenticated":
        checks.push({ id: "github", label: "GitHub CLI", state: "pass", detail: "Signed in, so Stave can open and update the PR.", blocking: true });
        break;
      case "unauthenticated":
        checks.push({ id: "github", label: "GitHub CLI", state: "fail", detail: github.detail, blocking: true });
        break;
      case "unknown":
        checks.push({
          id: "github",
          label: "GitHub CLI",
          state: "warn",
          detail: `${github.detail} Pull request stages may stop and ask you.`,
          blocking: false,
        });
        break;
    }
    const needsExisting = playbookNeedsExistingPullRequest(facts.playbook);
    const pr = github.state === "authenticated" ? github.pullRequest : null;
    if (pr) {
      checks.push({
        id: "pull-request",
        label: "Pull request",
        state: "pass",
        detail: `PR #${pr.number} is open for this branch; the mission continues it instead of opening another.`,
        blocking: false,
      });
    } else if (needsExisting && github.state === "authenticated") {
      checks.push({
        id: "pull-request",
        label: "Pull request",
        state: "fail",
        detail: "This playbook works on an existing pull request, and this branch has none. Add “Open draft PR” or open one first.",
        blocking: true,
      });
    }
  }

  if (facts.workingTreeError) {
    checks.push({
      id: "workspace",
      label: "Working tree",
      state: "warn",
      detail: `${facts.workingTreeError.replace(/([^.!?…])$/, "$1.")} Any uncommitted files would go into the mission's work.`,
      blocking: false,
      needsAcknowledgement: !facts.dirtyAcknowledged,
      acknowledgeLabel: "Start without knowing what is uncommitted",
    });
  } else if (facts.dirtyFileCount === null) {
    checks.push({ id: "workspace", label: "Working tree", state: "pending", detail: "Reading the working tree…", blocking: true });
  } else if (facts.dirtyFileCount === 0) {
    checks.push({ id: "workspace", label: "Working tree", state: "pass", detail: "Clean.", blocking: false });
  } else {
    const files = `${facts.dirtyFileCount} uncommitted ${facts.dirtyFileCount === 1 ? "file" : "files"}`;
    checks.push({
      id: "workspace",
      label: "Working tree",
      state: "warn",
      detail: `${files}. The mission starts on top of them and may commit them with its work.`,
      blocking: false,
      needsAcknowledgement: !facts.dirtyAcknowledged,
      acknowledgeLabel: "Start on top of these changes",
    });
  }

  return checks;
}

/** Start is enabled when nothing blocks and every warning that needs it is acknowledged. */
export function canStartWith(checks: readonly PreStartCheck[]): boolean {
  return checks.every(
    (check) => !(check.blocking && (check.state === "fail" || check.state === "pending")) && !check.needsAcknowledgement,
  );
}
