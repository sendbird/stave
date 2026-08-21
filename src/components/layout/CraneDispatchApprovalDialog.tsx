import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import {
  dismissCraneDispatchApproval,
  setCraneConnectorClientStatus,
  useCraneConnectorClientState,
} from "@/lib/crane-connector/client-state";
import {
  applyCraneAutonomyPreset,
  buildCraneDispatchRuntimeChoice,
  buildCraneTeamRuntimeMemory,
  clampCraneDispatchEffort,
  describeCraneAccess,
  detectCraneAutonomyPreset,
  listCraneAutonomyOptions,
  listCraneEffortOptions,
  reseedCraneAccessForProvider,
  resolveCraneDispatchAccessDefaults,
  resolveCraneDispatchAdvisorChoice,
  resolveCraneDispatchAdvisorDefaults,
  resolveCraneDispatchModelDefaults,
  selectCraneDispatchAdvisorTarget,
  type CraneDispatchAccessState,
  type CraneDispatchAdvisorState,
  type CraneDispatchModelState,
} from "@/lib/crane-connector/dispatch-runtime";
import {
  buildCraneDispatchBranchName,
  resolveCraneJiraReference,
} from "@/lib/crane-connector/jira-reference";
import {
  findMappedCraneTeamRuntime,
  findMappedStaveProjectPath,
  getCraneTeamKey,
  updateCraneTeamProjectMapping,
} from "@/lib/crane-connector/project-mapping";
import {
  ADVISOR_EFFORT_AUTO_VALUE,
  buildAdvisorEffortOptions,
  buildAdvisorProviderOptions,
  formatAdvisorEffortLabel,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import {
  isAdvisorEffortClamped,
  resolveAdvisorEffort,
} from "@/lib/providers/advisor";
import {
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  AdvisorEffort,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_SANDBOX_MODE_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
  formatProviderTimeoutLabel,
} from "@/lib/providers/runtime-option-contract";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { useAppStore } from "@/store/app.store";

type WorkspaceStrategy = "new" | "existing";

const CRANE_DISPATCH_PROVIDER_IDS = listProviderIds();

/**
 * Models offered for an Advisor provider, with the current pick forced in.
 *
 * A remembered model that has left the catalog stays selectable rather than
 * silently snapping to a different one: the row then shows what will actually
 * run, and switching away from it is the user's decision.
 */
function advisorModelsForProvider(providerId: ProviderId, selected: string) {
  return Array.from(
    new Set([selected, ...getSdkModelOptions({ providerId })]),
  ).filter(Boolean);
}

export function CraneDispatchApprovalDialog() {
  const { approval } = useCraneConnectorClientState();
  const declineButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const projects = useAppStore((state) => state.recentProjects);
  const settings = useAppStore((state) => state.settings);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const [projectPath, setProjectPath] = useState("");
  const [rememberTeamDefaults, setRememberTeamDefaults] = useState(false);
  const [workspaceStrategy, setWorkspaceStrategy] =
    useState<WorkspaceStrategy>("new");
  const [workspaceId, setWorkspaceId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [runtimeModel, setRuntimeModel] = useState<CraneDispatchModelState>({
    providerId: "claude-code",
    model: "",
    effort: "high",
    codexFastMode: false,
  });
  const [access, setAccess] = useState<CraneDispatchAccessState>(() =>
    resolveCraneDispatchAccessDefaults({
      settings,
      providerId: "claude-code",
      model: settings.modelClaude,
    }),
  );
  // Seeded per approval from the Stave default and the team's remembered pick,
  // and never written back: approving one dispatch must not redefine the global
  // Advisor default.
  const [advisor, setAdvisor] = useState<CraneDispatchAdvisorState>(() =>
    resolveCraneDispatchAdvisorDefaults({
      settings,
      primaryProviderId: "claude-code",
    }),
  );

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectPath === projectPath) ?? null,
    [projectPath, projects],
  );
  const jiraReference = useMemo(
    () => (approval ? resolveCraneJiraReference(approval.job) : null),
    [approval],
  );
  const craneTeamKey = useMemo(
    () => (approval ? getCraneTeamKey(approval.job.issue.key) : null),
    [approval],
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: approval !== null,
    codexBinaryPath: settings.codexBinaryPath,
  });
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () =>
      buildModelSelectorOptions({
        providerIds: CRANE_DISPATCH_PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: { codex: codexModelCatalog.models },
      }),
    [codexModelCatalog.models, providerAvailability],
  );
  // Read by the seed effect, which intentionally depends only on `approval` so
  // a catalog refresh cannot reset choices already made in the open dialog.
  const modelOptionsRef = useRef<string[]>([]);
  modelOptionsRef.current = useMemo(
    () => modelOptions.map((option) => option.model).filter(Boolean),
    [modelOptions],
  );
  const selectedModelOption = useMemo(
    () =>
      buildModelSelectorValue({
        providerId: runtimeModel.providerId,
        model: runtimeModel.model,
        available: providerAvailability[runtimeModel.providerId],
      }),
    [providerAvailability, runtimeModel.model, runtimeModel.providerId],
  );
  const effortOptions = listCraneEffortOptions({
    providerId: runtimeModel.providerId,
    model: runtimeModel.model,
  });
  const effortLabel = effortOptions.find(
    (option) => option.value === runtimeModel.effort,
  )?.label;
  const autonomyPreset = detectCraneAutonomyPreset({
    providerId: runtimeModel.providerId,
    access,
  });
  const autonomyOptions = useMemo(() => {
    const presets = listCraneAutonomyOptions({
      providerId: runtimeModel.providerId,
    }).map((preset) => ({ value: preset.value as string, label: preset.label }));
    return autonomyPreset
      ? presets
      : [...presets, { value: "custom", label: "Custom" }];
  }, [autonomyPreset, runtimeModel.providerId]);
  const autonomyDescription = autonomyPreset
    ? listCraneAutonomyOptions({ providerId: runtimeModel.providerId }).find(
        (preset) => preset.value === autonomyPreset,
      )?.description
    : "These access settings no longer match a built-in preset.";
  // The provider being configured, which is independent of the switch: an
  // Advisor can be set up here before it is armed, exactly as in the composer
  // and in Settings.
  const advisorTarget = advisor.targetByProvider[advisor.providerId];
  const advisorModels = useMemo(
    () => advisorModelsForProvider(advisor.providerId, advisorTarget.model),
    [advisor.providerId, advisorTarget.model],
  );
  const providerAvailable =
    providerAvailability[runtimeModel.providerId] !== false;

  // Seeded once per approval from a fresh store read so that changing a Stave
  // setting in another window cannot reset choices already made in this dialog.
  useEffect(() => {
    if (!approval) {
      return;
    }
    const store = useAppStore.getState();
    const currentSettings = store.settings;
    const registeredProjects = store.recentProjects;
    const mappings = currentSettings.craneConnector.projectMappings;
    const mappedProjectPath = findMappedStaveProjectPath({
      issueKey: approval.job.issue.key,
      mappings,
      registeredProjectPaths: registeredProjects.map(
        (project) => project.projectPath,
      ),
    });
    const activeRegisteredProjectPath =
      store.projectPath &&
      registeredProjects.some(
        (project) => project.projectPath === store.projectPath,
      )
        ? store.projectPath
        : null;
    const rememberedRuntime = findMappedCraneTeamRuntime({
      issueKey: approval.job.issue.key,
      mappings,
    });

    setProjectPath(
      mappedProjectPath ??
        activeRegisteredProjectPath ??
        registeredProjects[0]?.projectPath ??
        "",
    );
    setRememberTeamDefaults(
      Boolean(getCraneTeamKey(approval.job.issue.key)),
    );
    setWorkspaceStrategy("new");
    setWorkspaceId("");
    setBranchName(buildCraneDispatchBranchName(approval.job));
    const seededModel = resolveCraneDispatchModelDefaults({
      settings: currentSettings,
      draftProvider: store.draftProvider,
      memory: rememberedRuntime,
      availableModels: modelOptionsRef.current,
    });
    setRuntimeModel(seededModel);
    setAccess(
      resolveCraneDispatchAccessDefaults({
        settings: currentSettings,
        providerId: seededModel.providerId,
        model: seededModel.model,
      }),
    );
    setAdvisor(
      resolveCraneDispatchAdvisorDefaults({
        settings: currentSettings,
        memory: rememberedRuntime,
        // Opposite of the provider running the turn, so the default pick is an
        // actual second opinion rather than the same model twice.
        primaryProviderId: seededModel.providerId,
      }),
    );
    // Decline holds focus so a stray Enter cannot approve a remote-originated
    // job. A single frame is not enough: surfaces behind the dialog (notably
    // the composer) can autofocus a frame or two after it opens and win the
    // race under load. Re-assert only while focus has actually escaped the
    // dialog, so moving between the dialog's own controls is never disturbed.
    let frame = 0;
    const holdInitialFocus = (remainingFrames: number) => {
      const button = declineButtonRef.current;
      if (!button) {
        return;
      }
      const content = button.closest('[role="dialog"]');
      if (content && !content.contains(button.ownerDocument.activeElement)) {
        button.focus();
      }
      if (remainingFrames > 0) {
        frame = window.requestAnimationFrame(() =>
          holdInitialFocus(remainingFrames - 1),
        );
      }
    };
    frame = window.requestAnimationFrame(() => holdInitialFocus(3));
    return () => window.cancelAnimationFrame(frame);
  }, [approval]);

  const changeRuntimeModel = (args: {
    selection: ModelSelectorOption;
    effort?: CraneDispatchModelState["effort"];
    fastMode?: boolean;
  }) => {
    if (args.selection.isAuto) {
      return;
    }
    const providerId = args.selection.providerId;
    const model = args.selection.model;
    setRuntimeModel((current) => ({
      providerId,
      model,
      effort: clampCraneDispatchEffort({
        settings,
        providerId,
        model,
        effort: args.effort ?? current.effort,
      }),
      // The picker resets its internal Fast toggle to `false` whenever it is
      // opened with a non-Codex model selected, so a Claude -> Codex switch
      // reports `fastMode: false` that the user never asked for. An explicit
      // toggle still arrives through `onFastModeChange`.
      codexFastMode:
        current.providerId === "codex" && args.fastMode !== undefined
          ? args.fastMode
          : current.codexFastMode,
    }));
    setAccess((current) =>
      reseedCraneAccessForProvider({
        settings,
        previous: { providerId: runtimeModel.providerId, access: current },
        next: { providerId, model },
      }),
    );
  };

  const decline = async () => {
    if (!approval || submitting) {
      return;
    }
    const declineJob = window.api?.craneConnector?.decline;
    if (!declineJob) {
      toast.error("Crane connector controls are unavailable.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await declineJob({ jobId: approval.job.id });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok) {
        toast.error("Could not decline the Crane job", {
          description: result.message,
        });
        return;
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.info(`Declined ${approval.job.issue.key}`);
    } catch {
      toast.error("Could not decline the Crane job.");
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!approval || submitting) {
      return;
    }
    const approveJob = window.api?.craneConnector?.approve;
    if (!approveJob) {
      toast.error("Crane connector controls are unavailable.");
      return;
    }
    if (!projectPath) {
      toast.error("Choose a registered Stave project.");
      return;
    }
    if (workspaceStrategy === "existing" && !workspaceId) {
      toast.error("Choose an existing workspace.");
      return;
    }
    if (workspaceStrategy === "new" && !branchName.trim()) {
      toast.error("Enter a branch name.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await approveJob({
        jobId: approval.job.id,
        projectPath,
        workspace:
          workspaceStrategy === "new"
            ? { strategy: "new", branchName: branchName.trim() }
            : { strategy: "existing", workspaceId },
        runtime: buildCraneDispatchRuntimeChoice({
          model: runtimeModel,
          access,
          providerTimeoutMs: settings.providerTimeoutMs,
          advisor: resolveCraneDispatchAdvisorChoice({
            advisor,
            consultLimit: settings.advisorConsultLimit,
          }),
        }),
      });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok || !result.workspaceId || !result.taskId) {
        toast.error("Could not start the Crane job", {
          description: result.message,
        });
        return;
      }
      if (craneTeamKey) {
        const store = useAppStore.getState();
        const craneConnector = store.settings.craneConnector;
        store.updateSettings({
          patch: {
            craneConnector: {
              ...craneConnector,
              projectMappings: updateCraneTeamProjectMapping({
                mappings: craneConnector.projectMappings,
                teamKey: craneTeamKey,
                staveProjectPath: rememberTeamDefaults ? projectPath : null,
                runtime: rememberTeamDefaults
                  ? buildCraneTeamRuntimeMemory({
                      model: runtimeModel,
                      advisor,
                    })
                  : null,
              }),
            },
          },
        });
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.success(`Started ${approval.job.issue.key} in Stave`);
      void useAppStore
        .getState()
        .focusTaskAttention({
          projectPath,
          workspaceId: result.workspaceId,
          taskId: result.taskId,
          refreshFromPersistence: true,
        })
        .catch(() => {
          toast.error("The Crane task started, but Stave could not focus it.");
        });
    } catch {
      toast.error("Could not start the Crane job.");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresAt = approval
    ? new Date(approval.job.expiresAt).toLocaleString()
    : "";

  return (
    <Dialog
      open={approval !== null}
      onOpenChange={(open) => {
        if (!open) {
          void decline();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        initialFocus={() => declineButtonRef.current}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 pt-6 pb-5 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
              <Cable className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <DialogTitle>
                Run {approval?.job.issue.key ?? "Crane issue"} in Stave?
              </DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                This request came from your paired Crane account. Nothing
                starts until you approve these local choices.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section
            className="space-y-2 rounded-lg border border-border bg-muted/30 p-4"
            aria-labelledby="crane-dispatch-issue-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="crane-dispatch-issue-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  {approval?.job.issue.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expires {expiresAt}
                </p>
                {jiraReference ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jira {jiraReference.key} takes precedence over the Crane key
                    in the branch name and task title.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const href = approval?.job.issue.href;
                  if (href) {
                    void window.api?.shell
                      ?.openExternal?.({ url: href })
                      .catch(() => {
                        toast.error("Could not open the Crane issue.");
                      });
                  }
                }}
              >
                <ExternalLink className="size-3.5" />
                Open source
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Requested instruction
              </p>
              <p className="whitespace-pre-wrap text-sm leading-5">
                {approval?.job.instruction}
              </p>
            </div>
            {approval?.job.issue.description ? (
              <Accordion className="border-t border-border/60">
                <AccordionItem value="issue-description" className="border-b-0">
                  <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                    Issue description
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
                      {approval.job.issue.description}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="crane-dispatch-target-heading"
          >
            <h3
              id="crane-dispatch-target-heading"
              className="text-sm font-semibold"
            >
              Where it runs
            </h3>
            <div className="grid gap-2">
              <label
                htmlFor="crane-dispatch-project"
                className="text-xs font-medium text-muted-foreground"
              >
                Stave project
              </label>
              <Select value={projectPath} onValueChange={setProjectPath}>
                <SelectTrigger id="crane-dispatch-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem
                      key={project.projectPath}
                      value={project.projectPath}
                    >
                      {project.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {projectPath || "No registered project available"}
              </p>
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="crane-dispatch-workspace-strategy"
                className="text-xs font-medium text-muted-foreground"
              >
                Workspace
              </label>
              <Select
                value={workspaceStrategy}
                onValueChange={(value) =>
                  setWorkspaceStrategy(value as WorkspaceStrategy)
                }
              >
                <SelectTrigger id="crane-dispatch-workspace-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create a new workspace</SelectItem>
                  <SelectItem value="existing">
                    Use an existing workspace
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {workspaceStrategy === "new" ? (
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-branch"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Branch name
                </label>
                <Input
                  id="crane-dispatch-branch"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Based on the selected project&apos;s remote default branch.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-existing-workspace"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Existing workspace
                </label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="crane-dispatch-existing-workspace">
                    <SelectValue placeholder="Choose a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedProject?.workspaces ?? []).map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="crane-dispatch-runtime-heading"
          >
            <h3
              id="crane-dispatch-runtime-heading"
              className="text-sm font-semibold"
            >
              How it runs
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Model and effort
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Same picker as the composer, including reasoning effort.
                </p>
              </div>
              <ModelEffortSelector
                value={selectedModelOption}
                options={modelOptions}
                effortValue={runtimeModel.effort}
                effortLabel={effortLabel}
                fastMode={
                  runtimeModel.providerId === "codex"
                    ? runtimeModel.codexFastMode
                    : undefined
                }
                disabled={submitting}
                onFastModeChange={(enabled) =>
                  setRuntimeModel((current) => ({
                    ...current,
                    codexFastMode: enabled,
                  }))
                }
                onSelect={changeRuntimeModel}
              />
            </div>
            {!providerAvailable ? (
              <p className="text-xs leading-5 text-destructive" role="alert">
                This provider is unavailable. Choose another model before
                approving.
              </p>
            ) : null}

            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Autonomy
              </p>
              <ChoiceButtons
                aria-label="Autonomy"
                value={autonomyPreset ?? "custom"}
                options={autonomyOptions}
                onChange={(value) => {
                  if (value === "custom") {
                    return;
                  }
                  setAccess((current) =>
                    applyCraneAutonomyPreset({
                      providerId: runtimeModel.providerId,
                      presetId: value as "manual" | "guided" | "auto",
                      access: current,
                    }),
                  );
                }}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {autonomyDescription}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {describeCraneAccess({
                  providerId: runtimeModel.providerId,
                  access,
                })}
              </p>
            </div>

            <Accordion className="rounded-lg border border-border px-3">
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  Advanced
                </AccordionTrigger>
                <AccordionContent className="grid gap-3 pb-3">
                  {runtimeModel.providerId === "claude-code" ? (
                    <>
                      <div className="grid gap-2">
                        <label
                          htmlFor="crane-dispatch-claude-permissions"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Claude permission mode
                        </label>
                        <Select
                          value={access.claudePermissionMode}
                          onValueChange={(value) =>
                            setAccess((current) => ({
                              ...current,
                              claudePermissionMode:
                                value as CraneDispatchAccessState["claudePermissionMode"],
                            }))
                          }
                        >
                          <SelectTrigger id="crane-dispatch-claude-permissions">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLAUDE_PERMISSION_MODE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="crane-dispatch-claude-sandbox"
                          className="text-sm"
                        >
                          Claude sandbox
                        </label>
                        <Switch
                          id="crane-dispatch-claude-sandbox"
                          checked={access.claudeSandboxEnabled}
                          onCheckedChange={(checked) =>
                            setAccess((current) => ({
                              ...current,
                              claudeSandboxEnabled: checked,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="crane-dispatch-claude-unsandboxed"
                          className="text-sm"
                        >
                          Allow unsandboxed commands
                        </label>
                        <Switch
                          id="crane-dispatch-claude-unsandboxed"
                          checked={access.claudeAllowUnsandboxedCommands}
                          onCheckedChange={(checked) =>
                            setAccess((current) => ({
                              ...current,
                              claudeAllowUnsandboxedCommands: checked,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <label
                            htmlFor="crane-dispatch-codex-files"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            File access
                          </label>
                          <Select
                            value={access.codexFileAccess}
                            onValueChange={(value) =>
                              setAccess((current) => ({
                                ...current,
                                codexFileAccess:
                                  value as CraneDispatchAccessState["codexFileAccess"],
                              }))
                            }
                          >
                            <SelectTrigger id="crane-dispatch-codex-files">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CODEX_SANDBOX_MODE_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="crane-dispatch-codex-approval"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Approval policy
                          </label>
                          <Select
                            value={access.codexApprovalPolicy}
                            onValueChange={(value) =>
                              setAccess((current) => ({
                                ...current,
                                codexApprovalPolicy:
                                  value as CraneDispatchAccessState["codexApprovalPolicy"],
                              }))
                            }
                          >
                            <SelectTrigger id="crane-dispatch-codex-approval">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CODEX_APPROVAL_POLICY_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label
                          htmlFor="crane-dispatch-codex-web-search"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Web search
                        </label>
                        <Select
                          value={access.codexWebSearch}
                          onValueChange={(value) =>
                            setAccess((current) => ({
                              ...current,
                              codexWebSearch:
                                value as CraneDispatchAccessState["codexWebSearch"],
                            }))
                          }
                        >
                          <SelectTrigger id="crane-dispatch-codex-web-search">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CODEX_WEB_SEARCH_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="crane-dispatch-codex-network"
                          className="text-sm"
                        >
                          Network access
                        </label>
                        <Switch
                          id="crane-dispatch-codex-network"
                          checked={access.codexNetworkAccess}
                          onCheckedChange={(checked) =>
                            setAccess((current) => ({
                              ...current,
                              codexNetworkAccess: checked,
                            }))
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <label
                        htmlFor="crane-dispatch-advisor"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Advisor
                      </label>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Lets the primary consult an isolated read-only Advisor
                        on demand, adding a model call per consult.
                      </p>
                    </div>
                    <Switch
                      id="crane-dispatch-advisor"
                      checked={advisor.enabled}
                      onCheckedChange={(checked) =>
                        setAdvisor((current) => ({
                          ...current,
                          enabled: checked,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Advisor provider
                    </p>
                    <ChoiceButtons
                      aria-label="Advisor provider"
                      value={advisor.providerId}
                      options={buildAdvisorProviderOptions().map((option) => ({
                        value: option.id,
                        label: option.label,
                        icon: (
                          <ModelIcon
                            providerId={option.id}
                            className="size-3.5"
                          />
                        ),
                      }))}
                      onChange={(providerId) =>
                        // Non-destructive: each provider keeps its own model
                        // and tier, so switching back restores the other pick
                        // instead of resetting it to the catalog default.
                        setAdvisor((current) => ({
                          ...current,
                          providerId,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label
                      htmlFor="crane-dispatch-advisor-model"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      {getProviderLabel({ providerId: advisor.providerId })}{" "}
                      Advisor model
                    </label>
                    <Select
                      value={advisorTarget.model}
                      onValueChange={(model) =>
                        setAdvisor((current) =>
                          selectCraneDispatchAdvisorTarget({
                            advisor: current,
                            target: {
                              providerId: current.providerId,
                              model,
                              // Switching model must not silently drop the
                              // pinned tier; an unsupported one is clamped at
                              // resolution time instead.
                              ...(advisorTarget.effort
                                ? { effort: advisorTarget.effort }
                                : {}),
                            },
                          }),
                        )
                      }
                    >
                      <SelectTrigger id="crane-dispatch-advisor-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {advisorModels.map((value) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex min-w-0 items-center gap-2">
                              <ModelIcon
                                providerId={advisor.providerId}
                                model={value}
                                className="size-3.5"
                              />
                              <span className="truncate">
                                {toHumanModelName({ model: value })}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Advisor effort
                    </p>
                    <ChoiceButtons
                      aria-label="Advisor effort"
                      value={
                        resolveAdvisorEffortSelection(advisorTarget) ??
                        ADVISOR_EFFORT_AUTO_VALUE
                      }
                      options={buildAdvisorEffortOptions(advisorTarget).map(
                        (option) => ({
                          value: option.value ?? ADVISOR_EFFORT_AUTO_VALUE,
                          label: option.label,
                        }),
                      )}
                      onChange={(value) =>
                        setAdvisor((current) =>
                          selectCraneDispatchAdvisorTarget({
                            advisor: current,
                            target: {
                              providerId: current.providerId,
                              model: advisorTarget.model,
                              ...(value === ADVISOR_EFFORT_AUTO_VALUE
                                ? {}
                                : { effort: value as AdvisorEffort }),
                            },
                          }),
                        )
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {advisorTarget.effort &&
                      isAdvisorEffortClamped(advisorTarget)
                        ? `${toHumanModelName({
                            model: advisorTarget.model,
                          })} does not accept ${formatAdvisorEffortLabel(
                            advisorTarget.effort,
                          )}, so the Advisor runs at ${formatAdvisorEffortLabel(
                            resolveAdvisorEffort(advisorTarget),
                          )}.`
                        : `The primary waits on each consult, so this is a latency-per-consult choice. Runs at ${formatAdvisorEffortLabel(
                            resolveAdvisorEffort(advisorTarget),
                          )}, up to ${settings.advisorConsultLimit} consults per turn.`}
                    </p>
                  </div>

                  <p className="text-xs leading-5 text-muted-foreground">
                    Provider timeout{" "}
                    {formatProviderTimeoutLabel(settings.providerTimeoutMs)},
                    from your Stave provider settings.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {craneTeamKey ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <label
                    htmlFor="crane-dispatch-remember-project"
                    className="text-sm font-medium text-foreground"
                  >
                    Remember for {craneTeamKey} issues
                  </label>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Stored only in Stave. Future {craneTeamKey} jobs preselect
                    this project, model, effort, and Advisor. Access settings
                    always re-derive from your current Stave settings.
                  </p>
                </div>
                <Switch
                  id="crane-dispatch-remember-project"
                  checked={rememberTeamDefaults}
                  onCheckedChange={setRememberTeamDefaults}
                  aria-label={`Remember for ${craneTeamKey} issues`}
                />
              </div>
            ) : null}
          </section>

          <section className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-xs leading-5">
              <p className="font-medium text-foreground">
                Status-only reporting
              </p>
              <p className="text-muted-foreground">
                Crane receives lifecycle state, sequence, timestamps, and safe
                error codes only. Prompts, responses, reasoning, files, paths,
                diffs, and credentials stay local.
              </p>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">
            {rememberTeamDefaults && craneTeamKey
              ? "Run approval is job-scoped; only these local team defaults are remembered."
              : "Approval applies to this job only."}
          </span>
          <Button
            ref={declineButtonRef}
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void decline()}
          >
            Decline
          </Button>
          <Button
            type="button"
            disabled={
              submitting ||
              !projectPath ||
              !runtimeModel.model ||
              // Approving with an unavailable provider fails inside the host
              // runtime, and that failure is terminal for the Crane job.
              !providerAvailable
            }
            onClick={() => void approve()}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve and run locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
