import { Folder, GitBranch } from "lucide-react";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";

export function ComposerWorkspaceBarView(props: {
  workspaceLabel: string;
  folderLabel: string;
  branchLabel: string;
}) {
  const showFolder =
    props.folderLabel.length > 0 && props.folderLabel !== props.workspaceLabel;
  if (!props.workspaceLabel && !showFolder && !props.branchLabel) {
    return null;
  }

  return (
    <div
      data-testid="composer-workspace-bar"
      className="composer-frame-surface flex min-h-8 items-center gap-2 overflow-hidden rounded-xl bg-card px-2.5 py-1 text-xs text-muted-foreground"
    >
      {props.workspaceLabel ? (
        <span
          className="inline-flex min-w-0 items-center gap-1"
          title={props.workspaceLabel}
        >
          <Folder className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{props.workspaceLabel}</span>
        </span>
      ) : null}
      {showFolder ? (
        <span
          className="inline-flex min-w-0 items-center gap-1"
          title={props.folderLabel}
        >
          <Folder className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{props.folderLabel}</span>
        </span>
      ) : null}
      {props.branchLabel ? (
        <span
          className="inline-flex min-w-0 items-center gap-1"
          title={props.branchLabel}
        >
          <GitBranch className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">{props.branchLabel}</span>
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
  const branchLabel = useAppStore(
    (state) => state.workspaceBranchById[state.activeWorkspaceId] ?? "",
  );

  return (
    <ComposerWorkspaceBarView
      workspaceLabel={workspaceLabel}
      folderLabel={folderLabel}
      branchLabel={branchLabel}
    />
  );
}
