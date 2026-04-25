import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, Globe, LoaderCircle, Play, RefreshCcw, Settings2, Sparkles, Square, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { isTaskArchived } from "@/lib/tasks";
import { SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptStatusEntry,
} from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  buildScriptRunFailureState,
  type ScriptUiState,
  reduceScriptUiState,
} from "./workspace-scripts-panel.utils";

function scriptKey(args: { scriptId: string; scriptKind: ScriptKind }) {
  return `${args.scriptKind}:${args.scriptId}`;
}

function scriptEntryKey(args: { id: string; kind: ScriptKind }) {
  return `${args.kind}:${args.id}`;
}

function openExternalUrl(url: string) {
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

/* ---------- Orbit URL pill ---------- */
function OrbitUrlBadge(props: { url: string }) {
  return (
    <button
      type="button"
      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 active:bg-primary/20"
      onClick={() => openExternalUrl(props.url)}
    >
      <Globe className="size-3 shrink-0" />
      <span className="truncate">{props.url}</span>
      <ExternalLink className="size-3 shrink-0 opacity-60" />
    </button>
  );
}

/* ---------- Terminal log block ---------- */
function TerminalLogBlock(props: { log: string }) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.log]);

  return (
    <pre
      ref={logRef}
      className="mt-2.5 max-h-44 overflow-auto rounded-md border border-border/50 bg-neutral-950 px-3 py-2 font-mono text-[11px] leading-[1.6] text-neutral-300 whitespace-pre-wrap dark:border-neutral-800 dark:bg-neutral-950/80"
    >
      {props.log}
    </pre>
  );
}

/* ---------- Section header ---------- */
function SectionHeader(props: {
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{props.title}</h3>
      <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">
        {props.count}
      </Badge>
    </div>
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
    <div className="group flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5 transition-colors hover:bg-muted/20">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{triggerMeta.label}</p>
        <p className="text-xs text-muted-foreground">{triggerMeta.description}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {props.refs.map((ref) => (
            <Badge
              key={`${ref.scriptKind}:${ref.scriptId}`}
              variant="secondary"
              className="rounded-sm px-2 py-0 font-normal"
            >
              {ref.scriptKind}:{ref.scriptId}
            </Badge>
          ))}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 rounded-md px-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => void props.onRun(props.trigger)}
        disabled={props.running}
      >
        {props.running ? <LoaderCircle className="mr-1 size-3.5 animate-spin" /> : <Play className="mr-1 size-3.5" />}
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
  onRun: (args: { scriptId: string; scriptKind: ScriptKind }) => Promise<void>;
  onStop: (args: { scriptId: string; scriptKind: ScriptKind }) => Promise<void>;
}) {
  const state = props.state;
  const isRunning = state?.running ?? false;

  return (
    <div className={cn(
      "rounded-lg border px-3 py-2.5 transition-colors",
      isRunning
        ? "border-primary/25 bg-primary/4"
        : "border-border/50 bg-muted/10 hover:bg-muted/20",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">{props.label}</p>
            <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
              {props.targetLabel}
            </Badge>
            {props.orbitEnabled ? (
              <Badge variant="secondary" className="rounded-sm px-1.5 py-0 text-[10px]">
                Orbit
              </Badge>
            ) : null}
            {isRunning ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Running
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{props.description}</p>
          {state?.sourceLabel ? (
            <p className="text-[11px] text-muted-foreground/70">{state.sourceLabel}</p>
          ) : null}
          {state?.orbitUrl ? <OrbitUrlBadge url={state.orbitUrl} /> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {state?.orbitUrl ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-md"
              onClick={() => void copyTextToClipboard(state.orbitUrl ?? "")}
              title="Copy URL"
            >
              <Copy className="size-3.5" />
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-7 rounded-md px-2.5"
            variant={isRunning ? "outline" : "default"}
            onClick={() => void (isRunning
              ? props.onStop({ scriptId: props.scriptId, scriptKind: props.scriptKind })
              : props.onRun({ scriptId: props.scriptId, scriptKind: props.scriptKind }))}
          >
            {isRunning ? <Square className="mr-1 size-3.5" /> : <Play className="mr-1 size-3.5" />}
            {isRunning ? "Stop" : props.orbitEnabled ? "Start" : "Run"}
          </Button>
        </div>
      </div>
      {state?.error ? (
        <div className="mt-2.5 rounded-md border border-destructive/30 bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
          {state.error}
        </div>
      ) : null}
      {state?.log ? <TerminalLogBlock log={state.log} /> : null}
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
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.activeTaskId,
    state.projectPath,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
    state.workspaceBranchById[state.activeWorkspaceId] ?? "",
    state.workspaces,
    state.tasks,
    state.activeTurnIdsByTask,
  ] as const));

  const workspaceName = useMemo(
    () => (workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? workspaceBranch) || "workspace",
    [activeWorkspaceId, workspaceBranch, workspaces],
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ?? null,
    [activeTaskId, tasks],
  );
  const activeTurnId = activeTaskId ? activeTurnIdsByTask[activeTaskId] : undefined;

  const [configState, setConfigState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    config: ResolvedWorkspaceScriptsConfig | null;
    error: string;
  }>({
    status: "idle",
    config: null,
    error: "",
  });
  const [entryStateByKey, setEntryStateByKey] = useState<Record<string, ScriptUiState>>({});
  const [runningHooks, setRunningHooks] = useState<Record<string, boolean>>({});

  const loadConfig = useCallback(async () => {
    if (!projectPath || !workspacePath) {
      setConfigState({ status: "idle", config: null, error: "" });
      setEntryStateByKey({});
      return;
    }

    const api = window.api?.scripts;
    if (!api?.getConfig || !api.getStatus) {
      setConfigState({
        status: "error",
        config: null,
        error: "Scripts bridge unavailable.",
      });
      return;
    }

    setConfigState((current) => ({ ...current, status: "loading", error: "" }));
    const [configResult, statusResult] = await Promise.all([
      api.getConfig({ projectPath, workspacePath }),
      activeWorkspaceId ? api.getStatus({ workspaceId: activeWorkspaceId }) : Promise.resolve({ ok: true, statuses: [] as WorkspaceScriptStatusEntry[] }),
    ]);

    if (!configResult.ok) {
      setConfigState({
        status: "error",
        config: null,
        error: configResult.error ?? "Failed to load scripts.",
      });
      return;
    }

    const nextStateByKey: Record<string, ScriptUiState> = {};
    if (statusResult.ok) {
      statusResult.statuses.forEach((status) => {
        nextStateByKey[scriptKey(status)] = {
          running: status.running,
          runId: status.runId,
          sessionId: status.sessionId,
          log: status.log,
          error: status.error,
          orbitUrl: status.orbitUrl,
          sourceLabel: status.source?.kind === "hook" ? `Hook · ${SCRIPT_TRIGGER_METADATA[status.source.trigger].label}` : "Manual",
        };
      });
    }

    setEntryStateByKey(nextStateByKey);
    setConfigState({
      status: "ready",
      config: configResult.config,
      error: "",
    });
  }, [activeWorkspaceId, projectPath, workspacePath]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const subscribeEvents = window.api?.scripts?.subscribeEvents;
    if (!subscribeEvents || !activeWorkspaceId) {
      return undefined;
    }

    return subscribeEvents({ workspaceId: activeWorkspaceId }, (payload) => {
      const key = scriptKey(payload);
      setEntryStateByKey((current) => {
        return {
          ...current,
          [key]: reduceScriptUiState(current[key], payload),
        };
      });
    });
  }, [activeWorkspaceId]);

  const runEntry = useCallback(async (args: { scriptId: string; scriptKind: ScriptKind }) => {
    const api = window.api?.scripts?.runEntry;
    if (!api || !activeWorkspaceId || !projectPath || !workspacePath) {
      toast.error("Scripts bridge unavailable");
      return;
    }
    const result = await api({
      workspaceId: activeWorkspaceId,
      scriptId: args.scriptId,
      scriptKind: args.scriptKind,
      projectPath,
      workspacePath,
      workspaceName,
      branch: workspaceBranch || workspaceName,
    });
    if (!result.ok) {
      setEntryStateByKey((current) => ({
        ...current,
        [scriptKey(args)]: buildScriptRunFailureState({
          existing: current[scriptKey(args)],
          error: result.error ?? "Unknown error",
        }),
      }));
      toast.error("Script failed to start", {
        description: result.error ?? "Unknown error",
      });
      return;
    }
    if (result.alreadyRunning) {
      toast.message("Service already running");
    }
  }, [activeWorkspaceId, projectPath, workspaceBranch, workspaceName, workspacePath]);

  const stopEntry = useCallback(async (args: { scriptId: string; scriptKind: ScriptKind }) => {
    const api = window.api?.scripts?.stopEntry;
    if (!api || !activeWorkspaceId) {
      toast.error("Scripts bridge unavailable");
      return;
    }
    const result = await api({
      workspaceId: activeWorkspaceId,
      scriptId: args.scriptId,
      scriptKind: args.scriptKind,
    });
    if (!result.ok) {
      toast.error("Failed to stop script", {
        description: result.error ?? "Unknown error",
      });
    }
  }, [activeWorkspaceId]);

  const runHook = useCallback(async (trigger: ScriptTrigger) => {
    const api = window.api?.scripts?.runHook;
    if (!api || !activeWorkspaceId || !projectPath || !workspacePath) {
      toast.error("Scripts bridge unavailable");
      return;
    }
    const triggerMeta = SCRIPT_TRIGGER_METADATA[trigger];
    setRunningHooks((current) => ({ ...current, [trigger]: true }));
    try {
      const result = await api({
        workspaceId: activeWorkspaceId,
        trigger,
        projectPath,
        workspacePath,
        workspaceName,
        branch: workspaceBranch || workspaceName,
        ...(activeTask?.id ? { taskId: activeTask.id } : {}),
        ...(activeTask?.title ? { taskTitle: activeTask.title } : {}),
        ...(activeTurnId ? { turnId: activeTurnId } : {}),
      });
      if (!result.ok) {
        toast.error("Hook execution failed", {
          description: result.error ?? result.summary?.failures[0]?.message ?? "Unknown error",
        });
        return;
      }
      toast.success("Hook executed", {
        description: `${result.summary?.executedEntries ?? 0} script(s) ran for ${triggerMeta.label}.`,
      });
    } finally {
      setRunningHooks((current) => ({ ...current, [trigger]: false }));
    }
  }, [activeTask, activeTurnId, activeWorkspaceId, projectPath, workspaceBranch, workspaceName, workspacePath]);

  const config = configState.config;
  const hookEntries = config
    ? Object.entries(config.hooks) as Array<[ScriptTrigger, NonNullable<ResolvedWorkspaceScriptsConfig["hooks"][ScriptTrigger]>]>
    : [];
  const actionCount = config?.actions.length ?? 0;
  const serviceCount = config?.services.length ?? 0;
  const hookCount = hookEntries.length;
  const hasScripts = actionCount > 0 || serviceCount > 0 || hookCount > 0;
  const hasWorkspaceOverride = Boolean(projectPath && workspacePath && workspacePath !== projectPath);

  const openScriptSettings = useCallback(() => {
    props.onOpenSettings?.({
      section: "projects",
      projectPath: projectPath ?? null,
    });
  }, [projectPath, props.onOpenSettings]);

  if (!workspacePath) {
    return (
      <Empty className="border border-dashed border-border/70 bg-muted/15">
        <EmptyHeader>
          <EmptyMedia>
            <Sparkles className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Scripts unavailable</EmptyTitle>
          <EmptyDescription>Select a workspace to inspect its scripts config.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="h-full overflow-auto px-3 py-2">
      <div className="space-y-4">
        {/* ── Header bar ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Scripts</h2>
            {hasWorkspaceOverride ? (
              <Badge variant="secondary" className="rounded-sm px-1.5 py-0 text-[10px]">
                Override
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 rounded-md"
              onClick={openScriptSettings}
              disabled={!projectPath}
              title="Edit Config"
            >
              <Settings2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 rounded-md"
              onClick={() => void loadConfig()}
              disabled={configState.status === "loading"}
              title="Refresh"
            >
              <RefreshCcw className={cn("size-3.5", configState.status === "loading" && "animate-spin")} />
            </Button>
          </div>
        </div>

        {configState.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {configState.error}
          </div>
        ) : null}

        {configState.status === "loading" ? (
          <div className="px-1 py-4 text-xs text-muted-foreground">
            Loading scripts config…
          </div>
        ) : null}

        {configState.status === "ready" && config && !hasScripts ? (
          <Empty className="border border-dashed border-border/70 bg-muted/15">
            <EmptyHeader>
              <EmptyMedia>
                <Zap className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No scripts configured</EmptyTitle>
              <EmptyDescription>Open Settings to create the shared scripts config for the project or active workspace.</EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-8 rounded-md"
              onClick={openScriptSettings}
              disabled={!projectPath}
            >
              <Settings2 className="mr-1 size-4" />
              Open Project Settings
            </Button>
          </Empty>
        ) : null}

        {/* ── Services ── */}
        {config?.services.length ? (
          <div className="space-y-2">
            <SectionHeader title="Services" count={config.services.length} />
            {config.services.map((entry) => (
              <ScriptEntryRow
                key={scriptEntryKey(entry)}
                scriptId={entry.id}
                scriptKind={entry.kind}
                label={entry.label}
                description={entry.description}
                targetLabel={entry.target.label}
                orbitEnabled={Boolean(entry.orbit)}
                state={entryStateByKey[scriptEntryKey(entry)]}
                onRun={runEntry}
                onStop={stopEntry}
              />
            ))}
          </div>
        ) : null}

        {/* ── Actions ── */}
        {config?.actions.length ? (
          <div className="space-y-2">
            <SectionHeader title="Actions" count={config.actions.length} />
            {config.actions.map((entry) => (
              <ScriptEntryRow
                key={scriptEntryKey(entry)}
                scriptId={entry.id}
                scriptKind={entry.kind}
                label={entry.label}
                description={entry.description}
                targetLabel={entry.target.label}
                orbitEnabled={Boolean(entry.orbit)}
                state={entryStateByKey[scriptEntryKey(entry)]}
                onRun={runEntry}
                onStop={stopEntry}
              />
            ))}
          </div>
        ) : null}

        {/* ── Hooks ── */}
        {hookEntries.length ? (
          <div className="space-y-2">
            <SectionHeader title="Hooks" count={hookEntries.length} />
            {hookEntries.map(([trigger, refs]) => (
              <HookRow
                key={trigger}
                trigger={trigger}
                refs={refs}
                onRun={runHook}
                running={Boolean(runningHooks[trigger])}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
