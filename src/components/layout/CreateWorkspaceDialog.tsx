import { Button as AdsButton } from "@/components/ads/components/Button";
import { FolderSymlink, GitBranch, X } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { resolveDefaultCreateWorkspaceBaseBranch } from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import { dialogStyles } from "@/components/ads/components/Dialog";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Badge, Button, Input, Textarea, toast } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { createWorkspaceStyles } from "./create-workspace-dialog.styles";

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
    label?: string;
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
  onImportWorkspace: (args: {
    worktreePath: string;
    label?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
}

type CreateWorkspaceCreationMode = "branch" | "clean" | "link";

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
  onImportWorkspace,
}: CreateWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [worktreePath, setWorktreePath] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<
    string | null
  >(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creationMode, setCreationMode] =
    useState<CreateWorkspaceCreationMode>("branch");
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
  const titleId = useId();

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
    setWorkspaceLabel("");
    setWorktreePath("");
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

  async function handleBrowseWorktreePath() {
    const pickDirectory = window.api?.fs?.pickDirectory;
    if (!pickDirectory) {
      return;
    }
    try {
      const picked = await pickDirectory();
      if (picked?.ok && picked.directoryPath) {
        setCreationMode("link");
        setWorktreePath(picked.directoryPath);
      }
    } catch {
      // Picker failure — keep the manually typed path.
    }
  }

  async function handleCreateWorkspace() {
    setCreatingWorkspace(true);
    setCreateWorkspaceError(null);
    try {
      const result =
        creationMode === "link"
          ? await onImportWorkspace({
              worktreePath,
              label: workspaceLabel,
            })
          : await onCreateWorkspace({
              name: workspaceName,
              label: workspaceLabel,
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
          toast.success(
            creationMode === "link" ? "Worktree linked" : "Workspace created",
            { description: result.message },
          );
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
      className={cx(
        UI_LAYER_CLASS.dialog,
        "t-overlay",
        sx(createWorkspaceStyles.backdrop),
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={() => {
        if (creatingWorkspace) {
          return;
        }
        closeDialog();
      }}
    >
      <section
        className={cx(
          "t-modal",
          sx(dialogStyles.surface, createWorkspaceStyles.panel),
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div className={sx(createWorkspaceStyles.headerRow)}>
            <h3 id={titleId} className={sx(createWorkspaceStyles.title)}>
              New workspace
            </h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              <X className={sx(createWorkspaceStyles.closeIcon)} />
            </Button>
          </div>
          <p className={sx(createWorkspaceStyles.lead)}>
            Workspace is a dedicated git worktree bound to a branch.
          </p>
          {creationMode !== "link" ? (
            <div className={sx(createWorkspaceStyles.field)}>
              <p className={sx(createWorkspaceStyles.fieldLabel)}>
                Workspace Branch Name
              </p>
              <Input
                autoFocus
                value={workspaceName}
                placeholder="feature/your-workspace"
                onChange={(event) => setWorkspaceName(event.target.value)}
                xstyle={createWorkspaceStyles.textInput}
              />
            </div>
          ) : null}
          <div className={sx(createWorkspaceStyles.field)}>
            <p className={sx(createWorkspaceStyles.fieldLabel)}>
              Workspace Label
            </p>
            <Input
              value={workspaceLabel}
              placeholder="Optional display label"
              onChange={(event) => setWorkspaceLabel(event.target.value)}
              xstyle={createWorkspaceStyles.textInput}
            />
            <p className={sx(createWorkspaceStyles.fieldHint)}>
              Optional. Leave blank to use the branch name in the project list.
            </p>
          </div>
          <p className={sx(createWorkspaceStyles.fieldLabel)}>
            Creation Methods
          </p>
          <div
            className={sx(createWorkspaceStyles.modeList)}
            role="radiogroup"
            aria-label="Creation methods"
          >
            <div
              role="radio"
              aria-checked={creationMode === "branch"}
              className={sx(
                createWorkspaceStyles.modeCard,
                creationMode === "branch"
                  ? createWorkspaceStyles.modeCardSelected
                  : createWorkspaceStyles.modeCardIdle,
              )}
            >
              <AdsButton layout="host"
                type="button"
                xstyle={createWorkspaceStyles.modeTrigger}
                onClick={() => setCreationMode("branch")}
              >
                <p className={sx(createWorkspaceStyles.modeTitle)}>
                  <GitBranch className={sx(createWorkspaceStyles.modeIcon)} />
                  Create From Branch
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  Create worktree from a searchable base branch list with remote
                  bases prioritized.
                </p>
              </AdsButton>
              <div className={sx(createWorkspaceStyles.subBlock)}>
                <p className={sx(createWorkspaceStyles.subLabel)}>
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
              className={sx(
                createWorkspaceStyles.modeCard,
                creationMode === "clean"
                  ? createWorkspaceStyles.modeCardSelected
                  : createWorkspaceStyles.modeCardIdle,
              )}
            >
              <AdsButton layout="host"
                type="button"
                xstyle={createWorkspaceStyles.modeTrigger}
                onClick={() => setCreationMode("clean")}
              >
                <p className={sx(createWorkspaceStyles.modeTitlePlain)}>
                  Create Clean Workspace
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  Create a new isolated worktree with a fresh branch.
                </p>
              </AdsButton>
            </div>
            <div
              role="radio"
              aria-checked={creationMode === "link"}
              className={sx(
                createWorkspaceStyles.modeCard,
                creationMode === "link"
                  ? createWorkspaceStyles.modeCardSelected
                  : createWorkspaceStyles.modeCardIdle,
              )}
            >
              <AdsButton layout="host"
                type="button"
                xstyle={createWorkspaceStyles.modeTrigger}
                onClick={() => setCreationMode("link")}
              >
                <p className={sx(createWorkspaceStyles.modeTitle)}>
                  <FolderSymlink
                    className={sx(createWorkspaceStyles.modeIcon)}
                  />
                  Link Existing Worktree
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  Continue work in a worktree that already exists elsewhere on
                  disk. Stave symlinks it into `.stave/workspaces/` and keeps
                  its current branch.
                </p>
              </AdsButton>
              {creationMode === "link" ? (
                <div className={sx(createWorkspaceStyles.subBlock)}>
                  <p className={sx(createWorkspaceStyles.subLabel)}>
                    Worktree Path
                  </p>
                  <div className={sx(createWorkspaceStyles.pathRow)}>
                    <Input
                      autoFocus
                      value={worktreePath}
                      placeholder="~/worktrees/feature-branch"
                      onChange={(event) => setWorktreePath(event.target.value)}
                      xstyle={createWorkspaceStyles.pathInput}
                    />
                    {window.api?.fs?.pickDirectory ? (
                      <Button
                        type="button"
                        variant="outline"
                        xstyle={createWorkspaceStyles.browseButton}
                        disabled={creatingWorkspace}
                        onClick={() => void handleBrowseWorktreePath()}
                      >
                        Browse
                      </Button>
                    ) : null}
                  </div>
                  <p className={sx(createWorkspaceStyles.fieldHint)}>
                    The linked worktree stays where it is; archiving the
                    workspace later removes only the symlink.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          {creationMode !== "link" ? (
            <>
              <div className={sx(createWorkspaceStyles.section)}>
                <p className={sx(createWorkspaceStyles.fieldLabel)}>
                  Post-Create Command
                </p>
                <p className={sx(createWorkspaceStyles.sectionCopy)}>
                  Optional shell command to run once inside the new workspace
                  root after creation. Useful for `bun install` or `npm
                  install`.
                </p>
                <Textarea
                  value={initCommand}
                  placeholder="bun install"
                  onChange={(event) => setInitCommand(event.target.value)}
                  xstyle={createWorkspaceStyles.initCommand}
                />
                <p className={sx(createWorkspaceStyles.sectionHint)}>
                  Shortcut: use {submitModifierLabel} to create while editing
                  this field.
                </p>
              </div>
              <div className={sx(createWorkspaceStyles.section)}>
                <p className={sx(createWorkspaceStyles.fieldLabel)}>
                  Dependency Reuse
                </p>
                <AdsButton layout="host"
                  type="button"
                  aria-pressed={useRootNodeModulesSymlink}
                  onClick={() =>
                    setUseRootNodeModulesSymlink((current) => !current)
                  }
                  xstyle={[
                    createWorkspaceStyles.symlinkToggle,
                    useRootNodeModulesSymlink
                      ? createWorkspaceStyles.symlinkToggleOn
                      : createWorkspaceStyles.symlinkToggleOff,
                  ]}
                >
                  <div className={sx(createWorkspaceStyles.symlinkRow)}>
                    <p className={sx(createWorkspaceStyles.symlinkTitle)}>
                      <span>Reuse root</span>
                      <Badge
                        variant="outline"
                        className={sx(createWorkspaceStyles.monoChip)}
                      >
                        node_modules
                      </Badge>
                      <span>via symlink</span>
                    </p>
                    <span
                      className={sx(
                        createWorkspaceStyles.statePill,
                        useRootNodeModulesSymlink
                          ? createWorkspaceStyles.statePillOn
                          : createWorkspaceStyles.statePillOff,
                      )}
                    >
                      {useRootNodeModulesSymlink ? "On" : "Off"}
                    </span>
                  </div>
                  <p className={sx(createWorkspaceStyles.symlinkDescription)}>
                    Creates{" "}
                    <Badge
                      variant="outline"
                      className={sx(createWorkspaceStyles.monoChipInline)}
                    >
                      node_modules
                    </Badge>{" "}
                    in the new workspace as a symlink to the repository root
                    install. This is fast, but later installs in that workspace
                    will affect the shared dependency tree.
                  </p>
                </AdsButton>
              </div>
            </>
          ) : null}
          <div className={sx(createWorkspaceStyles.actions)}>
            <Button
              type="button"
              variant="outline"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creatingWorkspace}>
              {creationMode === "link"
                ? creatingWorkspace
                  ? "Linking..."
                  : "Link"
                : creatingWorkspace
                  ? "Creating..."
                  : "Create"}
            </Button>
          </div>
          {createWorkspaceError ? (
            <p className={sx(createWorkspaceStyles.error)}>
              {createWorkspaceError}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
