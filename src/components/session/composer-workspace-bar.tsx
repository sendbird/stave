import { GitBranch } from "lucide-react";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";

/**
 * Where the next turn runs, in two facts: the project and the branch.
 *
 * A worktree workspace can answer "where am I?" four times over — project,
 * workspace name, checkout directory, branch — and three of those are usually
 * the same string wearing different punctuation. What survives is the pair that
 * cannot be derived from each other: the project says which codebase, the
 * branch says which line of work. With both wings collapsed this line is the
 * only orientation on screen, which is why the project earns its place here.
 *
 * The workspace name and folder stay in the tooltip.
 */
export function ComposerWorkspaceBarView(props: {
  projectLabel: string;
  workspaceLabel: string;
  folderLabel: string;
  branchLabel: string;
}) {
  // No branch (a plain directory, or git not resolved yet): the workspace name
  // is the only thing left worth saying, so it stands in.
  const label = props.branchLabel || props.workspaceLabel;
  // A project named after its branch would just be the same word twice.
  const project = props.projectLabel === label ? "" : props.projectLabel;
  if (!label && !project) {
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
      className="flex min-w-0 items-center gap-2 overflow-hidden"
    >
      {project ? (
        // Kept whole while the branch truncates: project names are short, and
        // this is the half that says which codebase you are looking at.
        <span
          data-testid="composer-workspace-project"
          className="max-w-40 shrink-0 truncate"
          title={project}
        >
          {project}
        </span>
      ) : null}
      {label ? (
        <span
          className="inline-flex min-w-0 items-center gap-1.5"
          title={detail ? `${label} · ${detail}` : label}
        >
          <GitBranch className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">{label}</span>
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
  const projectLabel = useAppStore((state) => state.projectName ?? "");
  const branchLabel = useAppStore(
    (state) => state.workspaceBranchById[state.activeWorkspaceId] ?? "",
  );

  return (
    <ComposerWorkspaceBarView
      projectLabel={projectLabel}
      workspaceLabel={workspaceLabel}
      folderLabel={folderLabel}
      branchLabel={branchLabel}
    />
  );
}
