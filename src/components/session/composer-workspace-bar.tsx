import { GitBranch } from "lucide-react";
import { sessionCoreStyles } from "./session-core.styles";
import { sx } from "../ads/utils/stylex";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";

/**
 * Where the next turn runs, in two facts: the repository and the branch.
 *
 * A worktree workspace can answer "where am I?" four times over — repository,
 * workspace name, checkout directory, branch — and three of those are usually
 * the same string wearing different punctuation. What survives is the pair that
 * cannot be derived from each other: the repository says which codebase, the
 * branch says which line of work. With both wings collapsed this line is the
 * only orientation on screen, which is why the repository earns its place here.
 *
 * The workspace name and folder stay in the tooltip.
 */
export function ComposerWorkspaceBarView(props: {
  repositoryLabel: string;
  workspaceLabel: string;
  folderLabel: string;
  branchLabel: string;
}) {
  // No branch (a plain directory, or git not resolved yet): the workspace name
  // is the only thing left worth saying, so it stands in.
  const label = props.branchLabel || props.workspaceLabel;
  // A repository named after its branch would just be the same word twice.
  const repository = props.repositoryLabel === label ? "" : props.repositoryLabel;
  if (!label && !repository) {
    return null;
  }
  const detail = [props.workspaceLabel, props.folderLabel]
    .filter((part) => part.length > 0 && part !== label)
    .join(" · ");

  return (
    // Content only: the bottom shelf's surface, radius, and tuck belong to
    // `ComposerFrameStatusBar`, which also hosts the trailing readouts.
    <div
      data-testid="composer-workspace-bar"
      className={sx(sessionCoreStyles.workspaceBar)}
    >
      {repository ? (
        // Kept whole while the branch truncates: repository names are short, and
        // this is the half that says which codebase you are looking at.
        <span
          data-testid="composer-workspace-project"
          className={sx(sessionCoreStyles.repository)}
          title={repository}
        >
          {repository}
        </span>
      ) : null}
      {label ? (
        <span
          className={sx(sessionCoreStyles.branchGroup)}
          title={detail ? `${label} · ${detail}` : label}
        >
          <GitBranch className={sx(sessionCoreStyles.branchIcon)} aria-hidden="true" />
          <span className={sx(sessionCoreStyles.monoTruncate)}>{label}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ComposerWorkspaceBar() {
  const workspaceLabel = useAppStore((state) => {
    const workspaceId = state.activeWorkspaceId;
    return (
      state.workspaces.find((workspace) => workspace.id === workspaceId)
        ?.name ?? ""
    );
  });
  const folderLabel = useAppStore((state) =>
    resolvePathBaseName({
      path: state.workspacePathById[state.activeWorkspaceId],
      fallback: "",
    }),
  );
  const repositoryLabel = useAppStore((state) => state.repositoryName ?? "");
  const branchLabel = useAppStore(
    (state) => state.workspaceBranchById[state.activeWorkspaceId] ?? "",
  );

  return (
    <ComposerWorkspaceBarView
      repositoryLabel={repositoryLabel}
      workspaceLabel={workspaceLabel}
      folderLabel={folderLabel}
      branchLabel={branchLabel}
    />
  );
}
