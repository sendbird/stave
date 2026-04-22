import { GitBranch, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { resolveDefaultCreateWorkspaceBaseBranch } from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import { Badge, Button, Card, Input, Textarea, toast } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

interface CreateWorkspaceDialogProps {
  open: boolean;
  activeBranch: string;
  defaultBranch: string;
  cwd?: string;
  defaultInitCommand?: string;
  defaultUseRootNodeModulesSymlink?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (args: {
    name: string;
    mode: "branch" | "clean";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
    initCommand?: string;
    useRootNodeModulesSymlink?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
}

function resolveSelectedBranchKind(args: {
  branch: string;
  localBranches: string[];
  remoteBranches: string[];
}): "local" | "remote" {
  return args.remoteBranches.includes(args.branch) ? "remote" : "local";
}

export function CreateWorkspaceDialog({
  open,
  activeBranch,
  defaultBranch,
  cwd,
  defaultInitCommand = "",
  defaultUseRootNodeModulesSymlink = false,
  onOpenChange,
  onCreateWorkspace,
}: CreateWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<
    string | null
  >(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creationMode, setCreationMode] = useState<"branch" | "clean">(
    "branch",
  );
  const [fromBranch, setFromBranch] = useState("main");
  const [fromBranchKind, setFromBranchKind] = useState<"local" | "remote">(
    "local",
  );
  const [initCommand, setInitCommand] = useState(defaultInitCommand);
  const [useRootNodeModulesSymlink, setUseRootNodeModulesSymlink] = useState(
    defaultUseRootNodeModulesSymlink,
  );
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [availableRemoteBranches, setAvailableRemoteBranches] = useState<
    string[]
  >([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const fallbackBaseBranch = resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch,
      defaultBranch,
      localBranches: [],
      remoteBranches: [],
    });

    setFromBranch(fallbackBaseBranch);
    setFromBranchKind(
      resolveSelectedBranchKind({
        branch: fallbackBaseBranch,
        localBranches: [],
        remoteBranches: [],
      }),
    );
    setInitCommand(defaultInitCommand);
    setUseRootNodeModulesSymlink(defaultUseRootNodeModulesSymlink);
    setAvailableBranches([]);
    setAvailableRemoteBranches([]);
    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      setLoadingBranches(false);
      return;
    }

    let cancelled = false;
    setLoadingBranches(true);
    void listBranches({ cwd, refreshRemote: true })
      .then((result) => {
        if (!result?.ok || cancelled) {
          return;
        }

        setAvailableBranches(result.branches);
        setAvailableRemoteBranches(result.remoteBranches ?? []);
        const nextFromBranch = resolveDefaultCreateWorkspaceBaseBranch({
          activeBranch,
          defaultBranch,
          localBranches: result.branches,
          remoteBranches: result.remoteBranches ?? [],
        });
        setFromBranch(nextFromBranch);
        setFromBranchKind(
          resolveSelectedBranchKind({
            branch: nextFromBranch,
            localBranches: result.branches,
            remoteBranches: result.remoteBranches ?? [],
          }),
        );
      })
      .catch(() => {
        // IPC failure — swallow; branch lists stay empty.
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBranches(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeBranch,
    cwd,
    defaultBranch,
    defaultInitCommand,
    defaultUseRootNodeModulesSymlink,
    open,
  ]);

  useEffect(() => {
    if (open) {
      return;
    }
    setWorkspaceName("");
    setCreateWorkspaceError(null);
    setCreatingWorkspace(false);
    setCreationMode("branch");
    setInitCommand(defaultInitCommand);
    setUseRootNodeModulesSymlink(defaultUseRootNodeModulesSymlink);
    setAvailableBranches([]);
    setAvailableRemoteBranches([]);
    setLoadingBranches(false);
    const fallbackBaseBranch = resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch,
      defaultBranch,
      localBranches: [],
      remoteBranches: [],
    });
    setFromBranch(fallbackBaseBranch);
    setFromBranchKind(
      resolveSelectedBranchKind({
        branch: fallbackBaseBranch,
        localBranches: [],
        remoteBranches: [],
      }),
    );
  }, [
    activeBranch,
    defaultBranch,
    defaultInitCommand,
    defaultUseRootNodeModulesSymlink,
    open,
  ]);

  if (!open) {
    return null;
  }

  const submitModifierLabel =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
      ? "Cmd+Enter"
      : "Ctrl+Enter";

  function closeDialog() {
    setCreateWorkspaceError(null);
    onOpenChange(false);
  }

  async function handleCreateWorkspace() {
    setCreatingWorkspace(true);
    setCreateWorkspaceError(null);
    try {
      const result = await onCreateWorkspace({
        name: workspaceName,
        mode: creationMode,
        fromBranch,
        fromBranchKind,
        initCommand,
        useRootNodeModulesSymlink,
      });
      if (!result.ok) {
        setCreateWorkspaceError(
          result.message ?? "Failed to create workspace.",
        );
        return;
      }
      if (result.message) {
        if (result.noticeLevel === "warning") {
          toast.warning("Workspace created with warning", {
            description: result.message,
          });
        } else {
          toast.success("Workspace created", { description: result.message });
        }
      }
      onOpenChange(false);
    } catch (error) {
      setCreateWorkspaceError(
        error instanceof Error ? error.message : "Failed to create workspace.",
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingWorkspace) {
      return;
    }
    void handleCreateWorkspace();
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !creatingWorkspace) {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      (event.target as HTMLElement | null)?.closest("textarea") &&
      !creatingWorkspace
    ) {
      event.preventDefault();
      void handleCreateWorkspace();
    }
  }

  return (
    <div
      className={cn(
        UI_LAYER_CLASS.dialog,
        "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]",
      )}
      onMouseDown={() => {
        if (creatingWorkspace) {
          return;
        }
        closeDialog();
      }}
    >
      <Card
        className="animate-dropdown-in w-full max-w-3xl rounded-lg border-border/80 bg-card p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-3xl font-semibold">New workspace</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Workspace is a dedicated git worktree bound to a branch.
          </p>
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">Workspace Branch Name</p>
            <Input
              autoFocus
              value={workspaceName}
              placeholder="feature/your-workspace"
              onChange={(event) => setWorkspaceName(event.target.value)}
              className="h-10 rounded-sm border-border/80 bg-background"
            />
          </div>
          <p className="mb-2 text-sm font-medium">Creation Methods</p>
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Creation methods"
          >
            <div
              role="radio"
              aria-checked={creationMode === "branch"}
              className={cn(
                "w-full rounded-sm border p-3",
                creationMode === "branch"
                  ? "border-primary bg-secondary/50"
                  : "border-border/80 bg-card",
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setCreationMode("branch")}
              >
                <p className="flex items-center gap-2 text-base font-semibold">
                  <GitBranch className="size-4" />
                  Create From Branch
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create worktree from a searchable base branch list with remote
                  bases prioritized.
                </p>
              </button>
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Base Branch
                </p>
                <CreateWorkspaceBranchPicker
                  value={fromBranch}
                  valueScope={fromBranchKind}
                  defaultBranch={defaultBranch}
                  localBranches={availableBranches}
                  loading={loadingBranches}
                  remoteBranches={availableRemoteBranches}
                  onChange={(nextBranch) => {
                    setCreationMode("branch");
                    setFromBranch(nextBranch);
                  }}
                  onChangeOption={(option) => {
                    setCreationMode("branch");
                    setFromBranchKind(option.scope);
                  }}
                />
              </div>
            </div>
            <div
              role="radio"
              aria-checked={creationMode === "clean"}
              className={cn(
                "w-full rounded-sm border p-3",
                creationMode === "clean"
                  ? "border-primary bg-secondary/50"
                  : "border-border/80 bg-card",
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setCreationMode("clean")}
              >
                <p className="text-base font-semibold">
                  Create Clean Workspace
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a new isolated worktree with a fresh branch.
                </p>
              </button>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Post-Create Command</p>
            <p className="mb-2 text-sm text-muted-foreground">
              Optional shell command to run once inside the new workspace root
              after creation. Useful for `bun install` or `npm install`.
            </p>
            <Textarea
              value={initCommand}
              placeholder="bun install"
              onChange={(event) => setInitCommand(event.target.value)}
              className="min-h-[110px] rounded-sm border-border/80 bg-background font-mono text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Shortcut: use {submitModifierLabel} to create while editing this
              field.
            </p>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Dependency Reuse</p>
            <button
              type="button"
              aria-pressed={useRootNodeModulesSymlink}
              onClick={() =>
                setUseRootNodeModulesSymlink((current) => !current)
              }
              className={cn(
                "w-full rounded-sm border px-4 py-3 text-left transition-colors",
                useRootNodeModulesSymlink
                  ? "border-primary bg-secondary/50"
                  : "border-border/80 bg-background hover:border-border",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  <span>Reuse root</span>
                  <Badge
                    variant="outline"
                    className="h-5 rounded-md px-1.5 font-mono text-[11px] font-medium"
                  >
                    node_modules
                  </Badge>
                  <span>via symlink</span>
                </p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                    useRootNodeModulesSymlink
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/80 text-muted-foreground",
                  )}
                >
                  {useRootNodeModulesSymlink ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Creates{" "}
                <Badge
                  variant="outline"
                  className="h-5 rounded-md px-1.5 align-middle font-mono text-[11px] font-medium"
                >
                  node_modules
                </Badge>{" "}
                in the new workspace as a symlink to the repository root
                install. This is fast, but later installs in that workspace will
                affect the shared dependency tree.
              </p>
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creatingWorkspace}>
              {creatingWorkspace ? "Creating..." : "Create"}
            </Button>
          </div>
          {createWorkspaceError ? (
            <p className="mt-3 text-sm text-destructive">
              {createWorkspaceError}
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
