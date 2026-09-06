import { toolStyles } from "./workspace-tools.styles";
import { sx } from "../ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { WorkspaceToolQuickAdd } from "./WorkspaceToolQuickAdd";
import { SectionTabs } from "@/components/system/SectionTabs";
import { ActionButton } from "@/components/system/ActionButton";
import { StatusBadge } from "@/components/system/WorkspaceSurface";
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
  X,
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
  Input,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Loader,
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
  return label ? <span className={sx(toolStyles.duration)}>{label}</span> : null;
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
    <AdsButton layout="host"
      type="button"
      xstyle={toolStyles.url}
      onClick={() => void props.onOpenInLens(props.url)}
      title={props.lensAvailable ? "Open in Lens" : "Open in browser"}
      aria-label={
        props.lensAvailable
          ? "Open Orbit URL in Lens"
          : "Open Orbit URL in browser"
      }
    >
      <Globe className={sx(toolStyles.smallIcon)} />
      <span className={sx(toolStyles.truncated)}>{props.url}</span>
      {props.lensAvailable ? (
        <span className={sx(toolStyles.urlHint)}>
          Lens
        </span>
      ) : (
        <ExternalLink className={sx(toolStyles.externalIcon)} />
      )}
    </AdsButton>
  );
}

function RuntimeSection(props: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className={sx(toolStyles.section)}>
      <div className={sx(toolStyles.sectionHeader)}>
        <h3 className={sx(toolStyles.sectionTitle)}>
          {props.title}
        </h3>
        <span className={sx(toolStyles.sectionCount)}>
          {props.count}
        </span>
      </div>
      <div>{props.children}</div>
    </section>
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
    <Empty xstyle={props.compact && toolStyles.compactEmpty}>
      <EmptyHeader xstyle={props.compact && toolStyles.compactHeader}>
        <EmptyMedia xstyle={props.compact && toolStyles.compactMedia}>
          {props.icon}
        </EmptyMedia>
        <EmptyTitle xstyle={props.compact && toolStyles.compactTitle}>
          {props.title}
        </EmptyTitle>
        <EmptyDescription xstyle={props.compact && toolStyles.description}>
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
    <div className={sx(toolStyles.hook)}>
      <div className={sx(toolStyles.hookText)}>
        <p className={sx(toolStyles.title)}>
          {triggerMeta.label}
        </p>
        <p className={sx(toolStyles.muted)}>
          {triggerMeta.description}
        </p>
        <p className={sx(toolStyles.truncatedHint)}>
          {props.refs
            .map((ref) => `${ref.scriptKind}:${ref.scriptId}`)
            .join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        xstyle={toolStyles.runButton}
        onClick={() => void props.onRun(props.trigger)}
        disabled={props.running}
        aria-label={`Run ${triggerMeta.label} hook`}
      >
        {props.running ? (
          <Loader aria-hidden className={sx(toolStyles.loader)} size="xs" variant="steps" />
        ) : (
          <Play className={sx(toolStyles.runIcon)} />
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
  selected: boolean;
  onInspect: () => void;
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
      className={sx(toolStyles.entry, props.selected && toolStyles.selected)}
    >
      <div className={sx(toolStyles.entryHeader)}>
        <div className={sx(toolStyles.entryBody)}>
          <div className={sx(toolStyles.entryTitleRow)}>
            <AdsButton layout="host" type="button" onClick={props.onInspect} aria-pressed={props.selected} xstyle={toolStyles.inspect}>{props.label}</AdsButton>
            <span className={sx(toolStyles.hint)}>
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
          <div className={sx(toolStyles.stateRow)}>
            {isRunning ? (
              <span className={sx(toolStyles.running)}>
                <span className={sx(toolStyles.runningMark)} />
                Running
                {state?.startedAt !== undefined ? (
                  <>
                    <span className={sx(toolStyles.separator)}>·</span>
                    <span className={sx(toolStyles.metadata)}>
                      <LiveDuration startedAt={state.startedAt} />
                    </span>
                  </>
                ) : null}
              </span>
            ) : isFinished ? (
              <span className={sx(toolStyles.finished)}>
                <span
                  className={sx(
                    didFail ? toolStyles.failed : toolStyles.success,
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
                    <span className={sx(toolStyles.separator)}>·</span>
                    <span>{formatScriptRelativeTime(state.endedAt)}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          {props.description ? (
            <p className={sx(toolStyles.description)}>
              {props.description}
            </p>
          ) : null}
          {state?.sourceLabel ? (
            <p className={sx(toolStyles.detail)}>
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
        <div className={sx(toolStyles.actions)}>
          {state?.orbitUrl ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                xstyle={toolStyles.iconButton}
                onClick={() => openExternalUrl(state.orbitUrl ?? "")}
                title="Open in browser"
                aria-label="Open Orbit URL in browser"
              >
                <ExternalLink className={sx(toolStyles.icon)} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                xstyle={toolStyles.iconButton}
                onClick={() => void copyTextToClipboard(state.orbitUrl ?? "")}
                title="Copy URL"
                aria-label="Copy Orbit URL"
              >
                <Copy className={sx(toolStyles.icon)} />
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            xstyle={toolStyles.runButton}
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
              <Square className={sx(toolStyles.runIcon)} />
            ) : (
              <Play className={sx(toolStyles.runIcon)} />
            )}
            {isRunning ? "Stop" : props.orbitEnabled ? "Start" : "Run"}
          </Button>
        </div>
      </div>
      <Button size="xs" variant="ghost" onClick={props.onInspect} aria-pressed={props.selected}>View output</Button>
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

  const [selection, setSelection] = useState<{ workspaceId: string; key: string } | null>(null);
  const [search, setSearch] = useState("");

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
      setSelection({ workspaceId: activeWorkspaceId, key: scriptEntryKey(args.scriptKind, args.scriptId) });
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

  const selectedEntry = selection?.workspaceId === activeWorkspaceId ? commandEntries.find((entry) => scriptEntryKey(entry.kind, entry.id) === selection.key) : undefined;
  const selectedState = selectedEntry ? runtime.entries[scriptEntryKey(selectedEntry.kind, selectedEntry.id)] : undefined;

  const renderScriptEntry = (
    entry: ResolvedWorkspaceScript,
    state = runtime.entries[scriptEntryKey(entry.kind, entry.id)],
  ) => !`${entry.label} ${entry.description}`.toLowerCase().includes(search.trim().toLowerCase()) ? null : (
    <ScriptEntryRow
      key={scriptEntryKey(entry.kind, entry.id)}
      selected={selectedEntry === entry}
      onInspect={() => setSelection({ workspaceId: activeWorkspaceId, key: scriptEntryKey(entry.kind, entry.id) })}
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
            <Sparkles className={sx(toolStyles.sectionIcon)} />
          </EmptyMedia>
          <EmptyTitle>{WORKSPACE_TOOLS_LABEL} unavailable</EmptyTitle>
          <EmptyDescription>
            Select a workspace to inspect its processes and commands.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const viewContents: Record<WorkspaceToolsViewId, ReactNode> = {
    commands: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            Loading commands…
          </div>
        ) : null}

        {runtime.configStatus === "ready" && actionCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Zap className={sx(toolStyles.sectionIcon)} />}
            title="No commands configured"
            description="Save a check, build, or other command. Run it when you need it and keep its output here."
            action={activeWorkspaceId ? <div className={sx(toolStyles.quickAdd)}><WorkspaceToolQuickAdd key={`${activeWorkspaceId}:action`} kind="action" workspaceId={activeWorkspaceId} workspacePath={workspacePath} /></div> : null}
          />
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              Commands could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
              onClick={refresh}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {config && actionCount > 0 ? <div className={sx(toolStyles.addForm)}><WorkspaceToolQuickAdd key={`${activeWorkspaceId}:action`} kind="action" workspaceId={activeWorkspaceId} workspacePath={workspacePath} /></div> : null}
        {config && actionCount > 0 ? (
          <RuntimeSection title="Commands" count={actionCount}>
            {config.actions.map((entry) => renderScriptEntry(entry))}
          </RuntimeSection>
        ) : null}
      </div>,
    processes: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            Loading processes…
          </div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              Processes could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
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
            icon={<Play className={sx(toolStyles.sectionIcon)} />}
            title="No processes configured"
            description="Add a long-running process such as a dev server in Workspace Tools settings. Start it here and leave it running while you work."
            action={
              activeWorkspaceId ? (
                <div className={sx(toolStyles.quickAdd)}>
                  <WorkspaceToolQuickAdd
                    key={`${activeWorkspaceId}:service`}
                    kind="service"
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
          <div className={sx(toolStyles.addForm)}>
            <WorkspaceToolQuickAdd
                    key={`${activeWorkspaceId}:service`}
                    kind="service"
              workspaceId={activeWorkspaceId}
              workspacePath={workspacePath}
            />
          </div>
        ) : null}

        {config &&
        serviceCount > 0 &&
        runtimePartitions.running.length === 0 ? (
          <p className={sx(toolStyles.viewDescription)}>
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
          <div className={sx(toolStyles.inactive)}>
            <p className={sx(toolStyles.title)}>
              {detachedRunningCount === 1
                ? "A detached process is still running"
                : `${detachedRunningCount} detached processes are still running`}
            </p>
            <p className={sx(toolStyles.inactiveHint)}>
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
      </div>,
    triggers: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            Loading triggers…
          </div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              Triggers could not be loaded
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
              onClick={refresh}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {runtime.configStatus === "ready" && hookCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Sparkles className={sx(toolStyles.sectionIcon)} />}
            title="No triggers configured"
            description="Connect commands or processes to task, turn, and pull request lifecycle events in Settings."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                xstyle={toolStyles.settingsButton}
                onClick={openScriptSettings}
                disabled={!projectPath}
              >
                <Settings2 className={sx(toolStyles.settingsIcon)} />
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
      </div>,
    runs: <div className={sx(toolStyles.view)}>
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
            icon={<History className={sx(toolStyles.sectionIcon)} />}
            title="No recent activity"
            description="Completed commands and processes, including their output, appear here."
          />
        )}
      </div>,
  };
  return (
    <section className={sx(toolStyles.panel)} aria-label="Workspace tools">
      <header className={sx(toolStyles.header)}>
        <div className={sx(toolStyles.headingRow)}>
          <div className={sx(toolStyles.heading)}>
            <h2 className={sx(toolStyles.panelTitle)}>Workspace tools</h2>
            <p className={sx(toolStyles.workspaceName)} title={workspacePath}>{workspaceName}</p>
          </div>
          <div className={sx(toolStyles.headerActions)}>
            {runningCount > 0 ? <StatusBadge tone="active">{runningCount} running</StatusBadge> : null}
            {runningCount > 0 ? <ActionButton size="sm" weight="quiet" tone="danger" onClick={stopAll} title="Stop all running processes"><Square className={sx(toolStyles.icon)} />Stop all</ActionButton> : null}
            <ActionButton size="sm" weight="quiet" onClick={refresh} disabled={runtime.configStatus === "loading"} aria-label="Refresh Workspace tools" title="Refresh Workspace tools"><RefreshCcw className={sx(toolStyles.icon, runtime.configStatus === "loading" && toolStyles.refreshing)} /></ActionButton>
            <ActionButton size="sm" weight="quiet" onClick={openScriptSettings} disabled={!projectPath} aria-label="Open Workspace tools settings" title="Open Workspace tools settings"><Settings2 className={sx(toolStyles.icon)} /></ActionButton>
          </div>
        </div>
        <p className={sx(toolStyles.description)}>{WORKSPACE_TOOLS_VIEWS.find((view) => view.id === activeView)?.description}</p>
        <Input aria-label="Find a workspace tool" placeholder="Find a command or process…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </header>
      {runtime.configError ? <p role="alert" className={sx(toolStyles.configError)}>{runtime.configError}</p> : null}
      {search.trim() ? <section aria-label="Tool search results" className={sx(toolStyles.search)}>
        {commandEntries.some((entry) => `${entry.label} ${entry.description}`.toLowerCase().includes(search.trim().toLowerCase()))
          ? commandEntries.map((entry) => renderScriptEntry(entry))
          : <p role="status" className={sx(toolStyles.noResults)}>No matching commands or processes.</p>}
      </section> : null}
      <div className={sx(toolStyles.views, Boolean(search.trim()) && toolStyles.hidden)}>
      <SectionTabs
        fillHeight
        wrap
        label="Workspace tools views"
        value={activeView}
        onValueChange={(value) => {
          const view = WORKSPACE_TOOLS_VIEWS.find((item) => item.id === value);
          if (view) setActiveView(view.id);
        }}
        items={WORKSPACE_TOOLS_VIEWS.map((view) => ({
          id: view.id,
          label: viewCounts[view.id] ? `${view.label} · ${viewCounts[view.id]}` : view.label,
          content: viewContents[view.id],
          keepMounted: view.id === "processes" || view.id === "commands",
        }))}
      />
      </div>
      {selectedEntry ? <section aria-label={`Output: ${selectedEntry.label}`} className={sx(toolStyles.output)}>
        <div className={sx(toolStyles.outputHeader)}>
          <h3 className={sx(toolStyles.outputTitle)}>{selectedEntry.label}</h3>
          <Button variant="ghost" size="icon-xs" aria-label="Close output" onClick={() => setSelection(null)}><X /></Button>
        </div>
        {selectedState?.log || selectedState?.error ? <ScriptLogView log={selectedState.log ?? ""} running={selectedState.running} error={selectedState.error} exitCode={selectedState.exitCode} startedAt={selectedState.startedAt} endedAt={selectedState.endedAt} onClear={() => clearLog({ scriptId: selectedEntry.id, scriptKind: selectedEntry.kind })} expandable={false} /> : <p role="status" className={sx(toolStyles.noOutput)}>{selectedState?.running ? "Waiting for output…" : "Run this tool to see its output here."}</p>}
      </section> : null}
    </section>
  );
}
