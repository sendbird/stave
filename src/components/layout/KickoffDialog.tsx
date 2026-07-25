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
import { canApplyKickoffDialogOpenChange } from "@/components/layout/KickoffDialog.utils";
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
  listProviderIds,
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
const KICKOFF_PROVIDER_IDS = listProviderIds();

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

function KickoffBusyState(props: {
  mode: "resolving" | "creating";
  sourceType?: string;
}) {
  const resolving = props.mode === "resolving";
  return (
    <div
      className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="grid size-24 place-items-center rounded-full bg-muted/40 ring-1 ring-border/70">
        <ThinkingOrb
          state={resolving ? "searching" : "shaping"}
          size={64}
          aria-hidden="true"
        />
      </div>
      <h3 className="mt-6 text-base font-semibold leading-6">
        {resolving ? "Resolving kickoff context" : "Creating your workspace"}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {resolving
          ? "Stave is reading the source and preparing an editable workspace proposal."
          : "Stave is creating the worktree, seeding its context, and preparing the first task."}
      </p>
      {props.sourceType ? (
        <Badge variant="secondary" className="mt-4">
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
    setExtraInstructions("");
  }, [
    cancelKickoffResolution,
    defaultFirstTaskEffort,
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
    const firstTaskRuntimeOverrides: PromptDraftRuntimeOverrides = {
      autoRouting: false,
      model: firstTaskModel,
      ...(firstTaskProvider === "claude-code"
        ? { claudeEffort: effectiveFirstTaskEffort as ClaudeTaskEffort }
        : {
            codexReasoningEffort: effectiveFirstTaskEffort as CodexTaskEffort,
          }),
    };
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
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={!busy}
        aria-busy={busy}
      >
        <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5 pr-14">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Rocket className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-6">
                Kick off workspace
              </DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                {phase === "source"
                  ? "Turn a work source into an editable workspace proposal."
                  : "Review what Stave found before creating the worktree."}
              </DialogDescription>
            </div>
          </div>
          <div
            className="mt-4 flex items-center gap-2 text-xs font-medium"
            aria-label="Kickoff progress"
          >
            <span
              className={
                phase === "source" ? "text-foreground" : "text-muted-foreground"
              }
              aria-current={phase === "source" ? "step" : undefined}
            >
              1. Source
            </span>
            <span className="h-px w-8 bg-border" aria-hidden="true" />
            <span
              className={
                phase === "preview"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
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
            <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
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
            <div className="border-t border-border/70 bg-muted/20 px-6 py-4 text-center text-xs text-muted-foreground">
              Keep Stave open while the worktree is prepared.
            </div>
          </>
        ) : phase === "source" ? (
          <>
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="kickoff-source"
                      className="text-sm font-medium"
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
                    className="min-h-44 resize-y bg-background text-sm leading-6"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Stave will extract the workspace name, branch, linked
                    context, and a ready-to-run first task.
                  </p>
                </div>

                {requiredMcpServers.length > 0 ? (
                  <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {missingMcpServers.length === 0 &&
                      !mcpDiscoveryPending ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <AlertTriangle className="size-4 text-warning" />
                      )}
                      MCP dependencies
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Missing servers do not block creation. Resolution falls
                        back to the source text and URL metadata.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
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
                <Sparkles className="size-4" />
                Resolve source
              </Button>
            </DialogFooter>
          </>
        ) : draft ? (
          <>
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                {draft.degraded ? (
                  <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <p className="leading-5">
                      This proposal uses deterministic URL and text parsing.
                      Review the fields before creating the workspace.
                    </p>
                  </div>
                ) : null}

                <section
                  className="space-y-4 rounded-lg border border-border/80 bg-card/40 p-4"
                  aria-labelledby="kickoff-workspace-heading"
                >
                  <div>
                    <h3
                      id="kickoff-workspace-heading"
                      className="text-sm font-semibold"
                    >
                      Workspace details
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Confirm where the worktree starts and how it appears in
                      Stave.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      Branch name
                      <Input
                        value={draft.branchName}
                        onChange={(event) =>
                          setDraft({ ...draft, branchName: event.target.value })
                        }
                        aria-invalid={!sanitizedBranchName}
                        className="font-mono"
                      />
                      <span className="block text-xs font-normal text-muted-foreground">
                        {sanitizedBranchName
                          ? `Creates ${sanitizedBranchName}`
                          : "Enter a valid git branch name."}
                      </span>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
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
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Base branch</p>
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
                  <label className="block space-y-2 text-sm font-medium">
                    Source summary
                    <Textarea
                      value={draft.sourceSummary}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          sourceSummary: event.target.value,
                        })
                      }
                      className="min-h-20 leading-5"
                    />
                  </label>
                </section>

                <section
                  className="space-y-4 rounded-lg border border-border/80 bg-card/40 p-4"
                  aria-labelledby="kickoff-information-heading"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3
                        id="kickoff-information-heading"
                        className="text-sm font-semibold"
                      >
                        Linked context
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm leading-5 text-muted-foreground">
                      No structured items were found. The source remains in the
                      first task prompt.
                    </p>
                  ) : (
                    <Accordion multiple className="space-y-2">
                      {draft.panelEntries.map((entry, index) => (
                        <AccordionItem
                          key={`${entry.target}-${entry.url}-${index}`}
                          value={`${entry.target}-${index}`}
                          className="rounded-md border border-border/80 px-3 not-last:border-b"
                        >
                          <div className="flex items-center gap-2">
                            <AccordionTrigger className="min-w-0 py-3 hover:no-underline">
                              <span className="flex min-w-0 items-center gap-2 pr-3">
                                <Badge variant="outline" className="shrink-0">
                                  {panelTargetLabel(entry.target)}
                                </Badge>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {entry.title || "Untitled item"}
                                  </span>
                                  <span className="block truncate text-xs font-normal text-muted-foreground">
                                    {entry.reference || entry.url}
                                  </span>
                                </span>
                              </span>
                            </AccordionTrigger>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0"
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
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                          <AccordionContent className="space-y-3 pb-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="space-y-1.5 text-xs font-medium">
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
                              <label className="space-y-1.5 text-xs font-medium">
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
                            <label className="block space-y-1.5 text-xs font-medium">
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
                            <label className="block space-y-1.5 text-xs font-medium">
                              Note
                              <Textarea
                                value={entry.note}
                                onChange={(event) =>
                                  patchPanelEntry(index, {
                                    note: event.target.value,
                                  })
                                }
                                className="min-h-16"
                              />
                            </label>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                  <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      Notes
                      <Textarea
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft({ ...draft, notes: event.target.value })
                        }
                        placeholder="Optional workspace notes"
                        className="min-h-28"
                      />
                    </label>
                    <div className="space-y-2">
                      <div className="flex min-h-9 items-center justify-between gap-2">
                        <p className="text-sm font-medium">Todos</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              todos: [...draft.todos, ""],
                            })
                          }
                        >
                          <Plus className="size-3.5" />
                          Add todo
                        </Button>
                      </div>
                      {draft.todos.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">
                          No todos in this proposal.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {draft.todos.map((todo, index) => (
                            <div key={index} className="flex gap-2">
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
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section
                  className="space-y-4 rounded-lg border border-border/80 bg-card/40 p-4"
                  aria-labelledby="kickoff-task-heading"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3
                        id="kickoff-task-heading"
                        className="text-sm font-semibold"
                      >
                        First task
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Choose how the task will run, then refine its prompt.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <label
                        htmlFor="kickoff-start-task"
                        className="text-sm font-medium"
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
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Model</p>
                      <ModelSelector
                        value={selectedFirstTaskModel}
                        options={firstTaskModelOptions}
                        disabled={creating}
                        onSelect={({ selection }) =>
                          handleFirstTaskModelSelect(selection)
                        }
                        className="w-full"
                        triggerClassName="h-9 w-full max-w-none border-input bg-background px-3"
                        triggerAriaLabel={`First task model: ${selectedFirstTaskModel.label}`}
                        menuClassName="sm:max-w-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <p
                        id="kickoff-first-task-effort-label"
                        className="text-sm font-medium"
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
                          className="w-full"
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
                  </div>
                  {!firstTaskProviderAvailable ? (
                    <p
                      className="text-xs leading-5 text-destructive"
                      role="alert"
                    >
                      This provider is unavailable. Choose another model before
                      starting the task.
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      The model and effort stay attached to this task, even if
                      you leave the prompt ready instead of starting now.
                    </p>
                  )}
                  <label className="block space-y-2 text-sm font-medium">
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
                  <label className="block space-y-2 text-sm font-medium">
                    Task prompt
                    <Textarea
                      value={draft.firstTaskPrompt}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          firstTaskPrompt: event.target.value,
                        })
                      }
                      className="min-h-36 leading-6"
                    />
                  </label>
                  <label className="block space-y-2 text-sm font-medium">
                    Additional instructions
                    <Textarea
                      value={extraInstructions}
                      onChange={(event) =>
                        setExtraInstructions(event.target.value)
                      }
                      placeholder="Optional constraints or context to append to the first task."
                      className="min-h-20"
                    />
                  </label>
                </section>

                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setPhase("source");
                }}
              >
                <ArrowLeft className="size-4" />
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
                <Rocket className="size-4" />
                {startFirstTask ? "Create and start" : "Create workspace"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
