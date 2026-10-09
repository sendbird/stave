import type { StoreApi } from "zustand";
import { i18n } from "@/i18n/runtime";
import type { GitHubPrPayload } from "@/lib/pr-status";
import {
  upsertWorkspaceResourceInState,
  type WorkspaceLinkedPrStatus,
} from "@/lib/workspace-information";
import type { AppState } from "@/store/app-store.types";

/**
 * Continuing a finished workspace in place: the same workspace, conversation
 * and worktree move on to a new branch cut from the base, and the pull request
 * the old branch carried stays listed in the workspace's links.
 *
 * The alternative, a new workspace with a continuation brief, lives in
 * `continueWorkspaceFromSummary`; this is the path for a user who wants to
 * keep talking to the same task.
 */

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Ref names this flow passes to git through the shell. The character set is
 * what `sanitizeBranchName` produces, so nothing in it can expand or split in
 * a shell; the other checks are the `git check-ref-format` rules that set
 * still allows.
 */
export function isSafeContinueRef(value: string) {
  return (
    SAFE_REF_PATTERN.test(value) &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.includes("/.") &&
    !value.endsWith("/") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock")
  );
}

/** Splits `origin/main` into its remote; a bare branch name has none. */
export function splitRemoteRef(ref: string): { remote: string; branch: string } | null {
  const separator = ref.indexOf("/");
  return separator > 0
    ? { remote: ref.slice(0, separator), branch: ref.slice(separator + 1) }
    : null;
}

function linkedStatusOf(pr: GitHubPrPayload): WorkspaceLinkedPrStatus {
  if (pr.state === "MERGED") return "merged";
  if (pr.state === "CLOSED") return "closed";
  return "open";
}

type Result = { ok: boolean; message?: string; noticeLevel?: "success" | "warning" };

export async function continueWorkspaceOnNewBranch(args: {
  get: StoreApi<AppState>["getState"];
  set: StoreApi<AppState>["setState"];
  name: string;
  baseBranch?: string;
}): Promise<Result> {
  const state = args.get();
  const workspaceId = state.activeWorkspaceId;
  const fail = (message: string): Result => ({ ok: false, message });
  if (!workspaceId) {
    return fail(i18n.t("workspace:appStoreWorkspaceCreateActions.selectAWorkspaceBeforeContinuing"));
  }
  if (state.workspaceDefaultById[workspaceId]) {
    return fail(i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereDefaultWorkspace"));
  }
  const cwd = state.workspacePathById[workspaceId];
  const runCommand = window.api?.terminal?.runCommand;
  if (!cwd || !runCommand) {
    return fail(i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereUnavailable"));
  }
  const branch = args.name.trim();
  const requestedBase =
    args.baseBranch?.trim() || `origin/${state.defaultBranch.trim() || "main"}`;
  if (!isSafeContinueRef(branch) || !isSafeContinueRef(requestedBase)) {
    return fail(i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereInvalidBranch"));
  }

  const warnings: string[] = [];
  let base = requestedBase;
  const remoteRef = splitRemoteRef(requestedBase);
  if (remoteRef) {
    const fetched = await runCommand({ cwd, command: `git fetch '${remoteRef.remote}' --prune` });
    if (!fetched.ok) {
      base = remoteRef.branch;
      warnings.push(
        i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereFetchWarning", {
          base: requestedBase,
          local: remoteRef.branch,
        }),
      );
    }
  }

  const previousBranch = state.workspaceBranchById[workspaceId] ?? "";
  const previousPr = state.workspacePrInfoById[workspaceId]?.pr ?? null;
  // `git switch -c` refuses rather than overwrite: uncommitted changes come
  // along when they do not conflict with the base, and stop the switch when
  // they do.
  const switched = await runCommand({ cwd, command: `git switch -c '${branch}' '${base}'` });
  if (!switched.ok) {
    return fail(
      i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereSwitchFailed", {
        detail: (switched.stderr || switched.stdout || "").trim(),
      }),
    );
  }

  const latest = args.get();
  if (previousPr?.url && latest.activeWorkspaceId === workspaceId) {
    latest.updateWorkspaceInformation({
      updater: (current) =>
        upsertWorkspaceResourceInState({
          current,
          input: {
            kind: "pull_request",
            url: previousPr.url,
            title: previousPr.title,
            status: linkedStatusOf(previousPr),
            note: i18n.t("workspace:appStoreWorkspaceCreateActions.previousPrNote", {
              branch: previousBranch,
            }),
          },
        }).state,
    });
  }
  latest.setWorkspaceBranch({ workspaceId, branch });
  // The old branch's PR no longer describes this workspace.
  args.set((current) => {
    const { [workspaceId]: _previous, ...rest } = current.workspacePrInfoById;
    return { workspacePrInfoById: rest };
  });
  void args.get().fetchWorkspacePrStatus({ workspaceId });

  return {
    ok: true,
    noticeLevel: warnings.length > 0 ? "warning" : "success",
    message: [
      i18n.t("workspace:appStoreWorkspaceCreateActions.continueHereDone", { branch, base }),
      ...warnings,
    ].join(" "),
  };
}
