import { i18n, useTranslation } from "@/i18n";
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
  WORKSPACE_TOOLS_LABEL_KEY,
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
  const { t: tI18n } = useTranslation(["scripts"]);
  if (!props.origin) {
    return null;
  }
  return (
    <span>
      {props.origin.tier === "workspace" ? tI18n("scripts:workspaceScriptsPanel.workspace") : tI18n("scripts:workspaceScriptsPanel.repository")}
      {props.origin.localOverride ? tI18n("scripts:workspaceScriptsPanel.localOverride") : ""}
    </span>
  );
}

/* ---------- Orbit URL pill ---------- */
function OrbitUrlBadge(props: {
  url: string;
  lensAvailable: boolean;
  onOpenInLens: (url: string) => Promise<void>;
}) {
  const { t: tI18n } = useTranslation(["scripts"]);
  return (
    <AdsButton layout="host"
      type="button"
      xstyle={toolStyles.url}
      onClick={() => void props.onOpenInLens(props.url)}
      title={props.lensAvailable ? tI18n("scripts:workspaceScriptsPanel.openInLens") : tI18n("scripts:workspaceScriptsPanel.openInBrowser")}
      aria-label={
        props.lensAvailable
          ? tI18n("scripts:workspaceScriptsPanel.openOrbitUrlInLens")
          : tI18n("scripts:workspaceScriptsPanel.openOrbitUrlInBrowser")
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
  const { t: tI18n } = useTranslation(["scripts"]);
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
        aria-label={tI18n("scripts:workspaceScriptsPanel.runValueHook", { value1: triggerMeta.label })}
      >
        {props.running ? (
          <Loader aria-hidden className={sx(toolStyles.loader)} size="xs" variant="steps" />
        ) : (
          <Play className={sx(toolStyles.runIcon)} />
        )}
        {tI18n("scripts:workspaceScriptsPanel.run")}</Button>
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
  const { t: tI18n } = useTranslation(["scripts"]);
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
              {props.orbitEnabled ? tI18n("scripts:workspaceScriptsPanel.orbit") : ""}
            </span>
          </div>
          <div className={sx(toolStyles.stateRow)}>
            {isRunning ? (
              <span className={sx(toolStyles.running)}>
                <span className={sx(toolStyles.runningMark)} />
                {tI18n("scripts:workspaceScriptsPanel.running")}{state?.startedAt !== undefined ? (
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
                    ? tI18n("scripts:workspaceScriptsPanel.exitValue", { value1: state.exitCode })
                    : didFail
                      ? tI18n("scripts:workspaceScriptsPanel.failed")
                      : tI18n("scripts:workspaceScriptsPanel.done")}
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
                title={tI18n("scripts:workspaceScriptsPanel.openInBrowser")}
                aria-label={tI18n("scripts:workspaceScriptsPanel.openOrbitUrlInBrowser")}
              >
                <ExternalLink className={sx(toolStyles.icon)} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                xstyle={toolStyles.iconButton}
                onClick={() => void copyTextToClipboard(state.orbitUrl ?? "")}
                title={tI18n("scripts:workspaceScriptsPanel.copyUrl")}
                aria-label={tI18n("scripts:workspaceScriptsPanel.copyOrbitUrl")}
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
            {isRunning ? tI18n("scripts:workspaceScriptsPanel.stop") : props.orbitEnabled ? tI18n("scripts:workspaceScriptsPanel.start") : tI18n("scripts:workspaceScriptsPanel.run")}
          </Button>
        </div>
      </div>
      <Button size="xs" variant="ghost" onClick={props.onInspect} aria-pressed={props.selected}>{tI18n("scripts:workspaceScriptsPanel.viewOutput")}</Button>
    </div>
  );
}

/* ---------- Main panel ---------- */
export function WorkspaceScriptsPanel(props: {
  onOpenSettings?: (options?: {
    repositoryPath?: string | null;
    section?: SectionId;
  }) => void;
}) {
  const { t: tI18n } = useTranslation(["scripts"]);
  const [
    activeWorkspaceId,
    activeTaskId,
    repositoryPath,
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
          state.repositoryPath,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.repositoryPath ??
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
    [activeWorkspaceId, workspaceBranch, workspaces, i18n.resolvedLanguage],
  );
  const activeTask = useMemo(
    () =>
      tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ??
      null,
    [activeTaskId, tasks, i18n.resolvedLanguage],
  );
  const activeTurnId = activeTaskId
    ? activeTurnIdsByTask[activeTaskId]
    : undefined;

  const runtime = useWorkspaceScriptsRuntime(
    activeWorkspaceId && repositoryPath && workspacePath
      ? {
          workspaceId: activeWorkspaceId,
          repositoryPath,
          workspacePath,
          workspaceName,
          branch: workspaceBranch || workspaceName,
        }
      : null,
  );

  const runEntry = useCallback(
    (args: { scriptId: string; scriptKind: ScriptKind }) => {
      if (!activeWorkspaceId) {
        toast.error(tI18n("scripts:workspaceScriptsPanel.executionServiceUnavailable"));
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
        toast.error(tI18n("scripts:workspaceScriptsPanel.executionServiceUnavailable"));
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
        repositoryPath,
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
        toast.error(tI18n("scripts:workspaceScriptsPanel.lensNavigationFailed"), {
          description: result.message,
        });
      }
    },
    [activeWorkspaceId, lensSessionScope, repositoryPath],
  );

  const runHook = useCallback(
    async (trigger: ScriptTrigger) => {
      if (!activeWorkspaceId) {
        toast.error(tI18n("scripts:workspaceScriptsPanel.executionServiceUnavailable"));
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
    [config, i18n.resolvedLanguage],
  );
  const runtimePartitions = useMemo(
    () => partitionAutomationRuntimeEntries(commandEntries, runtime.entries),
    [commandEntries, runtime.entries, i18n.resolvedLanguage],
  );
  const runningCount = useMemo(
    () => countRunningServiceEntries(runtime.entries),
    [runtime.entries, i18n.resolvedLanguage],
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
    [config?.services, runtime.entries, i18n.resolvedLanguage],
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
      repositoryPath: repositoryPath ?? null,
    });
  }, [repositoryPath, props.onOpenSettings]);

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
          <EmptyTitle>{tI18n("scripts:workspaceScriptsPanel.unavailableTitle")}</EmptyTitle>
          <EmptyDescription>
            {tI18n("scripts:workspaceScriptsPanel.selectAWorkspaceToInspectItsProcesses")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const viewContents: Record<WorkspaceToolsViewId, ReactNode> = {
    commands: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            {tI18n("scripts:workspaceScriptsPanel.loadingCommands")}</div>
        ) : null}

        {runtime.configStatus === "ready" && actionCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Zap className={sx(toolStyles.sectionIcon)} />}
            title={tI18n("scripts:workspaceScriptsPanel.noCommandsConfigured")}
            description={tI18n("scripts:workspaceScriptsPanel.saveACheckBuildOrOtherCommand")}
            action={activeWorkspaceId ? <div className={sx(toolStyles.quickAdd)}><WorkspaceToolQuickAdd key={`${activeWorkspaceId}:action`} kind="action" workspaceId={activeWorkspaceId} workspacePath={workspacePath} /></div> : null}
          />
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              {tI18n("scripts:workspaceScriptsPanel.commandsCouldNotBeLoaded")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
              onClick={refresh}
            >
              {tI18n("scripts:workspaceScriptsPanel.tryAgain")}</Button>
          </div>
        ) : null}

        {config && actionCount > 0 ? <div className={sx(toolStyles.addForm)}><WorkspaceToolQuickAdd key={`${activeWorkspaceId}:action`} kind="action" workspaceId={activeWorkspaceId} workspacePath={workspacePath} /></div> : null}
        {config && actionCount > 0 ? (
          <RuntimeSection title={tI18n("scripts:workspaceScriptsPanel.commands")} count={actionCount}>
            {config.actions.map((entry) => renderScriptEntry(entry))}
          </RuntimeSection>
        ) : null}
      </div>,
    processes: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            {tI18n("scripts:workspaceScriptsPanel.loadingProcesses")}</div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              {tI18n("scripts:workspaceScriptsPanel.processesCouldNotBeLoaded")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
              onClick={refresh}
            >
              {tI18n("scripts:workspaceScriptsPanel.tryAgain")}</Button>
          </div>
        ) : null}

        {runtime.configStatus === "ready" &&
        serviceCount === 0 &&
        detachedRunningCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Play className={sx(toolStyles.sectionIcon)} />}
            title={tI18n("scripts:workspaceScriptsPanel.noProcessesConfigured")}
            description={tI18n("scripts:workspaceScriptsPanel.addALongRunningProcessSuchAs")}
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
            {tI18n("scripts:workspaceScriptsPanel.nothingIsRunningStartAProcessBelow")}</p>
        ) : null}

        {runtimePartitions.running.length > 0 ? (
          <RuntimeSection
            title={tI18n("scripts:workspaceScriptsPanel.running")}
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
                ? tI18n("scripts:workspaceScriptsPanel.aDetachedProcessIsStillRunning")
                : tI18n("scripts:workspaceScriptsPanel.valueDetachedProcessesAreStillRunning", { detachedRunningCount: detachedRunningCount })}
            </p>
            <p className={sx(toolStyles.inactiveHint)}>
              {tI18n("scripts:workspaceScriptsPanel.theirCommandsAreNoLongerInThe")}</p>
          </div>
        ) : null}

        {availableProcesses.length > 0 ? (
          <RuntimeSection
            title={tI18n("scripts:workspaceScriptsPanel.readyToStart")}
            count={availableProcesses.length}
          >
            {availableProcesses.map((entry) => renderScriptEntry(entry))}
          </RuntimeSection>
        ) : null}
      </div>,
    triggers: <div className={sx(toolStyles.view)}>
        {runtime.configStatus === "loading" && !config ? (
          <div className={sx(toolStyles.loading)}>
            {tI18n("scripts:workspaceScriptsPanel.loadingTriggers")}</div>
        ) : null}

        {runtime.configStatus === "error" && !config ? (
          <div className={sx(toolStyles.setup)}>
            <p className={sx(toolStyles.title)}>
              {tI18n("scripts:workspaceScriptsPanel.triggersCouldNotBeLoaded")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={toolStyles.setupAction}
              onClick={refresh}
            >
              {tI18n("scripts:workspaceScriptsPanel.tryAgain")}</Button>
          </div>
        ) : null}

        {runtime.configStatus === "ready" && hookCount === 0 ? (
          <WorkspaceToolsEmptyState
            icon={<Sparkles className={sx(toolStyles.sectionIcon)} />}
            title={tI18n("scripts:workspaceScriptsPanel.noTriggersConfigured")}
            description={tI18n("scripts:workspaceScriptsPanel.connectCommandsOrProcessesToTaskTurn")}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                xstyle={toolStyles.settingsButton}
                onClick={openScriptSettings}
                disabled={!repositoryPath}
              >
                <Settings2 className={sx(toolStyles.settingsIcon)} />
                {tI18n("scripts:workspaceScriptsPanel.manageWorkspaceTools")}</Button>
            }
          />
        ) : null}

        {config && hookCount > 0 ? (
          <RuntimeSection title={tI18n("scripts:workspaceScriptsPanel.lifecycleTriggers")} count={hookCount}>
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
            title={tI18n("scripts:workspaceScriptsPanel.recentRuns")}
            count={runtimePartitions.activity.length}
          >
            {runtimePartitions.activity.map(({ entry, state }) =>
              renderScriptEntry(entry, state),
            )}
          </RuntimeSection>
        ) : (
          <WorkspaceToolsEmptyState
            icon={<History className={sx(toolStyles.sectionIcon)} />}
            title={tI18n("scripts:workspaceScriptsPanel.noRecentActivity")}
            description={tI18n("scripts:workspaceScriptsPanel.completedCommandsAndProcessesIncludingTheirOutput")}
          />
        )}
      </div>,
  };
  return (
    <section className={sx(toolStyles.panel)} aria-label={tI18n("scripts:workspaceScriptsPanel.workspaceTools")}>
      <header className={sx(toolStyles.header)}>
        {/*
          No panel title here: `RightRailPanelShell` already renders one above
          this element. The subhead names the workspace the tools belong to and
          carries the panel's actions as `xs` icon buttons.
        */}
        <div className={sx(toolStyles.headingRow)}>
          <div className={sx(toolStyles.heading)}>
            <h2 className={sx(toolStyles.workspaceName)} title={workspacePath}>{workspaceName}</h2>
          </div>
          <div className={sx(toolStyles.headerActions)}>
            {runningCount > 0 ? <StatusBadge tone="active">{tI18n("scripts:workspaceScriptsPanel.runningCount", { count: runningCount })}</StatusBadge> : null}
            {runningCount > 0 ? <ActionButton size="xs" weight="quiet" tone="danger" onClick={stopAll} title={tI18n("scripts:workspaceScriptsPanel.stopAllRunningProcesses")}><Square />{tI18n("scripts:workspaceScriptsPanel.stopAll")}</ActionButton> : null}
            <AdsButton size="xs" variant="quiet" iconOnly onClick={refresh} disabled={runtime.configStatus === "loading"} aria-label={tI18n("scripts:workspaceScriptsPanel.refreshWorkspaceTools")} title={tI18n("scripts:workspaceScriptsPanel.refreshWorkspaceTools")}><RefreshCcw className={sx(runtime.configStatus === "loading" && toolStyles.refreshing)} /></AdsButton>
            <AdsButton size="xs" variant="quiet" iconOnly onClick={openScriptSettings} disabled={!repositoryPath} aria-label={tI18n("scripts:workspaceScriptsPanel.openWorkspaceToolsSettings")} title={tI18n("scripts:workspaceScriptsPanel.openWorkspaceToolsSettings")}><Settings2 /></AdsButton>
          </div>
        </div>
        <p className={sx(toolStyles.description)}>{WORKSPACE_TOOLS_VIEWS.find((view) => view.id === activeView)?.description}</p>
        <Input aria-label={tI18n("scripts:workspaceScriptsPanel.findAWorkspaceTool")} placeholder={tI18n("scripts:workspaceScriptsPanel.findACommandOrProcess")} value={search} onChange={(event) => setSearch(event.target.value)} />
      </header>
      {runtime.configError ? <p role="alert" className={sx(toolStyles.configError)}>{runtime.configError}</p> : null}
      {search.trim() ? <section aria-label={tI18n("scripts:workspaceScriptsPanel.toolSearchResults")} className={sx(toolStyles.search)}>
        {commandEntries.some((entry) => `${entry.label} ${entry.description}`.toLowerCase().includes(search.trim().toLowerCase()))
          ? commandEntries.map((entry) => renderScriptEntry(entry))
          : <p role="status" className={sx(toolStyles.noResults)}>{tI18n("scripts:workspaceScriptsPanel.noMatchingCommandsOrProcesses")}</p>}
      </section> : null}
      <div className={sx(toolStyles.views, Boolean(search.trim()) && toolStyles.hidden)}>
      <SectionTabs
        fillHeight
        wrap
        // A ~300px rail: four counted labels on the default rung measured 330px
        // and wrapped onto a second row.
        size="xs"
        label={tI18n("scripts:workspaceScriptsPanel.workspaceToolsViews")}
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
      {selectedEntry ? <section aria-label={tI18n("scripts:workspaceScriptsPanel.outputValue", { value1: selectedEntry.label })} className={sx(toolStyles.output)}>
        <div className={sx(toolStyles.outputHeader)}>
          <h3 className={sx(toolStyles.outputTitle)}>{selectedEntry.label}</h3>
          <Button variant="ghost" size="icon-xs" aria-label={tI18n("scripts:workspaceScriptsPanel.closeOutput")} onClick={() => setSelection(null)}><X /></Button>
        </div>
        {selectedState?.log || selectedState?.error ? <ScriptLogView log={selectedState.log ?? ""} running={selectedState.running} error={selectedState.error} exitCode={selectedState.exitCode} startedAt={selectedState.startedAt} endedAt={selectedState.endedAt} onClear={() => clearLog({ scriptId: selectedEntry.id, scriptKind: selectedEntry.kind })} expandable={false} /> : <p role="status" className={sx(toolStyles.noOutput)}>{selectedState?.running ? tI18n("scripts:workspaceScriptsPanel.waitingForOutput") : tI18n("scripts:workspaceScriptsPanel.runThisToolToSeeItsOutput")}</p>}
      </section> : null}
    </section>
  );
}
