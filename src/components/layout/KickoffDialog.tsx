import { i18n, useTranslation } from "@/i18n";
import { KickoffBriefEditor } from "./KickoffBriefEditor";
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
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { resolveDefaultCreateWorkspaceBaseBranch } from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import {
  buildKickoffAgentRuntimeOverrides,
  buildKickoffFirstTaskRuntimeOverrides,
  canApplyKickoffDialogOpenChange,
  describeKickoffProviderFallback,
  resolveKickoffFirstTaskSelection,
  type KickoffWho,
} from "@/components/layout/KickoffDialog.utils";
import { KickoffSourceWho } from "@/components/layout/KickoffSourceWho";
import { KickoffWorkspaceChoice, type KickoffWorkspaceMode } from "./KickoffWorkspaceChoice";
import { describeAssignRouteModel, resolveAssignRoute } from "@/lib/agents/assign-route";
import { describeAgentPermissionForTask } from "@/lib/agents/agents-view";
import { selectableMainAgents } from "@/lib/agents/selector-choice";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";
import { activeStandards } from "@/lib/agents/standards";
import { STANCE_LABELS } from "@/lib/providers/auto-routing-profile";
import { recordKickoffTaskAgent } from "@/store/kickoff-agent-assignment";
import { KickoffWhoPicker } from "./KickoffWhoPicker";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import { getConfiguredModelForProvider } from "@/store/prompt-draft-runtime";
import { selectEffectiveSettings } from "@/store/project-settings-overrides";
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
  getProviderLabel,
  listProviderIds,
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
import { sanitizeBranchName } from "@/store/repository.utils";
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
  const { t: tI18n } = useTranslation(["kickoff"]);
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
        {resolving ? tI18n("kickoff:kickoffDialog.resolvingKickoffContext") : tI18n("kickoff:kickoffDialog.creatingYourWorkspace")}
      </h3>
      <p className={sx(kickoffStyles.busyCopy)}>
        {resolving
          ? tI18n("kickoff:kickoffDialog.staveIsReadingTheSourceAndPreparing")
          : tI18n("kickoff:kickoffDialog.staveIsCreatingTheWorktreeSeedingIts")}
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
  const { t: tI18n } = useTranslation(["kickoff"]);
  const [
    repositoryPath,
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
      state.repositoryPath,
      state.activeWorkspaceId,
      state.workspaceBranchById,
      state.workspacePathById,
      state.defaultBranch,
      state.settings.kickoffSourceConfigs,
      state.draftProvider,
      // Settings scope: the open project's model and permission defaults.
      selectEffectiveSettings(state),
      state.providerAvailability,
      state.resolveKickoffProposal,
      state.cancelKickoffResolution,
      state.kickoffWorkspace,
    ]),
  );
  const defaultFirstTask = resolveKickoffFirstTaskSelection({
    draftProvider,
    eligibleProviderIds: KICKOFF_PROVIDER_IDS,
    modelClaude: settings.modelClaude,
    modelCodex: settings.modelCodex,
  });
  const defaultFirstTaskProvider = defaultFirstTask.providerId;
  const defaultFirstTaskModel = defaultFirstTask.model;
  const defaultFirstTaskEffort = resolveFirstTaskEffort({
    settings,
    providerId: defaultFirstTaskProvider,
    model: defaultFirstTaskModel,
  });
  const defaultFirstTaskFastMode = resolveFirstTaskFastMode({
    settings,
    providerId: defaultFirstTaskProvider,
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
  const [firstTaskProvider, setFirstTaskProvider] = useState<ProviderId>(
    defaultFirstTaskProvider,
  );
  const [firstTaskModel, setFirstTaskModel] = useState(defaultFirstTaskModel);
  // Stave Auto for the first task when Me does the work. Offered, and chosen
  // by default, while Auto is turned on in Settings.
  const [firstTaskAuto, setFirstTaskAuto] = useState(settings.autoRoutingEnabled);
  const [firstTaskEffort, setFirstTaskEffort] = useState<FirstTaskEffort>(
    defaultFirstTaskEffort,
  );
  const [firstTaskFastMode, setFirstTaskFastMode] = useState(
    defaultFirstTaskFastMode,
  );
  const [extraInstructions, setExtraInstructions] = useState("");
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const myStandards = useAppStore((state) => state.settings.myStandards);
  const autoRoutingProfile = useAppStore((state) => state.settings.autoRoutingProfile);
  const kickoffRequest = useAgentsUiStore((state) => state.kickoffRequest);
  const clearKickoffRequest = useAgentsUiStore((state) => state.clearKickoffRequest);
  const selectableAgents = useMemo(
    () => selectableMainAgents(customAgents),
    [customAgents, i18n.resolvedLanguage],
  );
  // Who does the work: the user, or a saved agent as the task's main agent.
  const [who, setWho] = useState<KickoffWho>("me");
  const [agentId, setAgentId] = useState<string | null>(null);
  // "auto" unless the user picked a provider on the Runs-on override.
  const [agentChoice, setAgentChoice] = useState<"auto" | ProviderId>("auto");
  const selectedAgent =
    who === "agent" ? (selectableAgents.find((agent) => agent.id === agentId) ?? null) : null;
  const agentRoute = useMemo(
    () =>
      selectedAgent
        ? resolveAssignRoute({
            agent: selectedAgent,
            profile: autoRoutingProfile,
            preferredProviderId: firstTaskProvider,
            choice: agentChoice,
            autoRoutingEnabled: settings.autoRoutingEnabled,
          })
        : null,
    [agentChoice, autoRoutingProfile, firstTaskProvider, selectedAgent, settings.autoRoutingEnabled, i18n.resolvedLanguage],
  );
  const meAuto = who === "me" && firstTaskAuto && settings.autoRoutingEnabled;
  // A kickoff owns its checkout choice independently of the agent definition.
  const [workspaceMode, setWorkspaceMode] = useState<KickoffWorkspaceMode>("new-worktree");
  const worksHere = workspaceMode === "same-workspace";
  // Which provider the first task actually runs on: the agent's route when one
  // is chosen, else the Me controls.
  const effectiveFirstTaskProvider =
    who === "agent" && agentRoute ? agentRoute.providerId : firstTaskProvider;

  const activeBranch = workspaceBranchById[activeWorkspaceId] ?? defaultBranch;
  const activeWorkspacePath =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? undefined;
  const classification = useMemo(
    () => classifyKickoffSource({ input: source, configs: sourceConfigs }),
    [source, sourceConfigs, i18n.resolvedLanguage],
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
    [codexModelCatalog.models, providerAvailability, i18n.resolvedLanguage],
  );
  const recommendedFirstTaskModels = useMemo(
    () =>
      buildRecommendedModelSelectorOptions({
        options: firstTaskModelOptions,
      }),
    [firstTaskModelOptions, i18n.resolvedLanguage],
  );
  const firstTaskAutoOption = useMemo(
    () =>
      buildAutoModelSelectorOption({
        providerId: firstTaskProvider,
        stanceLabel: STANCE_LABELS[autoRoutingProfile.stance],
      }),
    [autoRoutingProfile.stance, firstTaskProvider, i18n.resolvedLanguage],
  );
  const firstTaskSelectorOptions = useMemo(
    () =>
      settings.autoRoutingEnabled
        ? [firstTaskAutoOption, ...firstTaskModelOptions]
        : firstTaskModelOptions,
    [firstTaskAutoOption, firstTaskModelOptions, settings.autoRoutingEnabled, i18n.resolvedLanguage],
  );
  const providerFallbackHint = describeKickoffProviderFallback({
    draftProvider,
    eligibleProviderIds: KICKOFF_PROVIDER_IDS,
    draftLabel: getProviderLabel({
      providerId: draftProvider,
      variant: "short",
    }),
    fallbackLabel: getProviderLabel({
      providerId: defaultFirstTaskProvider,
      variant: "short",
    }),
  });
  const selectedFirstTaskModel = useMemo(
    () =>
      meAuto
        ? firstTaskAutoOption
        : buildModelSelectorValue({
            providerId: firstTaskProvider,
            model: firstTaskModel,
            available: providerAvailability[firstTaskProvider],
          }),
    [firstTaskAutoOption, firstTaskModel, firstTaskProvider, meAuto, providerAvailability, i18n.resolvedLanguage],
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
  // Why the first task cannot start, or null when it can. A task on Stave
  // Auto is routed past an unavailable provider, so only a pinned one blocks.
  const routedPerTurn = meAuto || (who === "agent" && agentRoute?.source === "stave-auto");
  const startBlocked = !repositoryPath
    ? "Open a repository to start work."
    : worksHere && !activeWorkspaceId
      ? tI18n("kickoff:kickoffDialog.openCurrentWorkspace")
      : !routedPerTurn && providerAvailability[effectiveFirstTaskProvider] === false
        ? `${getProviderLabel({ providerId: effectiveFirstTaskProvider, variant: "short" })} is unavailable. ${
            who === "agent" ? "Choose another provider under Runs on." : "Choose another model."
          }`
        : null;
  const busy = resolving || creating;

  useEffect(() => {
    if (!props.open || !kickoffRequest) {
      return;
    }
    if (typeof kickoffRequest.text === "string") {
      setSource(kickoffRequest.text);
    }
    if (kickoffRequest.agentConfigId) {
      const preset = selectableAgents.find((agent) => agent.id === kickoffRequest.agentConfigId);
      if (preset) {
        setWho("agent");
        setAgentId(preset.id);
      }
    }
    clearKickoffRequest();
  }, [clearKickoffRequest, kickoffRequest, props.open, selectableAgents]);

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
    setFirstTaskProvider(defaultFirstTaskProvider);
    setFirstTaskModel(defaultFirstTaskModel);
    setFirstTaskAuto(settings.autoRoutingEnabled);
    setFirstTaskEffort(defaultFirstTaskEffort);
    setFirstTaskFastMode(defaultFirstTaskFastMode);
    setExtraInstructions("");
    setWho("me");
    setAgentId(null);
    setAgentChoice("auto");
    setWorkspaceMode("new-worktree");
  }, [
    cancelKickoffResolution,
    defaultFirstTaskEffort,
    defaultFirstTaskFastMode,
    defaultFirstTaskModel,
    defaultFirstTaskProvider,
    props.open,
    settings.autoRoutingEnabled,
  ]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    let cancelled = false;
    const discoverMcpServers = window.api?.provider?.discoverMcpServers;
    if (discoverMcpServers) {
      setMcpDiscoveryPending(true);
      void discoverMcpServers({ cwd: repositoryPath ?? undefined })
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
    repositoryPath,
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
        setError(result.message ?? i18n.t("kickoff:additionalCopy.message6"));
        return;
      }
      setDraft(result.proposal);
      setPhase("preview");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : i18n.t("kickoff:additionalCopy.message7"),
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
    if (selection.isAuto) {
      setFirstTaskAuto(true);
      return;
    }
    setFirstTaskAuto(false);
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
      (!worksHere && !sanitizedBranchName) ||
      creating ||
      (worksHere && !activeWorkspaceId) ||
      (startFirstTask && startBlocked)
    ) {
      return;
    }
    await startKickoff({
      proposal: { ...draft, branchName: sanitizedBranchName },
      startFirstTask,
      extraInstructions,
    });
  }

  /**
   * Start now on the source screen: the same start as Create on the review
   * screen, from the source as Skip AI reads it, with no review in between.
   */
  async function handleStartNow() {
    if (!source.trim() || creating || who !== "agent" || !selectedAgent || startBlocked) {
      return;
    }
    const proposal = buildDeterministicKickoffProposal({ classification });
    await startKickoff({
      proposal: { ...proposal, branchName: sanitizeBranchName({ value: proposal.branchName }) },
      startFirstTask: true,
      extraInstructions: "",
    });
  }

  /**
   * The one way Kickoff starts work, for Me and for an agent: create the
   * selected worktree or a new task in the current workspace,
   * record the agent before the first turn, and send that turn the way the
   * composer sends any turn — the user's permissions and Stave Auto included.
   */
  async function startKickoff(args: {
    proposal: KickoffProposalDraft;
    startFirstTask: boolean;
    extraInstructions: string;
  }) {
    // With an agent, its route decides the provider and model; a fixed agent
    // model wins, and Stave Auto keeps routing every turn. Without one, the Me
    // controls decide.
    const effectiveProvider =
      who === "agent" && agentRoute ? agentRoute.providerId : firstTaskProvider;
    const firstTaskRuntimeOverrides =
      who === "agent" && agentRoute
        ? buildKickoffAgentRuntimeOverrides({
            route: agentRoute,
            configuredModel: getConfiguredModelForProvider(agentRoute.providerId, settings),
          })
        : meAuto
          ? { autoRouting: true }
          : buildKickoffFirstTaskRuntimeOverrides({
              providerId: firstTaskProvider,
              model: firstTaskModel,
              effort: effectiveFirstTaskEffort,
              codexFastMode: firstTaskFastMode,
            });
    // Records that the task runs as the agent, before its first turn. A fixed
    // agent model wins on the host too, so the route's model is a hint here.
    const beforeFirstTurn =
      who === "agent" && selectedAgent && agentRoute
        ? async ({ workspaceId, taskId, prompt }: { workspaceId: string; taskId: string; prompt: string }) => {
            const standards = activeStandards(myStandards);
            await recordKickoffTaskAgent({
              requestId: `kickoff:${crypto.randomUUID()}`,
              taskId,
              workspaceId,
              repositoryPath: repositoryPath!,
              agent: selectedAgent,
              assignment: prompt,
              providerId: agentRoute.providerId,
              model: agentRoute.model,
              ...(standards ? { standards } : {}),
            });
          }
        : undefined;
    setCreating(true);
    setError(null);
    try {
      const result = await kickoffWorkspace({
        proposal: args.proposal,
        fromBranch,
        fromBranchKind,
        startFirstTask: args.startFirstTask,
        firstTaskProvider: effectiveProvider,
        firstTaskRuntimeOverrides,
        extraInstructions: args.extraInstructions,
        ...(beforeFirstTurn ? { beforeFirstTurn } : {}),
        ...(worksHere ? { target: { kind: "current-workspace" as const, workspaceId: activeWorkspaceId } } : {}),
      });
      if (!result.ok) {
        setError(result.message ?? i18n.t("kickoff:additionalCopy.message8"));
        return;
      }
      if (result.noticeLevel === "warning" && result.message) {
        toast.warning(worksHere ? tI18n("kickoff:kickoffDialog.taskCreatedWithWarning") : tI18n("kickoff:kickoffDialog.workspaceCreatedWithWarning"), {
          description: result.message,
        });
      } else {
        toast.success(worksHere
          ? tI18n(args.startFirstTask ? "kickoff:kickoffDialog.taskStartedInThisWorkspace" : "kickoff:kickoffDialog.taskCreatedInThisWorkspace")
          : tI18n("kickoff:kickoffDialog.workspaceCreatedFromKickoffSource"));
      }
      props.onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : i18n.t("kickoff:additionalCopy.message9"),
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
              <DialogTitle>{tI18n("kickoff:kickoffDialog.kickOffWorkspace")}</DialogTitle>
              <DialogDescription
                className={sx(kickoffStyles.headerDescription)}
              >
                {phase === "source"
                  ? tI18n("kickoff:kickoffDialog.turnAWorkSourceIntoAnEditable")
                  : tI18n("kickoff:kickoffDialog.reviewWhatStaveFoundBeforeCreatingThe")}
              </DialogDescription>
            </div>
          </div>
          <div
            className={sx(kickoffStyles.steps)}
            aria-label={tI18n("kickoff:kickoffDialog.kickoffProgress")}
          >
            <span
              className={sx(
                phase === "source"
                  ? kickoffStyles.stepActive
                  : kickoffStyles.stepIdle,
              )}
              aria-current={phase === "source" ? "step" : undefined}
            >
              {tI18n("kickoff:kickoffDialog.text1")}</span>
            <span className={sx(kickoffStyles.stepDivider)} aria-hidden="true" />
            <span
              className={sx(
                phase === "preview"
                  ? kickoffStyles.stepActive
                  : kickoffStyles.stepIdle,
              )}
              aria-current={phase === "preview" ? "step" : undefined}
            >
              {tI18n("kickoff:kickoffDialog.text2")}</span>
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
                {tI18n("kickoff:kickoffDialog.cancelResolution")}</Button>
            </DialogFooter>
          </>
        ) : creating ? (
          <>
            <KickoffBusyState mode="creating" />
            <div className={sx(kickoffStyles.creatingNote)}>
              {tI18n("kickoff:kickoffDialog.keepStaveOpenWhileTheWorktreeIs")}</div>
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
                      {tI18n("kickoff:kickoffDialog.workSource")}</label>
                    <Badge variant="outline">
                      {classification.config?.label ?? tI18n("kickoff:kickoffDialog.freeFormPrompt")}
                    </Badge>
                  </div>
                  <Textarea
                    id="kickoff-source"
                    autoFocus
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder={tI18n("kickoff:kickoffDialog.pasteAJiraIssueSlackThreadPrd")}
                    xstyle={kickoffStyles.sourceTextarea}
                  />
                  <p className={sx(kickoffStyles.hint)}>
                    {tI18n("kickoff:kickoffDialog.staveWillExtractTheWorkspaceNameBranch")}</p>
                </div>

                <KickoffSourceWho
                  agents={selectableAgents}
                  who={who}
                  agentId={agentId}
                  onWhoChange={setWho}
                  onAgentChange={setAgentId}
                  disabled={busy}
                  startNow={{
                    canStart: source.trim().length > 0 && !busy && startBlocked === null,
                    busy: creating,
                    hint:
                      startBlocked ??
                      (agentRoute && selectedAgent
                        ? tI18n("kickoff:kickoffDialog.valueValueValueValueNowWithoutThe", { value1: PROVIDER_LABELS[agentRoute.providerId] ?? agentRoute.providerId, value2: describeAssignRouteModel(agentRoute), value3: describeAgentPermissionForTask(selectedAgent.permission), value4: worksHere ? tI18n("kickoff:kickoffDialog.startInCurrentWorkspace") : tI18n("kickoff:kickoffDialog.startInNewWorkspace") })
                        : null),
                    onStart: () => void handleStartNow(),
                  }}
                >
                  <KickoffWorkspaceChoice
                    value={workspaceMode}
                    onChange={setWorkspaceMode}
                    disabled={busy}
                    currentWorkspaceAvailable={Boolean(activeWorkspaceId)}
                    branch={activeBranch}
                  />
                </KickoffSourceWho>

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
                      {tI18n("kickoff:kickoffDialog.mcpDependencies")}</div>
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
                              ? tI18n("kickoff:kickoffDialog.found")
                              : mcpDiscoveryPending
                                ? tI18n("kickoff:kickoffDialog.checking")
                                : tI18n("kickoff:kickoffDialog.missing")}
                          </Badge>
                        );
                      })}
                    </div>
                    {missingMcpServers.length > 0 && !mcpDiscoveryPending ? (
                      <p className={sx(kickoffStyles.hintSpaced)}>
                        {tI18n("kickoff:kickoffDialog.missingServersDoNotBlockCreationResolution")}</p>
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
                {tI18n("kickoff:kickoffDialog.skipAi")}</Button>
              <Button
                type="button"
                disabled={!source.trim()}
                onClick={() => void handleResolve()}
              >
                <Sparkles className={sx(kickoffStyles.buttonIcon)} />
                {tI18n("kickoff:kickoffDialog.resolveSource")}</Button>
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
                      {draft.resolutionNote ?? tI18n("kickoff:kickoffDialog.aiInterpretationWasUnavailableReviewTheTask")}
                    </p>
                  </div>
                ) : null}

                {draft.sourceEvidence ? (
                  <p className={sx(kickoffStyles.hint)}>
                    {draft.sourceEvidence.detail}
                    {draft.sourceEvidence.truncated ? tI18n("kickoff:kickoffDialog.theInterpretationUsedShortenedInputTheFull") : ""}
                  </p>
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
                      {tI18n("kickoff:kickoffDialog.workspaceDetails")}</h3>
                    <p className={sx(kickoffStyles.sectionCopy)}>
                      {tI18n(worksHere ? "kickoff:kickoffDialog.currentWorkspaceDetails" : "kickoff:kickoffDialog.confirmWhereTheWorktreeStartsAndHow")}</p>
                  </div>
                  {!worksHere ? (
                    <>
                      <div className={sx(kickoffStyles.twoColumn)}>
                        <div className={sx(kickoffStyles.labeledField)}>
                          <label
                            htmlFor="kickoff-branch-name"
                            className={sx(kickoffStyles.label)}
                          >
                            {tI18n("kickoff:kickoffDialog.branchName")}</label>
                          <Input
                            id="kickoff-branch-name"
                            value={draft.branchName}
                            onChange={(event) =>
                              setDraft({ ...draft, branchName: event.target.value })
                            }
                            aria-describedby="kickoff-branch-note"
                            aria-invalid={!sanitizedBranchName}
                            xstyle={kickoffStyles.monoInput}
                          />
                          <p
                            id="kickoff-branch-note"
                            className={sx(
                              sanitizedBranchName
                                ? kickoffStyles.fieldNote
                                : kickoffStyles.errorHint,
                            )}
                            role={sanitizedBranchName ? undefined : "alert"}
                          >
                            {sanitizedBranchName
                              ? tI18n("kickoff:kickoffDialog.createsValue", { sanitizedBranchName: sanitizedBranchName })
                              : tI18n("kickoff:kickoffDialog.enterAValidGitBranchName")}
                          </p>
                        </div>
                        <div className={sx(kickoffStyles.labeledField)}>
                          <label
                            htmlFor="kickoff-workspace-label"
                            className={sx(kickoffStyles.label)}
                          >
                            {tI18n("kickoff:kickoffDialog.workspaceLabel")}</label>
                          <Input
                            id="kickoff-workspace-label"
                            value={draft.workspaceLabel}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                workspaceLabel: event.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className={sx(kickoffStyles.field)}>
                        <p className={sx(kickoffStyles.label)}>{tI18n("kickoff:kickoffDialog.baseBranch")}</p>
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
                    </>
                  ) : null}
                  <label className={sx(kickoffStyles.labeledField)}>
                    {tI18n("kickoff:kickoffDialog.sourceSummary")}<Textarea
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

                {!worksHere ? (
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
                          {tI18n("kickoff:kickoffDialog.linkedContext")}</h3>
                        <p className={sx(kickoffStyles.sectionCopy)}>
                          {tI18n("kickoff:kickoffDialog.theseItemsWillBeAddedToThe")}</p>
                      </div>
                      <Badge variant="secondary">
                        {draft.panelEntries.length}{" "}
                        {draft.panelEntries.length === 1 ? tI18n("kickoff:kickoffDialog.item") : tI18n("kickoff:kickoffDialog.items")}
                      </Badge>
                    </div>
                    {draft.panelEntries.length === 0 ? (
                      <p className={sx(kickoffStyles.emptyNote)}>
                        {tI18n("kickoff:kickoffDialog.noStructuredItemsWereFoundTheSource")}</p>
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
                                      {entry.title || tI18n("kickoff:kickoffDialog.untitledItem")}
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
                                aria-label={tI18n("kickoff:kickoffDialog.removeValueItem", { value1: panelTargetLabel(entry.target) })}
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
                                  {tI18n("kickoff:kickoffDialog.title")}<Input
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
                                  {tI18n("kickoff:kickoffDialog.reference")}<Input
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
                                {tI18n("kickoff:kickoffDialog.url")}<Input
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
                                {tI18n("kickoff:kickoffDialog.note")}<Textarea
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
                      <div className={sx(kickoffStyles.field)}>
                        <div className={sx(kickoffStyles.todoHeaderRow)}>
                          <label
                            htmlFor="kickoff-notes"
                            className={sx(kickoffStyles.label)}
                          >
                            {tI18n("kickoff:kickoffDialog.notes")}</label>
                        </div>
                        <Textarea
                          id="kickoff-notes"
                          value={draft.notes}
                          onChange={(event) =>
                            setDraft({ ...draft, notes: event.target.value })
                          }
                          placeholder={tI18n("kickoff:kickoffDialog.optionalWorkspaceNotes")}
                          xstyle={kickoffStyles.notesTextarea}
                        />
                      </div>
                      <div className={sx(kickoffStyles.field)}>
                        <div className={sx(kickoffStyles.todoHeaderRow)}>
                          <p className={sx(kickoffStyles.label)}>{tI18n("kickoff:kickoffDialog.todos")}</p>
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
                            {tI18n("kickoff:kickoffDialog.addTodo")}</Button>
                        </div>
                        {draft.todos.length === 0 ? (
                          <p className={sx(kickoffStyles.emptyNoteSmall)}>
                            {tI18n("kickoff:kickoffDialog.noTodosInThisProposal")}</p>
                        ) : (
                          <div className={sx(kickoffStyles.todoList)}>
                            {draft.todos.map((todo, index) => (
                              <div
                                key={index}
                                className={sx(kickoffStyles.todoRow)}
                              >
                                <Input
                                  value={todo}
                                  aria-label={tI18n("kickoff:kickoffDialog.todoValue", { value1: index + 1 })}
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
                                  aria-label={tI18n("kickoff:kickoffDialog.removeTodoValue", { value1: index + 1 })}
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
                ) : null}

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
                        {tI18n("kickoff:kickoffDialog.firstTask")}</h3>
                      <p className={sx(kickoffStyles.sectionCopy)}>
                        {tI18n("kickoff:kickoffDialog.chooseWhoDoesTheWorkHowIt")}</p>
                    </div>
                    <div className={sx(kickoffStyles.startToggle)}>
                      <label
                        htmlFor="kickoff-start-task"
                        className={sx(kickoffStyles.label)}
                      >
                        {tI18n("kickoff:kickoffDialog.startNow")}</label>
                      <Switch
                        id="kickoff-start-task"
                        aria-label={tI18n("kickoff:kickoffDialog.startNow")}
                        checked={startFirstTask}
                        onCheckedChange={setStartFirstTask}
                      />
                    </div>
                  </div>
                  <div className={sx(kickoffStyles.field)}>
                    <p
                      id="kickoff-first-task-who-label"
                      className={sx(kickoffStyles.label)}
                    >
                      {tI18n("kickoff:kickoffDialog.who")}</p>
                    <KickoffWhoPicker
                      agents={selectableAgents}
                      who={who}
                      agentId={agentId}
                      disabled={creating}
                      onWhoChange={setWho}
                      onAgentChange={setAgentId}
                      aria-labelledby="kickoff-first-task-who-label"
                    />
                  </div>
                  {who === "agent" && selectedAgent && agentRoute ? (
                    <div className={sx(kickoffStyles.whoBlock)}>
                      <p className={sx(kickoffStyles.agentSettingsLine)}>
                        {tI18n("kickoff:kickoffDialog.agentSettings")}{" "}
                        {PROVIDER_LABELS[agentRoute.providerId] ?? agentRoute.providerId} ·{" "}
                        {describeAssignRouteModel(agentRoute)} ·{" "}
                        {describeAgentPermissionForTask(selectedAgent.permission)}
                      </p>
                      <div className={sx(kickoffStyles.field)}>
                        <p
                          id="kickoff-first-task-runson-label"
                          className={sx(kickoffStyles.label)}
                        >
                          {tI18n("kickoff:kickoffDialog.runsOn")}</p>
                        <Select
                          value={
                            selectedAgent.model.mode === "fixed"
                              ? selectedAgent.model.providerId
                              : agentChoice
                          }
                          disabled={selectedAgent.model.mode === "fixed" || creating}
                          onValueChange={(value) =>
                            setAgentChoice(value as "auto" | ProviderId)
                          }
                        >
                          <SelectTrigger
                            className={sx(kickoffStyles.fullWidth)}
                            aria-labelledby="kickoff-first-task-runson-label"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedAgent.model.mode === "fixed" ? null : (
                              <SelectItem value="auto">{tI18n("kickoff:kickoffDialog.autoRouting")}</SelectItem>
                            )}
                            {listProviderIds().map((id) => (
                              <SelectItem key={id} value={id}>
                                {PROVIDER_LABELS[id] ?? id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className={sx(kickoffStyles.hint)} title={agentRoute.reason}>
                          {agentRoute.reason}
                        </p>
                      </div>
                    </div>
                  ) : (
                  <div className={sx(kickoffStyles.runtimeGrid, meAuto && kickoffStyles.runtimeGridSingle)}>
                    <div className={sx(kickoffStyles.field)}>
                      <p className={sx(kickoffStyles.label)}>{tI18n("kickoff:kickoffDialog.model")}</p>
                      <ModelSelector
                        value={selectedFirstTaskModel}
                        options={firstTaskSelectorOptions}
                        recommendedOptions={recommendedFirstTaskModels}
                        disabled={creating}
                        onSelect={({ selection }) =>
                          handleFirstTaskModelSelect(selection)
                        }
                        className={sx(kickoffStyles.fullWidth)}
                        triggerClassName={sx(
                          kickoffStyles.modelSelectorTrigger,
                        )}
                        triggerAriaLabel={tI18n("kickoff:kickoffDialog.firstTaskModelValue", { value1: selectedFirstTaskModel.label })}
                        menuClassName={sx(kickoffStyles.modelSelectorMenu)}
                      />
                    </div>
                    {meAuto ? null : (
                      <div className={sx(kickoffStyles.runtimeSide)}>
                        <div className={sx(kickoffStyles.field)}>
                          <p
                            id="kickoff-first-task-effort-label"
                            className={sx(kickoffStyles.label)}
                          >
                            {tI18n("kickoff:kickoffDialog.effort")}</p>
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
                        {firstTaskProvider === "codex" ? (
                          <div className={sx(kickoffStyles.field)}>
                            <p
                              id="kickoff-first-task-fast-label"
                              className={sx(kickoffStyles.label)}
                            >
                              {tI18n("kickoff:kickoffDialog.fastMode")}</p>
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
                                <SelectItem value="off">{tI18n("kickoff:kickoffDialog.off")}</SelectItem>
                                <SelectItem value="on">{tI18n("kickoff:kickoffDialog.on")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  )}
                  <KickoffWorkspaceChoice
                    value={workspaceMode}
                    onChange={setWorkspaceMode}
                    disabled={busy}
                    currentWorkspaceAvailable={Boolean(activeWorkspaceId)}
                    branch={activeBranch}
                  />
                  {who === "agent" && startBlocked ? (
                    <p className={sx(kickoffStyles.errorHint)} role="alert">
                      {startBlocked}
                    </p>
                  ) : null}
                  {who === "me" && !firstTaskProviderAvailable && !meAuto ? (
                    <p className={sx(kickoffStyles.errorHint)} role="alert">
                      {tI18n("kickoff:kickoffDialog.thisProviderIsUnavailableChooseAnotherModel")}</p>
                  ) : null}
                  {who === "me" && providerFallbackHint ? (
                    <p className={sx(kickoffStyles.hint)}>
                      {providerFallbackHint}
                    </p>
                  ) : null}
                  {who === "me" && (firstTaskProviderAvailable || meAuto) ? (
                    <p className={sx(kickoffStyles.hint)}>
                      {meAuto
                        ? tI18n("kickoff:kickoffDialog.staveAutoStaysOnForThisTask")
                        : firstTaskProvider === "codex"
                          ? tI18n("kickoff:kickoffDialog.theModelEffortAndFastModeStay")
                          : tI18n("kickoff:kickoffDialog.theModelAndEffortStayAttachedTo")}
                    </p>
                  ) : null}
                  <label className={sx(kickoffStyles.labeledField)}>
                    {tI18n("kickoff:kickoffDialog.taskTitle")}<Input
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
                    {tI18n("kickoff:kickoffDialog.taskPrompt")}<Textarea
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
                    {tI18n("kickoff:kickoffDialog.additionalInstructions")}<Textarea
                      value={extraInstructions}
                      onChange={(event) =>
                        setExtraInstructions(event.target.value)
                      }
                      placeholder={tI18n("kickoff:kickoffDialog.optionalConstraintsOrContextToAppendTo")}
                      xstyle={kickoffStyles.instructionsTextarea}
                    />
                  </label>
                  <KickoffBriefEditor draft={draft} extraInstructions={extraInstructions} onChange={setDraft} />
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
                {tI18n("kickoff:kickoffDialog.back")}</Button>
              <Button
                type="button"
                disabled={(!worksHere && !sanitizedBranchName) || (worksHere && !activeWorkspaceId) || (startFirstTask && startBlocked !== null)}
                onClick={() => void handleCreate()}
              >
                <Rocket className={sx(kickoffStyles.buttonIcon)} />
                {!startFirstTask ? tI18n(worksHere ? "kickoff:kickoffDialog.createTask" : "kickoff:kickoffDialog.createWorkspace") : who === "agent" && selectedAgent ? tI18n("kickoff:kickoffDialog.assign") : tI18n("kickoff:kickoffDialog.createAndStart")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
