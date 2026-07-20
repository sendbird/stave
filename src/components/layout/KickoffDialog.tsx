import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { resolveDefaultCreateWorkspaceBaseBranch } from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import { Badge, Button, Input, Switch, Textarea, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildDeterministicKickoffProposal,
  classifyKickoffSource,
  type KickoffPanelEntry,
  type KickoffProposalDraft,
} from "@/lib/workspace-kickoff";
import { WORKSPACE_INFORMATION_SECTION_LABELS } from "@/lib/workspace-information-sections";
import { sanitizeBranchName } from "@/store/project.utils";
import { useAppStore } from "@/store/app.store";

type KickoffPhase = "source" | "preview";

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
      state.resolveKickoffProposal,
      state.cancelKickoffResolution,
      state.kickoffWorkspace,
    ]),
  );
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

  useEffect(() => {
    if (!props.open) {
      cancelKickoffResolution();
      setPhase("source");
      setSource("");
      setDraft(null);
      setResolving(false);
      setCreating(false);
      setError(null);
      setStartFirstTask(true);
      setExtraInstructions("");
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
    cancelKickoffResolution,
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

  async function handleCreate() {
    if (!draft || !sanitizedBranchName || creating) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await kickoffWorkspace({
        proposal: { ...draft, branchName: sanitizedBranchName },
        fromBranch,
        fromBranchKind,
        startFirstTask,
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
      onOpenChange={(open) => (open ? props.onOpenChange(true) : closeDialog())}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!resolving && !creating}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-primary" />
            Kick off workspace
          </DialogTitle>
          <DialogDescription>
            {phase === "source"
              ? "Paste a work source. Stave will propose a branch, workspace details, and a first task."
              : "Review and edit the proposal before creating the worktree."}
          </DialogDescription>
        </DialogHeader>

        {phase === "source" ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="kickoff-source" className="text-sm font-medium">
                  Source
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
                className="min-h-40 resize-y bg-background text-sm leading-6"
              />
            </div>

            {requiredMcpServers.length > 0 ? (
              <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {missingMcpServers.length === 0 && !mcpDiscoveryPending ? (
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
                        {server} · {available ? "found" : "missing"}
                      </Badge>
                    );
                  })}
                </div>
                {missingMcpServers.length > 0 && !mcpDiscoveryPending ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Missing servers do not block creation. Resolution will fall
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

            <DialogFooter>
              {resolving ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cancelKickoffResolution()}
                >
                  Cancel resolution
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!source.trim()}
                  onClick={handleSkipAi}
                >
                  Skip AI
                </Button>
              )}
              <Button
                type="button"
                disabled={!source.trim() || resolving}
                onClick={() => void handleResolve()}
              >
                {resolving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {resolving ? "Resolving…" : "Resolve source"}
              </Button>
            </DialogFooter>
          </div>
        ) : draft ? (
          <div className="space-y-6">
            {draft.degraded ? (
              <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="leading-5">
                  This proposal uses deterministic URL and text parsing. Review
                  the fields before creating the workspace.
                </p>
              </div>
            ) : null}

            <section
              className="space-y-4"
              aria-labelledby="kickoff-workspace-heading"
            >
              <h3
                id="kickoff-workspace-heading"
                className="text-sm font-semibold"
              >
                Workspace
              </h3>
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
                      setDraft({ ...draft, workspaceLabel: event.target.value })
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
                  onChangeOption={(option) => setFromBranchKind(option.scope)}
                />
              </div>
              <label className="block space-y-2 text-sm font-medium">
                Source summary
                <Textarea
                  value={draft.sourceSummary}
                  onChange={(event) =>
                    setDraft({ ...draft, sourceSummary: event.target.value })
                  }
                  className="min-h-20 leading-5"
                />
              </label>
            </section>

            <section
              className="space-y-3"
              aria-labelledby="kickoff-information-heading"
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id="kickoff-information-heading"
                  className="text-sm font-semibold"
                >
                  Information panel
                </h3>
                <span className="text-xs text-muted-foreground">
                  {draft.panelEntries.length} linked item(s)
                </span>
              </div>
              {draft.panelEntries.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No structured items were found. The source remains in the
                  first task prompt.
                </p>
              ) : (
                <div className="space-y-3">
                  {draft.panelEntries.map((entry, index) => (
                    <div
                      key={`${entry.target}-${index}`}
                      className="space-y-3 rounded-md border border-border/80 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">
                          {panelTargetLabel(entry.target)}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
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
                            patchPanelEntry(index, { url: event.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-1.5 text-xs font-medium">
                        Note
                        <Textarea
                          value={entry.note}
                          onChange={(event) =>
                            patchPanelEntry(index, { note: event.target.value })
                          }
                          className="min-h-16"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Notes
                  <Textarea
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft({ ...draft, notes: event.target.value })
                    }
                    className="min-h-24"
                  />
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Todos</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setDraft({ ...draft, todos: [...draft.todos, ""] })
                      }
                    >
                      <Plus className="size-3.5" />
                      Add todo
                    </Button>
                  </div>
                  {draft.todos.length === 0 ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      No todos in this proposal.
                    </p>
                  ) : (
                    draft.todos.map((todo, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={todo}
                          aria-label={`Todo ${index + 1}`}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              todos: draft.todos.map((item, itemIndex) =>
                                itemIndex === index ? event.target.value : item,
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
                    ))
                  )}
                </div>
              </div>
            </section>

            <section
              className="space-y-4"
              aria-labelledby="kickoff-task-heading"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3
                    id="kickoff-task-heading"
                    className="text-sm font-semibold"
                  >
                    First task
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start immediately or leave the prompt ready in the composer.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="kickoff-start-task" className="text-sm">
                    Start task
                  </label>
                  <Switch
                    id="kickoff-start-task"
                    checked={startFirstTask}
                    onCheckedChange={setStartFirstTask}
                  />
                </div>
              </div>
              <label className="block space-y-2 text-sm font-medium">
                Task title
                <Input
                  value={draft.firstTaskTitle}
                  onChange={(event) =>
                    setDraft({ ...draft, firstTaskTitle: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Task prompt
                <Textarea
                  value={draft.firstTaskPrompt}
                  onChange={(event) =>
                    setDraft({ ...draft, firstTaskPrompt: event.target.value })
                  }
                  className="min-h-36 leading-6"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Additional instructions
                <Textarea
                  value={extraInstructions}
                  onChange={(event) => setExtraInstructions(event.target.value)}
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setPhase("source")}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                type="button"
                disabled={!sanitizedBranchName || creating}
                onClick={() => void handleCreate()}
              >
                {creating ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {creating ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
