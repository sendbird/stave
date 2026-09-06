import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useShallow } from "zustand/react/shallow";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  ModelSelector,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { resolveDefaultCreateWorkspaceBaseBranch } from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import {
  buildKickoffFirstTaskRuntimeOverrides,
  canApplyKickoffDialogOpenChange,
} from "@/components/layout/KickoffDialog.utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listProviderIdsForCapability,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  buildDeterministicKickoffProposal,
  classifyKickoffSource,
  type KickoffPanelEntry,
  type KickoffProposalDraft,
} from "@/lib/workspace-kickoff";
import { WORKSPACE_INFORMATION_SECTION_LABELS } from "@/lib/workspace-information-sections";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { sanitizeBranchName } from "@/store/project.utils";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "@/components/layout/kickoff-dialog.styles";
import { useAppStore, type AppSettings } from "@/store/app.store";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

type KickoffPhase = "source" | "preview";
type ClaudeTaskEffort = NonNullable<
  PromptDraftRuntimeOverrides["claudeEffort"]
>;
type CodexTaskEffort = NonNullable<
  PromptDraftRuntimeOverrides["codexReasoningEffort"]
>;
type FirstTaskEffort = ClaudeTaskEffort | CodexTaskEffort;
const KICKOFF_PROVIDER_IDS = listProviderIdsForCapability({
  capability: "unattendedRuns",
});

function resolveFirstTaskEffort(args: {
  settings: AppSettings;
  providerId: ProviderId;
  model: string;
}): FirstTaskEffort {
  const runtimeSettings = applyModelRuntimePreference({
    settings: args.settings,
    providerId: args.providerId,
    model: args.model,
  });
  return args.providerId === "claude-code"
    ? runtimeSettings.claudeEffort
    : runtimeSettings.codexReasoningEffort;
}

function resolveFirstTaskFastMode(args: {
  settings: AppSettings;
  providerId: ProviderId;
  model: string;
}) {
  if (args.providerId !== "codex") {
    return false;
  }
  return applyModelRuntimePreference({
    settings: args.settings,
    providerId: args.providerId,
    model: args.model,
  }).codexFastMode;
}

function KickoffBusyState(props: {
  mode: "resolving" | "creating";
  sourceType?: string;
}) {
  const resolving = props.mode === "resolving";
  return (
    <div
      className={sx(kickoffStyles.busyState)}
      role="status"
      aria-live="polite"
    >
      <div className={sx(kickoffStyles.busyOrb)}>
        <ThinkingOrb
          state={resolving ? "searching" : "shaping"}
          size={64}
          aria-hidden="true"
        />
      </div>
      <h3 className={sx(kickoffStyles.busyTitle)}>
        {resolving ? "Resolving kickoff context" : "Creating your workspace"}
      </h3>
      <p className={sx(kickoffStyles.busyCopy)}>
        {resolving
          ? "Stave is reading the source and preparing an editable workspace proposal."
          : "Stave is creating the worktree, seeding its context, and preparing the first task."}
      </p>
      {props.sourceType ? (
        <Badge variant="secondary" className={sx(kickoffStyles.busyBadge)}>
          {props.sourceType}
        </Badge>
      ) : null}
    </div>
  );
}

function resolveSelectedBranchKind(args: {
  branch: string;
  remoteBranches: string[];
}): "local" | "remote" {
  return args.remoteBranches.includes(args.branch) ? "remote" : "local";
}

function panelTargetLabel(target: KickoffPanelEntry["target"]) {
  switch (target) {
    case "jiraIssues":
      return WORKSPACE_INFORMATION_SECTION_LABELS.jira;
    case "confluencePages":
      return WORKSPACE_INFORMATION_SECTION_LABELS.confluence;
    case "figmaResources":
      return WORKSPACE_INFORMATION_SECTION_LABELS.figma;
    case "slackThreads":
      return WORKSPACE_INFORMATION_SECTION_LABELS.slack;
    case "linkedPullRequests":
      return WORKSPACE_INFORMATION_SECTION_LABELS.github;
    case "storybookResources":
      return WORKSPACE_INFORMATION_SECTION_LABELS.storybook;
    case "amplifyLinks":
      return WORKSPACE_INFORMATION_SECTION_LABELS.amplify;
  }
}

export function KickoffDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [
    projectPath,
    activeWorkspaceId,
    workspaceBranchById,
    workspacePathById,
    defaultBranch,
    sourceConfigs,
    draftProvider,
    settings,
    providerAvailability,
    resolveKickoffProposal,
    cancelKickoffResolution,
    kickoffWorkspace,
  ] = useAppStore(
    useShallow((state) => [
      state.projectPath,
      state.activeWorkspaceId,
      state.workspaceBranchById,
      state.workspacePathById,
      state.defaultBranch,
      state.settings.kickoffSourceConfigs,
      state.draftProvider,
      state.settings,
      state.providerAvailability,
      state.resolveKickoffProposal,
      state.cancelKickoffResolution,
      state.kickoffWorkspace,
    ]),
  );
  const defaultFirstTaskModel =
    draftProvider === "claude-code"
      ? settings.modelClaude
      : settings.modelCodex;
  const defaultFirstTaskEffort = resolveFirstTaskEffort({
    settings,
    providerId: draftProvider,
    model: defaultFirstTaskModel,
  });
  const defaultFirstTaskFastMode = resolveFirstTaskFastMode({
    settings,
    providerId: draftProvider,
    model: defaultFirstTaskModel,
  });
  const [phase, setPhase] = useState<KickoffPhase>("source");
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<KickoffProposalDraft | null>(null);
  const [resolving, setResolving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredMcpServers, setDiscoveredMcpServers] = useState<Set<string>>(
    new Set(),
  );
  const [mcpDiscoveryPending, setMcpDiscoveryPending] = useState(false);
  const [fromBranch, setFromBranch] = useState(defaultBranch || "main");
  const [fromBranchKind, setFromBranchKind] = useState<"local" | "remote">(
    "local",
  );
  const [localBranches, setLocalBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [startFirstTask, setStartFirstTask] = useState(true);
  const [firstTaskProvider, setFirstTaskProvider] =
    useState<ProviderId>(draftProvider);
  const [firstTaskModel, setFirstTaskModel] = useState(defaultFirstTaskModel);
  const [firstTaskEffort, setFirstTaskEffort] = useState<FirstTaskEffort>(
    defaultFirstTaskEffort,
  );
  const [firstTaskFastMode, setFirstTaskFastMode] = useState(
    defaultFirstTaskFastMode,
  );
  const [extraInstructions, setExtraInstructions] = useState("");

  const activeBranch = workspaceBranchById[activeWorkspaceId] ?? defaultBranch;
  const activeWorkspacePath =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const classification = useMemo(
    () => classifyKickoffSource({ input: source, configs: sourceConfigs }),
    [source, sourceConfigs],
  );
  const requiredMcpServers = classification.config?.mcpServers ?? [];
  const missingMcpServers = requiredMcpServers.filter(
    (server) => !discoveredMcpServers.has(server.toLowerCase()),
  );
  const sanitizedBranchName = sanitizeBranchName({
    value: draft?.branchName ?? "",
  });
  const codexModelCatalog = useCodexModelCatalog({
    enabled: props.open,
    codexBinaryPath: settings.codexBinaryPath,
  });
  const firstTaskModelOptions = useMemo<ModelSelectorOption[]>(
    () =>
      buildModelSelectorOptions({
        providerIds: KICKOFF_PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: { codex: codexModelCatalog.models },
      }),
    [codexModelCatalog.models, providerAvailability],
  );
  const selectedFirstTaskModel = useMemo(
    () =>
      buildModelSelectorValue({
        providerId: firstTaskProvider,
        model: firstTaskModel,
        available: providerAvailability[firstTaskProvider],
      }),
    [firstTaskModel, firstTaskProvider, providerAvailability],
  );
  const firstTaskEffortOptions =
    firstTaskProvider === "claude-code"
      ? CLAUDE_EFFORT_OPTIONS
      : listCodexEffortOptionsForModel({ model: firstTaskModel });
  const effectiveFirstTaskEffort = firstTaskEffortOptions.some(
    (option) => option.value === firstTaskEffort,
  )
    ? firstTaskEffort
    : resolveFirstTaskEffort({
        settings,
        providerId: firstTaskProvider,
        model: firstTaskModel,
      });
  const firstTaskProviderAvailable =
    providerAvailability[firstTaskProvider] !== false;
  const busy = resolving || creating;

  useEffect(() => {
    if (props.open) {
      return;
    }
    cancelKickoffResolution();
    setPhase("source");
    setSource("");
    setDraft(null);
    setResolving(false);
    setCreating(false);
    setError(null);
    setStartFirstTask(true);
    setFirstTaskProvider(draftProvider);
    setFirstTaskModel(defaultFirstTaskModel);
    setFirstTaskEffort(defaultFirstTaskEffort);
    setFirstTaskFastMode(defaultFirstTaskFastMode);
    setExtraInstructions("");
  }, [
    cancelKickoffResolution,
    defaultFirstTaskEffort,
    defaultFirstTaskFastMode,
    defaultFirstTaskModel,
    draftProvider,
    props.open,
  ]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    let cancelled = false;
    const discoverMcpServers = window.api?.provider?.discoverMcpServers;
    if (discoverMcpServers) {
      setMcpDiscoveryPending(true);
      void discoverMcpServers({ cwd: projectPath ?? undefined })
        .then((result) => {
          if (cancelled) {
            return;
          }
          setDiscoveredMcpServers(
            new Set(result.servers.map((server) => server.name.toLowerCase())),
          );
        })
        .catch(() => {
          if (!cancelled) {
            setDiscoveredMcpServers(new Set());
          }
        })
        .finally(() => {
          if (!cancelled) {
            setMcpDiscoveryPending(false);
          }
        });
    }

    const fallbackBranch = resolveDefaultCreateWorkspaceBaseBranch({
      activeBranch,
      defaultBranch,
      localBranches: [],
      remoteBranches: [],
    });
    setFromBranch(fallbackBranch);
    setFromBranchKind("local");
    const listBranches = window.api?.sourceControl?.listBranches;
    if (listBranches) {
      setLoadingBranches(true);
      void listBranches({ cwd: activeWorkspacePath, refreshRemote: true })
        .then((result) => {
          if (!result.ok || cancelled) {
            return;
          }
          const nextLocalBranches = result.branches;
          const nextRemoteBranches = result.remoteBranches ?? [];
          const nextFromBranch = resolveDefaultCreateWorkspaceBaseBranch({
            activeBranch,
            defaultBranch,
            localBranches: nextLocalBranches,
            remoteBranches: nextRemoteBranches,
          });
          setLocalBranches(nextLocalBranches);
          setRemoteBranches(nextRemoteBranches);
          setFromBranch(nextFromBranch);
          setFromBranchKind(
            resolveSelectedBranchKind({
              branch: nextFromBranch,
              remoteBranches: nextRemoteBranches,
            }),
          );
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setLoadingBranches(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeBranch,
    activeWorkspacePath,
    defaultBranch,
    projectPath,
    props.open,
  ]);

  function closeDialog() {
    cancelKickoffResolution();
    props.onOpenChange(false);
  }

  async function handleResolve() {
    if (!source.trim() || resolving) {
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const result = await resolveKickoffProposal({ input: source });
      if (!result.ok || !result.proposal) {
        setError(result.message ?? "Unable to resolve the kickoff source.");
        return;
      }
      setDraft(result.proposal);
      setPhase("preview");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to resolve the kickoff source.",
      );
    } finally {
      setResolving(false);
    }
  }

  function handleSkipAi() {
    if (!source.trim()) {
      return;
    }
    setDraft(buildDeterministicKickoffProposal({ classification }));
    setError(null);
    setPhase("preview");
  }

  function handleFirstTaskModelSelect(selection: ModelSelectorOption) {
    setFirstTaskProvider(selection.providerId);
    setFirstTaskModel(selection.model);
    setFirstTaskEffort(
      resolveFirstTaskEffort({
        settings,
        providerId: selection.providerId,
        model: selection.model,
      }),
    );
    setFirstTaskFastMode(
      resolveFirstTaskFastMode({
        settings,
        providerId: selection.providerId,
        model: selection.model,
      }),
    );
  }

  async function handleCreate() {
    if (
      !draft ||
      !sanitizedBranchName ||
      creating ||
      (startFirstTask && !firstTaskProviderAvailable)
    ) {
      return;
    }
    const firstTaskRuntimeOverrides = buildKickoffFirstTaskRuntimeOverrides({
      providerId: firstTaskProvider,
      model: firstTaskModel,
      effort: effectiveFirstTaskEffort,
      codexFastMode: firstTaskFastMode,
    });
    setCreating(true);
    setError(null);
    try {
      const result = await kickoffWorkspace({
        proposal: { ...draft, branchName: sanitizedBranchName },
        fromBranch,
        fromBranchKind,
        startFirstTask,
        firstTaskProvider,
        firstTaskRuntimeOverrides,
        extraInstructions,
      });
      if (!result.ok) {
        setError(result.message ?? "Unable to create the workspace.");
        return;
      }
      if (result.noticeLevel === "warning" && result.message) {
        toast.warning("Workspace created with warning", {
          description: result.message,
        });
      } else {
        toast.success("Workspace created from kickoff source");
      }
      props.onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the workspace.",
      );
    } finally {
      setCreating(false);
    }
  }

  function patchPanelEntry(index: number, patch: Partial<KickoffPanelEntry>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            panelEntries: current.panelEntries.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, ...patch } : entry,
            ),
          }
        : current,
    );
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open, eventDetails) => {
        if (!canApplyKickoffDialogOpenChange({ open, busy })) {
          eventDetails.cancel();
          return;
        }
        if (open) {
          props.onOpenChange(true);
          return;
        }
        closeDialog();
      }}
    >
      <DialogContent
        xstyle={kickoffStyles.surface}
        showCloseButton={!busy}
        aria-busy={busy}
      >
        <DialogHeader className={sx(kickoffStyles.header)}>
          <div className={sx(kickoffStyles.headerRow)}>
            <div className={sx(kickoffStyles.headerMark)}>
              <Rocket className={sx(kickoffStyles.headerMarkIcon)} />
            </div>
            <div className={sx(kickoffStyles.headerCopy)}>
              <DialogTitle>Kick off workspace</DialogTitle>
              <DialogDescription
                className={sx(kickoffStyles.headerDescription)}
              >
                {phase === "source"
                  ? "Turn a work source into an editable workspace proposal."
                  : "Review what Stave found before creating the worktree."}
              </DialogDescription>
            </div>
          </div>
          <div
            className={sx(kickoffStyles.steps)}
            aria-label="Kickoff progress"
          >
            <span
              className={sx(
                phase === "source"
                  ? kickoffStyles.stepActive
                  : kickoffStyles.stepIdle,
              )}
              aria-current={phase === "source" ? "step" : undefined}
            >
              1. Source
            </span>
            <span className={sx(kickoffStyles.stepDivider)} aria-hidden="true" />
            <span
              className={sx(
                phase === "preview"
                  ? kickoffStyles.stepActive
                  : kickoffStyles.stepIdle,
              )}
              aria-current={phase === "preview" ? "step" : undefined}
            >
              2. Review
            </span>
          </div>
        </DialogHeader>

        {resolving ? (
          <>
            <KickoffBusyState
              mode="resolving"
              sourceType={classification.config?.label ?? "Free-form prompt"}
            />
            <DialogFooter className={sx(kickoffStyles.footer)}>
              <Button
                type="button"
                variant="outline"
                onClick={() => cancelKickoffResolution()}
              >
                Cancel resolution
              </Button>
            </DialogFooter>
          </>
        ) : creating ? (
          <>
            <KickoffBusyState mode="creating" />
            <div className={sx(kickoffStyles.creatingNote)}>
              Keep Stave open while the worktree is prepared.
            </div>
          </>
        ) : phase === "source" ? (
          <>
            <div className={sx(kickoffStyles.scroll)}>
              <div className={sx(kickoffStyles.sourceStack)}>
                <div className={sx(kickoffStyles.field)}>
                  <div className={sx(kickoffStyles.fieldHeaderRow)}>
                    <label
                      htmlFor="kickoff-source"
                      className={sx(kickoffStyles.label)}
                    >
                      Work source
                    </label>
                    <Badge variant="outline">
                      {classification.config?.label ?? "Free-form prompt"}
                    </Badge>
                  </div>
                  <Textarea
                    id="kickoff-source"
                    autoFocus
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Paste a Jira issue, Slack thread, PRD, Figma link, report, or describe the work…"
                    xstyle={kickoffStyles.sourceTextarea}
                  />
                  <p className={sx(kickoffStyles.hint)}>
                    Stave will extract the workspace name, branch, linked
                    context, and a ready-to-run first task.
                  </p>
                </div>

                {requiredMcpServers.length > 0 ? (
                  <div className={sx(kickoffStyles.mcpPanel)}>
                    <div className={sx(kickoffStyles.mcpHeading)}>
                      {missingMcpServers.length === 0 &&
                      !mcpDiscoveryPending ? (
                        <CheckCircle2
                          className={sx(kickoffStyles.successIcon)}
                        />
                      ) : (
                        <AlertTriangle
                          className={sx(kickoffStyles.warningIcon)}
                        />
                      )}
                      MCP dependencies
                    </div>
                    <div className={sx(kickoffStyles.mcpBadges)}>
                      {requiredMcpServers.map((server) => {
                        const available = discoveredMcpServers.has(
                          server.toLowerCase(),
                        );
                        return (
                          <Badge
                            key={server}
                            variant={available ? "secondary" : "outline"}
                          >
                            {server} ·{" "}
                            {available
                              ? "found"
                              : mcpDiscoveryPending
                                ? "checking"
                                : "missing"}
                          </Badge>
                        );
                      })}
                    </div>
                    {missingMcpServers.length > 0 && !mcpDiscoveryPending ? (
                      <p className={sx(kickoffStyles.hintSpaced)}>
                        Missing servers do not block creation. Resolution falls
                        back to the source text and URL metadata.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p className={sx(kickoffStyles.error)} role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className={sx(kickoffStyles.footer)}>
              <Button
                type="button"
                variant="outline"
                disabled={!source.trim()}
                onClick={handleSkipAi}
              >
                Skip AI
              </Button>
              <Button
                type="button"
                disabled={!source.trim()}
                onClick={() => void handleResolve()}
              >
                <Sparkles className={sx(kickoffStyles.buttonIcon)} />
                Resolve source
              </Button>
            </DialogFooter>
          </>
        ) : draft ? (
          <>
            <div className={sx(kickoffStyles.scroll)}>
              <div className={sx(kickoffStyles.previewStack)}>
                {draft.degraded ? (
                  <div className={sx(kickoffStyles.degradedNote)}>
                    <AlertTriangle className={sx(kickoffStyles.degradedIcon)} />
                    <p className={sx(kickoffStyles.degradedCopy)}>
                      This proposal uses deterministic URL and text parsing.
                      Review the fields before creating the workspace.
                    </p>
                  </div>
                ) : null}

                <section
                  className={sx(kickoffStyles.section)}
                  aria-labelledby="kickoff-workspace-heading"
                >
                  <div>
                    <h3
                      id="kickoff-workspace-heading"
                      className={sx(kickoffStyles.sectionTitle)}
                    >
                      Workspace details
                    </h3>
                    <p className={sx(kickoffStyles.sectionCopy)}>
                      Confirm where the worktree starts and how it appears in
                      Stave.
                    </p>
                  </div>
                  <div className={sx(kickoffStyles.twoColumn)}>
                    <label className={sx(kickoffStyles.labeledField)}>
                      Branch name
                      <Input
                        value={draft.branchName}
                        onChange={(event) =>
                          setDraft({ ...draft, branchName: event.target.value })
                        }
                        aria-invalid={!sanitizedBranchName}
                        xstyle={kickoffStyles.monoInput}
                      />
                      <span className={sx(kickoffStyles.fieldNote)}>
                        {sanitizedBranchName
                          ? `Creates ${sanitizedBranchName}`
                          : "Enter a valid git branch name."}
                      </span>
                    </label>
                    <label className={sx(kickoffStyles.labeledField)}>
                      Workspace label
                      <Input
                        value={draft.workspaceLabel}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            workspaceLabel: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className={sx(kickoffStyles.field)}>
                    <p className={sx(kickoffStyles.label)}>Base branch</p>
                    <CreateWorkspaceBranchPicker
                      value={fromBranch}
                      valueScope={fromBranchKind}
                      defaultBranch={defaultBranch}
                      localBranches={localBranches}
                      remoteBranches={remoteBranches}
                      loading={loadingBranches}
                      onChange={setFromBranch}
                      onChangeOption={(option) =>
                        setFromBranchKind(option.scope)
                      }
                    />
                  </div>
                  <label className={sx(kickoffStyles.labeledField)}>
                    Source summary
                    <Textarea
                      value={draft.sourceSummary}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          sourceSummary: event.target.value,
                        })
                      }
                      xstyle={kickoffStyles.summaryTextarea}
                    />
                  </label>
                </section>

                <section
                  className={sx(kickoffStyles.section)}
                  aria-labelledby="kickoff-information-heading"
                >
                  <div className={sx(kickoffStyles.sectionHeaderRow)}>
                    <div>
                      <h3
                        id="kickoff-information-heading"
                        className={sx(kickoffStyles.sectionTitle)}
                      >
                        Linked context
                      </h3>
                      <p className={sx(kickoffStyles.sectionCopy)}>
                        These items will be added to the workspace Information
                        panel.
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {draft.panelEntries.length}{" "}
                      {draft.panelEntries.length === 1 ? "item" : "items"}
                    </Badge>
                  </div>
                  {draft.panelEntries.length === 0 ? (
                    <p className={sx(kickoffStyles.emptyNote)}>
                      No structured items were found. The source remains in the
                      first task prompt.
                    </p>
                  ) : (
                    <Accordion multiple>
                      {draft.panelEntries.map((entry, index) => (
                        <AccordionItem
                          key={`${entry.target}-${entry.url}-${index}`}
                          value={`${entry.target}-${index}`}
                          className={sx(kickoffStyles.entryItem)}
                        >
                          <div className={sx(kickoffStyles.entryHeaderRow)}>
                            <AccordionTrigger>
                              <span
                                className={sx(kickoffStyles.entryTriggerLabel)}
                              >
                                <Badge
                                  variant="outline"
                                  className={sx(kickoffStyles.entryBadge)}
                                >
                                  {panelTargetLabel(entry.target)}
                                </Badge>
                                <span className={sx(kickoffStyles.entryText)}>
                                  <span
                                    className={sx(kickoffStyles.entryTitle)}
                                  >
                                    {entry.title || "Untitled item"}
                                  </span>
                                  <span className={sx(kickoffStyles.entryMeta)}>
                                    {entry.reference || entry.url}
                                  </span>
                                </span>
                              </span>
                            </AccordionTrigger>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              xstyle={kickoffStyles.entryRemove}
                              aria-label={`Remove ${panelTargetLabel(entry.target)} item`}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  panelEntries: draft.panelEntries.filter(
                                    (_, entryIndex) => entryIndex !== index,
                                  ),
                                })
                              }
                            >
                              <Trash2 className={sx(kickoffStyles.smallIcon)} />
                            </Button>
                          </div>
                          <AccordionContent
                            className={sx(kickoffStyles.entryPanel)}
                          >
                            <div className={sx(kickoffStyles.entryPanelGrid)}>
                              <label
                                className={sx(kickoffStyles.labeledFieldTight)}
                              >
                                Title
                                <Input
                                  value={entry.title}
                                  onChange={(event) =>
                                    patchPanelEntry(index, {
                                      title: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label
                                className={sx(kickoffStyles.labeledFieldTight)}
                              >
                                Reference
                                <Input
                                  value={entry.reference}
                                  onChange={(event) =>
                                    patchPanelEntry(index, {
                                      reference: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label
                              className={sx(kickoffStyles.labeledFieldTight)}
                            >
                              URL
                              <Input
                                value={entry.url}
                                onChange={(event) =>
                                  patchPanelEntry(index, {
                                    url: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label
                              className={sx(kickoffStyles.labeledFieldTight)}
                            >
                              Note
                              <Textarea
                                value={entry.note}
                                onChange={(event) =>
                                  patchPanelEntry(index, {
                                    note: event.target.value,
                                  })
                                }
                                xstyle={kickoffStyles.noteTextarea}
                              />
                            </label>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                  <div className={sx(kickoffStyles.splitSection)}>
                    <label className={sx(kickoffStyles.labeledField)}>
                      Notes
                      <Textarea
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft({ ...draft, notes: event.target.value })
                        }
                        placeholder="Optional workspace notes"
                        xstyle={kickoffStyles.notesTextarea}
                      />
                    </label>
                    <div className={sx(kickoffStyles.field)}>
                      <div className={sx(kickoffStyles.todoHeaderRow)}>
                        <p className={sx(kickoffStyles.label)}>Todos</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          xstyle={kickoffStyles.todoAddButton}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              todos: [...draft.todos, ""],
                            })
                          }
                        >
                          <Plus className={sx(kickoffStyles.smallIcon)} />
                          Add todo
                        </Button>
                      </div>
                      {draft.todos.length === 0 ? (
                        <p className={sx(kickoffStyles.emptyNoteSmall)}>
                          No todos in this proposal.
                        </p>
                      ) : (
                        <div className={sx(kickoffStyles.todoList)}>
                          {draft.todos.map((todo, index) => (
                            <div
                              key={index}
                              className={sx(kickoffStyles.todoRow)}
                            >
                              <Input
                                value={todo}
                                aria-label={`Todo ${index + 1}`}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    todos: draft.todos.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? event.target.value
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove todo ${index + 1}`}
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    todos: draft.todos.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  })
                                }
                              >
                                <Trash2 className={sx(kickoffStyles.smallIcon)} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section
                  className={sx(kickoffStyles.section)}
                  aria-labelledby="kickoff-task-heading"
                >
                  <div className={sx(kickoffStyles.sectionHeaderRowWide)}>
                    <div>
                      <h3
                        id="kickoff-task-heading"
                        className={sx(kickoffStyles.sectionTitle)}
                      >
                        First task
                      </h3>
                      <p className={sx(kickoffStyles.sectionCopy)}>
                        Choose how the task will run, then refine its prompt.
                      </p>
                    </div>
                    <div className={sx(kickoffStyles.startToggle)}>
                      <label
                        htmlFor="kickoff-start-task"
                        className={sx(kickoffStyles.label)}
                      >
                        Start now
                      </label>
                      <Switch
                        id="kickoff-start-task"
                        checked={startFirstTask}
                        onCheckedChange={setStartFirstTask}
                      />
                    </div>
                  </div>
                  <div
                    className={sx(
                      firstTaskProvider === "codex"
                        ? kickoffStyles.runtimeGridWithFast
                        : kickoffStyles.runtimeGrid,
                    )}
                  >
                    <div className={sx(kickoffStyles.field)}>
                      <p className={sx(kickoffStyles.label)}>Model</p>
                      <ModelSelector
                        value={selectedFirstTaskModel}
                        options={firstTaskModelOptions}
                        disabled={creating}
                        onSelect={({ selection }) =>
                          handleFirstTaskModelSelect(selection)
                        }
                        className={sx(kickoffStyles.fullWidth)}
                        triggerClassName={sx(
                          kickoffStyles.modelSelectorTrigger,
                        )}
                        triggerAriaLabel={`First task model: ${selectedFirstTaskModel.label}`}
                        menuClassName={sx(kickoffStyles.modelSelectorMenu)}
                      />
                    </div>
                    <div className={sx(kickoffStyles.field)}>
                      <p
                        id="kickoff-first-task-effort-label"
                        className={sx(kickoffStyles.label)}
                      >
                        Effort
                      </p>
                      <Select
                        value={effectiveFirstTaskEffort}
                        onValueChange={(value) =>
                          setFirstTaskEffort(value as FirstTaskEffort)
                        }
                      >
                        <SelectTrigger
                          className={sx(kickoffStyles.fullWidth)}
                          aria-labelledby="kickoff-first-task-effort-label"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {firstTaskEffortOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {firstTaskProvider === "codex" ? (
                      <div className={sx(kickoffStyles.field)}>
                        <p
                          id="kickoff-first-task-fast-label"
                          className={sx(kickoffStyles.label)}
                        >
                          Fast mode
                        </p>
                        <Select
                          value={firstTaskFastMode ? "on" : "off"}
                          onValueChange={(value) =>
                            setFirstTaskFastMode(value === "on")
                          }
                        >
                          <SelectTrigger
                            className={sx(kickoffStyles.fullWidth)}
                            aria-labelledby="kickoff-first-task-fast-label"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="off">Off</SelectItem>
                            <SelectItem value="on">On</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                  {!firstTaskProviderAvailable ? (
                    <p className={sx(kickoffStyles.errorHint)} role="alert">
                      This provider is unavailable. Choose another model before
                      starting the task.
                    </p>
                  ) : (
                    <p className={sx(kickoffStyles.hint)}>
                      {firstTaskProvider === "codex"
                        ? "The model, effort, and Fast mode stay attached to this task, even if you leave the prompt ready instead of starting now."
                        : "The model and effort stay attached to this task, even if you leave the prompt ready instead of starting now."}
                    </p>
                  )}
                  <label className={sx(kickoffStyles.labeledField)}>
                    Task title
                    <Input
                      value={draft.firstTaskTitle}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          firstTaskTitle: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className={sx(kickoffStyles.labeledField)}>
                    Task prompt
                    <Textarea
                      value={draft.firstTaskPrompt}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          firstTaskPrompt: event.target.value,
                        })
                      }
                      xstyle={kickoffStyles.promptTextarea}
                    />
                  </label>
                  <label className={sx(kickoffStyles.labeledField)}>
                    Additional instructions
                    <Textarea
                      value={extraInstructions}
                      onChange={(event) =>
                        setExtraInstructions(event.target.value)
                      }
                      placeholder="Optional constraints or context to append to the first task."
                      xstyle={kickoffStyles.instructionsTextarea}
                    />
                  </label>
                </section>

                {error ? (
                  <p className={sx(kickoffStyles.error)} role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className={sx(kickoffStyles.footer)}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setPhase("source");
                }}
              >
                <ArrowLeft className={sx(kickoffStyles.buttonIcon)} />
                Back
              </Button>
              <Button
                type="button"
                disabled={
                  !sanitizedBranchName ||
                  (startFirstTask && !firstTaskProviderAvailable)
                }
                onClick={() => void handleCreate()}
              >
                <Rocket className={sx(kickoffStyles.buttonIcon)} />
                {startFirstTask ? "Create and start" : "Create workspace"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
