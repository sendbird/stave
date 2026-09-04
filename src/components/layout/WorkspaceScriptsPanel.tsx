import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Copy,
  ExternalLink,
  Globe,
  History,
  Play,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Loader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@/components/ui";
import { ScriptLogView } from "@/components/scripts";
import { paneHost } from "@/components/panes/pane-host-controller";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { isTaskArchived } from "@/lib/tasks";
import {
  clearScriptLog,
  countRunningServiceEntries,
  formatScriptDuration,
  formatScriptRelativeTime,
  persistWorkspaceServiceQuickAdd,
  refreshScriptsRuntime,
  runScriptEntry,
  runScriptHook,
  scriptEntryKey,
  stopAllScripts,
  stopScriptEntry,
  useWorkspaceScriptsRuntime,
  SCRIPT_TRIGGER_METADATA,
  WORKSPACE_TOOLS_LABEL,
  type ScriptEntryOrigin,
  type ScriptUiState,
} from "@/lib/workspace-scripts";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptsConfig,
} from "@/lib/workspace-scripts/types";
import {
  DEFAULT_WORKSPACE_TOOLS_VIEW,
  WORKSPACE_TOOLS_VIEWS,
  type WorkspaceToolsViewId,
} from "@/lib/workspace-tools-presentation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  openOrbitUrlWithLensPriority,
  partitionAutomationRuntimeEntries,
} from "./workspace-scripts-panel.utils";

function openExternalUrl(url: string) {
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

/* ---------- Live duration (ticks only while running) ---------- */
function LiveDuration(props: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const label = formatScriptDuration(Math.max(0, now - props.startedAt));
  return label ? <span className="tabular-nums">{label}</span> : null;
}

function OriginLabel(props: { origin?: ScriptEntryOrigin }) {
  if (!props.origin) {
    return null;
  }
  return (
    <span>
      {props.origin.tier === "workspace" ? "Workspace" : "Project"}
      {props.origin.localOverride ? " + local override" : ""}
    </span>
  );
}

/* ---------- Orbit URL pill ---------- */
function OrbitUrlBadge(props: {
  url: string;
  lensAvailable: boolean;
  onOpenInLens: (url: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-muted"
      onClick={() => void props.onOpenInLens(props.url)}
      title={props.lensAvailable ? "Open in Lens" : "Open in browser"}
      aria-label={
        props.lensAvailable
          ? "Open Orbit URL in Lens"
          : "Open Orbit URL in browser"
      }
    >
      <Globe className="size-3 shrink-0" />
      <span className="truncate">{props.url}</span>
      {props.lensAvailable ? (
        <span className="shrink-0 text-[10px] leading-4 text-muted-foreground">
          Lens
        </span>
      ) : (
        <ExternalLink className="size-3 shrink-0 opacity-60" />
      )}
    </button>
  );
}

function RuntimeSection(props: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border first:border-t-0">
      <div className="flex items-center justify-between py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {props.title}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {props.count}
        </span>
      </div>
      <div>{props.children}</div>
    </section>
  );
}

function ProcessQuickAddForm(props: {
  workspaceId: string;
  workspacePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setLabel("");
    setCommand("");
    setOpen(false);
  }, []);

  const submit = useCallback(async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    const result = await persistWorkspaceServiceQuickAdd({
      workspacePath: props.workspacePath,
      label,
      command,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not add process", { description: result.message });
      return;
    }
    reset();
    void refreshScriptsRuntime(props.workspaceId);
    toast.success("Process added");
  }, [command, label, props.workspaceId, props.workspacePath, reset, saving]);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-md"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 size-3.5" />
        Add process
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Name</span>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Dev server"
          autoFocus
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Command</span>
        <Textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={"bun run dev"}
          className="min-h-16"
        />
      </label>
      <div className="flex items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={reset}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-8" disabled={saving}>
          {saving ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function WorkspaceToolsEmptyState(props: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Empty className={cn(props.compact && "flex-none gap-2 px-4 py-5")}>
      <EmptyHeader className={cn(props.compact && "gap-1")}>
        <EmptyMedia className={cn(props.compact && "mb-0")}>
          {props.icon}
        </EmptyMedia>
        <EmptyTitle className={cn(props.compact && "text-sm")}>
          {props.title}
        </EmptyTitle>
        <EmptyDescription className={cn(props.compact && "text-xs/relaxed")}>
          {props.description}
        </EmptyDescription>
      </EmptyHeader>
      {props.action}
    </Empty>
  );
}

/* ---------- Hook row ---------- */
function HookRow(props: {
  trigger: ScriptTrigger;
  refs: NonNullable<ResolvedWorkspaceScriptsConfig["hooks"][ScriptTrigger]>;
  onRun: (trigger: ScriptTrigger) => Promise<void>;
  running: boolean;
}) {
  const triggerMeta = SCRIPT_TRIGGER_METADATA[props.trigger];
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">
          {triggerMeta.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {triggerMeta.description}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {props.refs
            .map((ref) => `${ref.scriptKind}:${ref.scriptId}`)
            .join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 rounded-md px-2.5"
        onClick={() => void props.onRun(props.trigger)}
        disabled={props.running}
        aria-label={`Run ${triggerMeta.label} hook`}
      >
        {props.running ? (
          <Loader aria-hidden className="mr-1" size="xs" variant="steps" />
        ) : (
          <Play className="mr-1 size-3.5" />
        )}
        Run
      </Button>
    </div>
  );
}

/* ---------- Script entry row ---------- */
function ScriptEntryRow(props: {
  scriptId: string;
  scriptKind: ScriptKind;
  label: string;
  description: string;
  targetLabel: string;
  orbitEnabled: boolean;
  state: ScriptUiState | undefined;
  origin?: ScriptEntryOrigin;
  lensAvailable: boolean;
  onOpenOrbitUrlInLens: (url: string) => Promise<void>;
  onRun: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
  onStop: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
  onClearLog: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
}) {
  const state = props.state;
  const isRunning = state?.running ?? false;
  const isFinished =
    !isRunning &&
    (state?.endedAt !== undefined ||
      state?.exitCode !== undefined ||
      Boolean(state?.error));
  const didFail =
    Boolean(state?.error) ||
    (state?.exitCode !== undefined && state.exitCode !== 0);

  return (
    <div
      className={cn(
        "border-b border-border py-3 last:border-b-0",
        isRunning && "border-l-2 border-l-primary pl-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-medium text-foreground">{props.label}</p>
            <span className="text-[11px] text-muted-foreground">
              {props.targetLabel}
              {props.origin ? (
                <>
                  {" · "}
                  <OriginLabel origin={props.origin} />
                </>
              ) : null}
              {props.orbitEnabled ? " · Orbit" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {isRunning ? (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Running
                {state?.startedAt !== undefined ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="text-muted-foreground">
                      <LiveDuration startedAt={state.startedAt} />
                    </span>
                  </>
                ) : null}
              </span>
            ) : isFinished ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span
                  className={cn(
                    "font-medium",
                    didFail ? "text-destructive" : "text-success",
                  )}
                >
                  {state?.exitCode !== undefined
                    ? `Exit ${state.exitCode}`
                    : didFail
                      ? "Failed"
                      : "Done"}
                </span>
                {state?.endedAt !== undefined ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{formatScriptRelativeTime(state.endedAt)}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          {props.description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {props.description}
            </p>
          ) : null}
          {state?.sourceLabel ? (
            <p className="text-[11px] text-muted-foreground/70">
              {state.sourceLabel}
            </p>
          ) : null}
          {state?.orbitUrl ? (
            <OrbitUrlBadge
              url={state.orbitUrl}
              lensAvailable={props.lensAvailable}
              onOpenInLens={props.onOpenOrbitUrlInLens}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {state?.orbitUrl ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md"
                onClick={() => openExternalUrl(state.orbitUrl ?? "")}
                title="Open in browser"
                aria-label="Open Orbit URL in browser"
              >
                <ExternalLink className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md"
                onClick={() => void copyTextToClipboard(state.orbitUrl ?? "")}
                title="Copy URL"
                aria-label="Copy Orbit URL"
              >
                <Copy className="size-3.5" />
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            className="h-8 rounded-md px-2.5"
            variant={isRunning ? "outline" : "default"}
            onClick={() =>
              isRunning
                ? props.onStop({
                    scriptId: props.scriptId,
                    scriptKind: props.scriptKind,
                  })
                : props.onRun({
                    scriptId: props.scriptId,
                    scriptKind: props.scriptKind,
                  })
            }
          >
            {isRunning ? (
              <Square className="mr-1 size-3.5" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            {isRunning ? "Stop" : props.orbitEnabled ? "Start" : "Run"}
          </Button>
        </div>
      </div>
      <ScriptLogView
        log={state?.log ?? ""}
        running={isRunning}
        error={state?.error}
        exitCode={state?.exitCode}
        startedAt={state?.startedAt}
        endedAt={state?.endedAt}
        onClear={() =>
          props.onClearLog({
            scriptId: props.scriptId,
            scriptKind: props.scriptKind,
          })
        }
      />
    </div>
  );
}

/* ---------- Main panel ---------- */
export function WorkspaceScriptsPanel(props: {
  onOpenSettings?: (options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
}) {
  const [
    activeWorkspaceId,
    activeTaskId,
    projectPath,
    workspacePath,
    workspaceBranch,
    workspaces,
    tasks,
    activeTurnIdsByTask,
    lensSessionScope,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.activeTaskId,
          state.projectPath,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.workspaceBranchById[state.activeWorkspaceId] ?? "",
          state.workspaces,
          state.tasks,
          state.activeTurnIdsByTask,
          state.settings.lensSessionScope,
        ] as const,
    ),
  );

  const [activeView, setActiveView] = useState<WorkspaceToolsViewId>(
    DEFAULT_WORKSPACE_TOOLS_VIEW,
  );

  const workspaceName = useMemo(
    () =>
      (workspaces.find((workspace) => workspace.id === activeWorkspaceId)
        ?.name ??
        workspaceBranch) ||
      "workspace",
    [activeWorkspaceId, workspaceBranch, workspaces],
  );
  const activeTask = useMemo(
    () =>
      tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ??
      null,
    [activeTaskId, tasks],
  );
  const activeTurnId = activeTaskId
    ? activeTurnIdsByTask[activeTaskId]
    : undefined;

  const runtime = useWorkspaceScriptsRuntime(
    activeWorkspaceId && projectPath && workspacePath
      ? {
          workspaceId: activeWorkspaceId,
          projectPath,
          workspacePath,
          workspaceName,
          branch: workspaceBranch || workspaceName,
        }
      : null,
  );

  const runEntry = useCallback(
    (args: { scriptId: string; scriptKind: ScriptKind }) => {
      if (!activeWorkspaceId) {
        toast.error("Execution service unavailable");
        return;
      }
      void runScriptEntry({ workspaceId: activeWorkspaceId, ...args });
    },
    [activeWorkspaceId],
  );

  const stopEntry = useCallback(
    (args: { scriptId: string; scriptKind: ScriptKind }) => {
      if (!activeWorkspaceId) {
        toast.error("Execution service unavailable");
        return;
      }
      void stopScriptEntry({ workspaceId: activeWorkspaceId, ...args });
    },
    [activeWorkspaceId],
  );

  const clearLog = useCallback(
    (args: { scriptId: string; scriptKind: ScriptKind }) => {
      if (!activeWorkspaceId) {
        return;
      }
      clearScriptLog({ workspaceId: activeWorkspaceId, ...args });
    },
    [activeWorkspaceId],
  );

  const openOrbitUrlInLens = useCallback(
    async (url: string) => {
      const result = await openOrbitUrlWithLensPriority({
        url,
        workspaceId: activeWorkspaceId,
        projectPath,
        lensSessionScope,
        lensApi: window.api?.lens ?? null,
        resolveLensSessionId: () => {
          const state = useAppStore.getState();
          // Reuse the most recently created lens tab (same convention as the
          // right rail); otherwise create a fresh one via the store.
          const existing = state.lensTabs[state.lensTabs.length - 1]?.id;
          return existing ?? state.createLensTab();
        },
        focusLensSurface: (lensSessionId) => {
          paneHost.openSurface({ kind: "lens", lensSessionId });
        },
        openExternalUrl,
      });

      if (!result.ok) {
        toast.error("Lens navigation failed", {
          description: result.message,
        });
      }
    },
    [activeWorkspaceId, lensSessionScope, projectPath],
  );

  const runHook = useCallback(
    async (trigger: ScriptTrigger) => {
      if (!activeWorkspaceId) {
        toast.error("Execution service unavailable");
        return;
      }
      await runScriptHook({
        workspaceId: activeWorkspaceId,
        trigger,
        context: {
          ...(activeTask?.id ? { taskId: activeTask.id } : {}),
          ...(activeTask?.title ? { taskTitle: activeTask.title } : {}),
          ...(activeTurnId ? { turnId: activeTurnId } : {}),
        },
      });
    },
    [activeTask, activeTurnId, activeWorkspaceId],
  );

  const refresh = useCallback(() => {
    if (activeWorkspaceId) {
      void refreshScriptsRuntime(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const stopAll = useCallback(() => {
    if (activeWorkspaceId) {
      void stopAllScripts(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const config = runtime.config;
  const hookEntries = config
    ? (Object.entries(config.hooks) as Array<
        [
          ScriptTrigger,
          NonNullable<ResolvedWorkspaceScriptsConfig["hooks"][ScriptTrigger]>,
        ]
      >)
    : [];
  const actionCount = config?.actions.length ?? 0;
  const serviceCount = config?.services.length ?? 0;
  const hookCount = hookEntries.length;
  const commandEntries = useMemo<ResolvedWorkspaceScript[]>(
    () => (config ? [...config.services, ...config.actions] : []),
    [config],
  );
  const runtimePartitions = useMemo(
    () => partitionAutomationRuntimeEntries(commandEntries, runtime.entries),
    [commandEntries, runtime.entries],
  );
  const runningCount = useMemo(
    () => countRunningServiceEntries(runtime.entries),
    [runtime.entries],
  );
  const detachedRunningCount = Math.max(
    0,
    runningCount - runtimePartitions.running.length,
  );
  const availableProcesses = useMemo(
    () =>
      (config?.services ?? []).filter(
        (entry) =>
          !runtime.entries[scriptEntryKey(entry.kind, entry.id)]?.running,
      ),
    [config?.services, runtime.entries],
  );
  const activityCount = runtimePartitions.activity.length;
  const viewCounts: Record<WorkspaceToolsViewId, number> = {
    commands: actionCount,
    processes: runningCount > 0 ? runningCount : serviceCount,
    triggers: hookCount,
    runs: activityCount,
  };
  const lensAvailable =
    typeof window !== "undefined" &&
    Boolean(window.api?.lens?.openSession && window.api?.lens?.navigate);

  const openScriptSettings = useCallback(() => {
    props.onOpenSettings?.({
      section: "scripts",
      projectPath: projectPath ?? null,
    });
  }, [projectPath, props.onOpenSettings]);

  const originFor = useCallback(
    (kind: ScriptKind, id: string) =>
      runtime.origins.originByKey[scriptEntryKey(kind, id)],
    [runtime.origins],
  );

  const renderScriptEntry = (
    entry: ResolvedWorkspaceScript,
    state = runtime.entries[scriptEntryKey(entry.kind, entry.id)],
  ) => (
    <ScriptEntryRow
      key={scriptEntryKey(entry.kind, entry.id)}
      scriptId={entry.id}
      scriptKind={entry.kind}
      label={entry.label}
      description={entry.description}
      targetLabel={entry.target.label}
      orbitEnabled={Boolean(entry.orbit)}
      state={state}
      origin={originFor(entry.kind, entry.id)}
      lensAvailable={lensAvailable}
      onOpenOrbitUrlInLens={openOrbitUrlInLens}
      onRun={runEntry}
      onStop={stopEntry}
      onClearLog={clearLog}
    />
  );

  if (!workspacePath) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <Sparkles className="size-4" />
          </EmptyMedia>
          <EmptyTitle>{WORKSPACE_TOOLS_LABEL} unavailable</EmptyTitle>
          <EmptyDescription>
            Select a workspace to inspect its processes and commands.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => setActiveView(value as WorkspaceToolsViewId)}
      className="h-full min-h-0 gap-0 overflow-hidden"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border pr-2">
        <TabsList
          variant="soft"
          className="h-10 min-w-0 flex-1 justify-start border-0 px-2 py-1"
          aria-label={`${WORKSPACE_TOOLS_LABEL} views`}
        >
          {WORKSPACE_TOOLS_VIEWS.map(({ id, label }) => {
            const count = viewCounts[id];
            return (
              <TabsTrigger
                key={id}
                value={id}
                className="h-8 flex-none px-2.5 text-xs"
              >
                {label}
                {count > 0 ? (
                  <span
                    className={cn(
                      "tabular-nums text-muted-foreground",
                      id === "processes" && runningCount > 0 && "text-primary",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="flex items-center gap-1">
          {activeView === "processes" && runningCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-md px-2 text-destructive hover:text-destructive"
              onClick={stopAll}
              title="Stop all running processes"
            >
              <Square className="mr-1 size-3.5" />
              Stop all
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-md"
            onClick={refresh}
            disabled={runtime.configStatus === "loading"}
            title={`Refresh ${WORKSPACE_TOOLS_LABEL}`}
            aria-label={`Refresh ${WORKSPACE_TOOLS_LABEL}`}
          >
            <RefreshCcw
              className={cn(
                "size-3.5",
                runtime.configStatus === "loading" && "animate-spin",
              )}
            />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-md"
            onClick={openScriptSettings}
            disabled={!projectPath}
            title={`Open ${WORKSPACE_TOOLS_LABEL} settings`}
            aria-label={`Open ${WORKSPACE_TOOLS_LABEL} settings`}
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {runtime.configError ? (
        <div
          role="alert"
          className="shrink-0 border-b border-destructive/30 px-3 py-2 text-xs text-destructive"
        >
          {runtime.configError}
        </div>
      ) : null}

      <TabsContent value="commands" className="min-h-0 overflow-auto px-3 py-2">
        {runtime.configStatus === "loading" && !config ? (
          <div className="px-1 py-4 text-xs text-muted-foreground">
            Loading commands…
          </div>
        ) : null}

        {runtime.configStatus === "ready" && actionCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Zap className="size-4" />}
            title="No commands configured"
            description="Add a one-shot command in Workspace Tools settings. Run it from this tab when you need it."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1 h-8 rounded-md"
                onClick={openScriptSettings}
                disabled={!projectPath}
              >
                <Settings2 className="mr-1 size-4" />
                Manage workspace tools
              </Button>
            }
          />
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className="px-2 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Commands could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={refresh}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {config && actionCount > 0 ? (
          <RuntimeSection title="Commands" count={actionCount}>
            {config.actions.map((entry) => renderScriptEntry(entry))}
          </RuntimeSection>
        ) : null}
      </TabsContent>

      <TabsContent
        value="processes"
        className="min-h-0 overflow-auto px-3 py-2"
      >
        {runtime.configStatus === "loading" && !config ? (
          <div className="px-1 py-4 text-xs text-muted-foreground">
            Loading processes…
          </div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className="px-2 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Processes could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={refresh}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {runtime.configStatus === "ready" &&
        serviceCount === 0 &&
        detachedRunningCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Play className="size-4" />}
            title="No processes configured"
            description="Add a long-running process such as a dev server in Workspace Tools settings. Start it here and leave it running while you work."
            action={
              activeWorkspaceId ? (
                <div className="mt-1 w-full max-w-sm">
                  <ProcessQuickAddForm
                    workspaceId={activeWorkspaceId}
                    workspacePath={workspacePath}
                  />
                </div>
              ) : null
            }
          />
        ) : null}

        {runtime.configStatus === "ready" &&
        serviceCount > 0 &&
        activeWorkspaceId ? (
          <div className="mb-3">
            <ProcessQuickAddForm
              workspaceId={activeWorkspaceId}
              workspacePath={workspacePath}
            />
          </div>
        ) : null}

        {config &&
        serviceCount > 0 &&
        runtimePartitions.running.length === 0 ? (
          <p className="px-1 pb-3 text-xs leading-5 text-muted-foreground">
            Nothing is running. Start a process below and leave it up while you
            work. Output and stop stay on this tab.
          </p>
        ) : null}

        {runtimePartitions.running.length > 0 ? (
          <RuntimeSection
            title="Running"
            count={runtimePartitions.running.length}
          >
            {runtimePartitions.running.map(({ entry, state }) =>
              renderScriptEntry(entry, state),
            )}
          </RuntimeSection>
        ) : null}

        {detachedRunningCount > 0 ? (
          <div className="border-t border-border px-2 py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {detachedRunningCount === 1
                ? "A detached process is still running"
                : `${detachedRunningCount} detached processes are still running`}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Their commands are no longer in the active config. Use Stop all to
              terminate them safely.
            </p>
          </div>
        ) : null}

        {availableProcesses.length > 0 ? (
          <RuntimeSection
            title="Ready to start"
            count={availableProcesses.length}
          >
            {availableProcesses.map((entry) => renderScriptEntry(entry))}
          </RuntimeSection>
        ) : null}
      </TabsContent>

      <TabsContent value="triggers" className="min-h-0 overflow-auto px-3 py-2">
        {runtime.configStatus === "loading" && !config ? (
          <div className="px-1 py-4 text-xs text-muted-foreground">
            Loading triggers…
          </div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className="px-2 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Triggers could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={refresh}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {runtime.configStatus === "ready" && hookCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Sparkles className="size-4" />}
            title="No triggers configured"
            description="Connect commands or processes to task, turn, and pull request lifecycle events in Settings."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1 h-8 rounded-md"
                onClick={openScriptSettings}
                disabled={!projectPath}
              >
                <Settings2 className="mr-1 size-4" />
                Manage workspace tools
              </Button>
            }
          />
        ) : null}

        {config && hookCount > 0 ? (
          <RuntimeSection title="Lifecycle triggers" count={hookCount}>
            {hookEntries.map(([trigger, refs]) => (
              <HookRow
                key={trigger}
                trigger={trigger}
                refs={refs}
                onRun={runHook}
                running={Boolean(runtime.hookRunningByTrigger[trigger])}
              />
            ))}
          </RuntimeSection>
        ) : null}
      </TabsContent>

      <TabsContent value="runs" className="min-h-0 overflow-auto px-3 py-2">
        {runtimePartitions.activity.length > 0 ? (
          <RuntimeSection
            title="Recent runs"
            count={runtimePartitions.activity.length}
          >
            {runtimePartitions.activity.map(({ entry, state }) =>
              renderScriptEntry(entry, state),
            )}
          </RuntimeSection>
        ) : (
          <WorkspaceToolsEmptyState
            icon={<History className="size-4" />}
            title="No recent activity"
            description="Completed commands and processes, including their output, appear here."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
