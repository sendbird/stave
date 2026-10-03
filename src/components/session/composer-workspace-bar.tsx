import { FolderGit2, GitBranch } from "lucide-react";
import { sessionCoreStyles } from "./session-core.styles";
import { sx } from "../ads/utils/stylex";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";

/** Letters and digits only, so `fix-benchmark`, `fix/benchmark` and `fix__benchmark` compare equal. */
function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The workspace name, when it says something the repository and branch do
 * not. A name Stave derived from the branch (`fix-benchmark` for
 * `fix/benchmark-new-ade`) or that repeats the repository is dropped; a name
 * the user gave (`Agentic Workflow` on `feat/agent-manager`) is what they see
 * in the sidebar, so it is the one that orients them.
 */
export function distinctWorkspaceLabel(args: { workspaceLabel: string; repositoryLabel: string; branchLabel: string }) {
  const name = slug(args.workspaceLabel);
  if (!name) return "";
  const branch = slug(args.branchLabel);
  if (name === slug(args.repositoryLabel) || (branch && branch.includes(name))) return "";
  return args.workspaceLabel;
}

/**
 * Where the next turn runs: repository › workspace, then the branch.
 *
 * The repository leads, brighter and with its own mark, because it says which
 * codebase. The workspace name follows only when it is not just the branch
 * again (`distinctWorkspaceLabel`). The branch is last and gives way first
 * when the row is tight. The folder, and every part in full, are in the
 * tooltip.
 */
export function ComposerWorkspaceBarView(props: {
  repositoryLabel: string;
  workspaceLabel: string;
  folderLabel: string;
  branchLabel: string;
}) {
  // No branch (a plain directory, or git not resolved yet): the workspace name
  // stands in for it.
  const branch = props.branchLabel;
  const workspace = branch
    ? distinctWorkspaceLabel(props)
    : "";
  const fallback = branch ? "" : props.workspaceLabel;
  const label = branch || fallback;
  // A repository named after its branch would just be the same word twice.
  const repository = slug(props.repositoryLabel) === slug(label) ? "" : props.repositoryLabel;
  if (!label && !repository) {
    return null;
  }
  const details = [
    repository ? `Repository: ${repository}` : "",
    props.workspaceLabel ? `Workspace: ${props.workspaceLabel}` : "",
    props.branchLabel ? `Branch: ${props.branchLabel}` : "",
    props.folderLabel ? `Folder: ${props.folderLabel}` : "",
  ].filter(Boolean);

  return (
    // Content only: the bottom shelf's surface, radius, and tuck belong to
    // `ComposerFrameStatusBar`, which also hosts the trailing readouts.
    <div
      data-testid="composer-workspace-bar"
      className={sx(sessionCoreStyles.workspaceBar)}
      title={details.join("\n")}
    >
      {repository ? (
        // Kept whole while the rest truncates: repository names are short, and
        // this is the half that says which codebase you are looking at.
        <span data-testid="composer-workspace-project" className={sx(sessionCoreStyles.repository)}>
          <FolderGit2 className={sx(sessionCoreStyles.branchIcon)} aria-hidden="true" />
          <span className={sx(sessionCoreStyles.truncate)}>{repository}</span>
        </span>
      ) : null}
      {repository && (workspace || fallback) ? (
        <span aria-hidden="true" className={sx(sessionCoreStyles.workspaceSeparator)}>/</span>
      ) : null}
      {workspace || fallback ? (
        <span data-testid="composer-workspace-name" className={sx(sessionCoreStyles.workspaceName)}>
          {workspace || fallback}
        </span>
      ) : null}
      {branch ? (
        <span data-testid="composer-workspace-branch" className={sx(sessionCoreStyles.branchGroup)}>
          <GitBranch className={sx(sessionCoreStyles.branchIcon)} aria-hidden="true" />
          <span className={sx(sessionCoreStyles.monoTruncate)}>{branch}</span>
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
