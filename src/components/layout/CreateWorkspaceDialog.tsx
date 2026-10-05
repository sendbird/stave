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
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Badge, Button, Input, Textarea, toast } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { createWorkspaceStyles } from "./create-workspace-dialog.styles";
import { Trans, useTranslation } from "@/i18n";

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
  const { t } = useTranslation(["workspace", "common"]);
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
          result.message ?? t("createDialog.errors.failed"),
        );
        return;
      }
      if (result.message) {
        if (result.noticeLevel === "warning") {
          toast.warning(t("createDialog.toasts.createdWithWarning"), {
            description: result.message,
          });
        } else {
          toast.success(
            creationMode === "link"
              ? t("createDialog.toasts.linked")
              : t("createDialog.toasts.created"),
            { description: result.message },
          );
        }
      }
      onOpenChange(false);
    } catch (error) {
      setCreateWorkspaceError(
        error instanceof Error ? error.message : t("createDialog.errors.failed"),
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
          sx(
            overlaySurface.modal,
            overlaySurface.modalRounded,
            createWorkspaceStyles.panel,
          ),
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div className={sx(createWorkspaceStyles.headerRow)}>
            <h3 id={titleId} className={sx(createWorkspaceStyles.title)}>
              {t("createDialog.title")}
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
            {t("createDialog.lead")}
          </p>
          {creationMode !== "link" ? (
            <div className={sx(createWorkspaceStyles.field)}>
              <p className={sx(createWorkspaceStyles.fieldLabel)}>
                {t("createDialog.branchNameLabel")}
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
              {t("createDialog.labelField.label")}
            </p>
            <Input
              value={workspaceLabel}
              placeholder={t("createDialog.labelField.placeholder")}
              onChange={(event) => setWorkspaceLabel(event.target.value)}
              xstyle={createWorkspaceStyles.textInput}
            />
            <p className={sx(createWorkspaceStyles.fieldHint)}>
              {t("createDialog.labelField.hint")}
            </p>
          </div>
          <p className={sx(createWorkspaceStyles.fieldLabel)}>
            {t("createDialog.methods.label")}
          </p>
          <div
            className={sx(createWorkspaceStyles.modeList)}
            role="radiogroup"
            aria-label={t("createDialog.methods.ariaLabel")}
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
                  {t("createDialog.modes.branch.title")}
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  {t("createDialog.modes.branch.description")}
                </p>
              </AdsButton>
              <div className={sx(createWorkspaceStyles.subBlock)}>
                <p className={sx(createWorkspaceStyles.subLabel)}>
                  {t("createDialog.modes.branch.baseBranch")}
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
                  {t("createDialog.modes.clean.title")}
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  {t("createDialog.modes.clean.description")}
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
                  {t("createDialog.modes.link.title")}
                </p>
                <p className={sx(createWorkspaceStyles.modeDescription)}>
                  {t("createDialog.modes.link.description")}
                </p>
              </AdsButton>
              {creationMode === "link" ? (
                <div className={sx(createWorkspaceStyles.subBlock)}>
                  <p className={sx(createWorkspaceStyles.subLabel)}>
                    {t("createDialog.modes.link.pathLabel")}
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
                        {t("common:actions.browse")}
                      </Button>
                    ) : null}
                  </div>
                  <p className={sx(createWorkspaceStyles.fieldHint)}>
                    {t("createDialog.modes.link.pathHint")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          {creationMode !== "link" ? (
            <>
              <div className={sx(createWorkspaceStyles.section)}>
                <p className={sx(createWorkspaceStyles.fieldLabel)}>
                  {t("createDialog.postCreate.label")}
                </p>
                <p className={sx(createWorkspaceStyles.sectionCopy)}>
                  {t("createDialog.postCreate.description")}
                </p>
                <Textarea
                  value={initCommand}
                  // i18n-ignore: example shell command, not prose
                  placeholder="bun install"
                  onChange={(event) => setInitCommand(event.target.value)}
                  xstyle={createWorkspaceStyles.initCommand}
                />
                <p className={sx(createWorkspaceStyles.sectionHint)}>
                  {t("createDialog.postCreate.shortcutHint", {
                    shortcut: submitModifierLabel,
                  })}
                </p>
              </div>
              <div className={sx(createWorkspaceStyles.section)}>
                <p className={sx(createWorkspaceStyles.fieldLabel)}>
                  {t("createDialog.dependencyReuse.label")}
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
                      <Trans
                        t={t}
                        i18nKey="createDialog.dependencyReuse.title"
                        components={{
                          label: <span />,
                          chip: (
                            <Badge
                              variant="outline"
                              className={sx(createWorkspaceStyles.monoChip)}
                            />
                          ),
                        }}
                      />
                    </p>
                    <span
                      className={sx(
                        createWorkspaceStyles.statePill,
                        useRootNodeModulesSymlink
                          ? createWorkspaceStyles.statePillOn
                          : createWorkspaceStyles.statePillOff,
                      )}
                    >
                      {useRootNodeModulesSymlink
                        ? t("common:status.on")
                        : t("common:status.off")}
                    </span>
                  </div>
                  <p className={sx(createWorkspaceStyles.symlinkDescription)}>
                    <Trans
                      t={t}
                      i18nKey="createDialog.dependencyReuse.description"
                      components={{
                        chip: (
                          <Badge
                            variant="outline"
                            className={sx(createWorkspaceStyles.monoChipInline)}
                          />
                        ),
                      }}
                    />
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
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={creatingWorkspace}>
              {creationMode === "link"
                ? creatingWorkspace
                  ? t("createDialog.submit.linking")
                  : t("createDialog.submit.link")
                : creatingWorkspace
                  ? t("createDialog.submit.creating")
                  : t("common:actions.create")}
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
