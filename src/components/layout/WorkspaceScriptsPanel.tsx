import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  LoaderCircle,
  Play,
  RefreshCcw,
  Settings2,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@/components/ui";
import { ScriptLogView } from "@/components/scripts";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { isTaskArchived } from "@/lib/tasks";
import {
  clearScriptLog,
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
  type ScriptEntryOrigin,
  type ScriptUiState,
} from "@/lib/workspace-scripts";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
} from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { openOrbitUrlWithLensPriority } from "./workspace-scripts-panel.utils";

const SCRIPTS_ACCORDION_STORAGE_KEY = "stave:workspace-scripts-open-sections:v1";
const SCRIPT_SECTION_IDS = ["services", "actions", "hooks"] as const;
type ScriptSectionId = (typeof SCRIPT_SECTION_IDS)[number];

function readStoredSections(): ScriptSectionId[] {
  if (typeof window === "undefined") {
    return [...SCRIPT_SECTION_IDS];
  }
  try {
    const raw = window.localStorage.getItem(SCRIPTS_ACCORDION_STORAGE_KEY);
    if (!raw) {
      return [...SCRIPT_SECTION_IDS];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...SCRIPT_SECTION_IDS];
    }
    return parsed.filter((value): value is ScriptSectionId =>
      SCRIPT_SECTION_IDS.includes(value as ScriptSectionId),
    );
  } catch {
    return [...SCRIPT_SECTION_IDS];
  }
}

function openExternalUrl(url: string) {
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

function isLargeViewportNow() {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(min-width: 1024px)").matches;
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

/* ---------- Origin badges ---------- */
function OriginBadges(props: { origin?: ScriptEntryOrigin }) {
  if (!props.origin) {
    return null;
  }
  return (
    <>
      <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px] font-normal">
        {props.origin.tier === "workspace" ? "Workspace" : "Project"}
      </Badge>
      {props.origin.localOverride ? (
        <Badge variant="secondary" className="rounded-sm px-1.5 py-0 text-[10px] font-normal">
          Local
        </Badge>
      ) : null}
    </>
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
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 active:bg-primary/20"
      onClick={() => void props.onOpenInLens(props.url)}
      title={props.lensAvailable ? "Open in Lens" : "Open in browser"}
      aria-label={props.lensAvailable ? "Open Orbit URL in Lens" : "Open Orbit URL in browser"}
    >
      <Globe className="size-3 shrink-0" />
      <span className="truncate">{props.url}</span>
      {props.lensAvailable ? (
        <span className="shrink-0 rounded-sm bg-primary/10 px-1 text-[10px] leading-4">
          Lens
        </span>
      ) : (
        <ExternalLink className="size-3 shrink-0 opacity-60" />
      )}
    </button>
  );
}

/* ---------- Accordion section ---------- */
function ScriptSection(props: {
  value: ScriptSectionId;
  title: string;
  count: number;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={props.value}
      className={cn("border-b border-border/50", props.first && "border-t-0")}
    >
      <AccordionTrigger className="group/accordion-trigger gap-2 py-2.5 pr-1 hover:no-underline [&>svg[data-slot=accordion-trigger-icon]]:hidden">
        <div className="flex items-center gap-2 text-left">
          <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <ChevronRight className="size-4 transition-transform group-aria-expanded/accordion-trigger:hidden" />
            <ChevronDown className="hidden size-4 group-aria-expanded/accordion-trigger:block" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {props.title}
          </span>
          <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">
            {props.count}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-2 pb-3 pt-0">
        {props.children}
      </AccordionContent>
    </AccordionItem>
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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5 transition-colors hover:bg-muted/20">
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
        className="h-7 rounded-md px-2"
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
  origin?: ScriptEntryOrigin;
  lensAvailable: boolean;
  onOpenOrbitUrlInLens: (url: string) => Promise<void>;
  onRun: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
  onStop: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
  onClearLog: (args: { scriptId: string; scriptKind: ScriptKind }) => void;
}) {
  const state = props.state;
  const isRunning = state?.running ?? false;
  const isFinished = !isRunning && state?.endedAt !== undefined;

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
            <OriginBadges origin={props.origin} />
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {isRunning ? (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Running
                {state?.startedAt !== undefined ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="text-muted-foreground"><LiveDuration startedAt={state.startedAt} /></span>
                  </>
                ) : null}
              </span>
            ) : isFinished ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className={cn("font-medium", (state?.exitCode ?? 0) === 0 ? "text-success" : "text-destructive")}>
                  {state?.exitCode !== undefined ? `Exit ${state.exitCode}` : "Done"}
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
          <p className="text-xs leading-relaxed text-muted-foreground">{props.description}</p>
          {state?.sourceLabel ? (
            <p className="text-[11px] text-muted-foreground/70">{state.sourceLabel}</p>
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
            className="h-7 rounded-md px-2.5"
            variant={isRunning ? "outline" : "default"}
            onClick={() => (isRunning
              ? props.onStop({ scriptId: props.scriptId, scriptKind: props.scriptKind })
              : props.onRun({ scriptId: props.scriptId, scriptKind: props.scriptKind }))}
          >
            {isRunning ? <Square className="mr-1 size-3.5" /> : <Play className="mr-1 size-3.5" />}
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
        onClear={() => props.onClearLog({ scriptId: props.scriptId, scriptKind: props.scriptKind })}
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
    setLayout,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.activeTaskId,
    state.projectPath,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
    state.workspaceBranchById[state.activeWorkspaceId] ?? "",
    state.workspaces,
    state.tasks,
    state.activeTurnIdsByTask,
    state.settings.lensSessionScope,
    state.setLayout,
  ] as const));

  const [openSections, setOpenSections] = useState<ScriptSectionId[]>(() => readStoredSections());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(SCRIPTS_ACCORDION_STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // Ignore localStorage write failures for this UI preference.
    }
  }, [openSections]);

  const workspaceName = useMemo(
    () => (workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? workspaceBranch) || "workspace",
    [activeWorkspaceId, workspaceBranch, workspaces],
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ?? null,
    [activeTaskId, tasks],
  );
  const activeTurnId = activeTaskId ? activeTurnIdsByTask[activeTaskId] : undefined;

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

  const runEntry = useCallback((args: { scriptId: string; scriptKind: ScriptKind }) => {
    if (!activeWorkspaceId) {
      toast.error("Scripts bridge unavailable");
      return;
    }
    void runScriptEntry({ workspaceId: activeWorkspaceId, ...args });
  }, [activeWorkspaceId]);

  const stopEntry = useCallback((args: { scriptId: string; scriptKind: ScriptKind }) => {
    if (!activeWorkspaceId) {
      toast.error("Scripts bridge unavailable");
      return;
    }
    void stopScriptEntry({ workspaceId: activeWorkspaceId, ...args });
  }, [activeWorkspaceId]);

  const clearLog = useCallback((args: { scriptId: string; scriptKind: ScriptKind }) => {
    if (!activeWorkspaceId) {
      return;
    }
    clearScriptLog({ workspaceId: activeWorkspaceId, ...args });
  }, [activeWorkspaceId]);

  const openOrbitUrlInLens = useCallback(async (url: string) => {
    const result = await openOrbitUrlWithLensPriority({
      url,
      workspaceId: activeWorkspaceId,
      projectPath,
      lensSessionScope,
      lensApi: window.api?.lens ?? null,
      isLargeViewport: isLargeViewportNow(),
      setLayout,
      openExternalUrl,
    });

    if (!result.ok) {
      toast.error("Lens navigation failed", {
        description: result.message,
      });
    }
  }, [activeWorkspaceId, lensSessionScope, projectPath, setLayout]);

  const runHook = useCallback(async (trigger: ScriptTrigger) => {
    if (!activeWorkspaceId) {
      toast.error("Scripts bridge unavailable");
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
  }, [activeTask, activeTurnId, activeWorkspaceId]);

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
    ? Object.entries(config.hooks) as Array<[ScriptTrigger, NonNullable<ResolvedWorkspaceScriptsConfig["hooks"][ScriptTrigger]>]>
    : [];
  const actionCount = config?.actions.length ?? 0;
  const serviceCount = config?.services.length ?? 0;
  const hookCount = hookEntries.length;
  const hasScripts = actionCount > 0 || serviceCount > 0 || hookCount > 0;
  const runningCount = useMemo(
    () => Object.values(runtime.entries).filter((entry) => entry.running).length,
    [runtime.entries],
  );
  const lensAvailable =
    typeof window !== "undefined" &&
    Boolean(window.api?.lens?.createView && window.api?.lens?.navigate);

  const scopeSummary = runtime.origins.activeTier === "workspace"
    ? "Workspace scripts"
    : runtime.origins.activeTier === "project"
      ? "Project scripts"
      : "Scripts config";

  const openScriptSettings = useCallback(() => {
    props.onOpenSettings?.({
      section: "scripts",
      projectPath: projectPath ?? null,
    });
  }, [projectPath, props.onOpenSettings]);

  const originFor = useCallback(
    (kind: ScriptKind, id: string) => runtime.origins.originByKey[scriptEntryKey(kind, id)],
    [runtime.origins],
  );

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{scopeSummary}</p>
        <div className="flex items-center gap-1.5">
          {runningCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-md px-2 text-destructive hover:text-destructive"
              onClick={stopAll}
              title="Stop all running scripts"
            >
              <Square className="mr-1 size-3.5" />
              Stop all
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-md"
            onClick={refresh}
            disabled={runtime.configStatus === "loading"}
            title="Refresh"
          >
            <RefreshCcw className={cn("size-3.5", runtime.configStatus === "loading" && "animate-spin")} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-md"
            onClick={openScriptSettings}
            disabled={!projectPath}
            title="Open Scripts settings"
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {runtime.configError ? (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {runtime.configError}
          </div>
        ) : null}

        {runtime.configStatus === "loading" && !config ? (
          <div className="px-1 py-4 text-xs text-muted-foreground">
            Loading scripts config…
          </div>
        ) : null}

        {runtime.configStatus === "ready" && config && !hasScripts ? (
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
              Open Scripts Settings
            </Button>
          </Empty>
        ) : null}

        {config && hasScripts ? (
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={(value) => setOpenSections(value as ScriptSectionId[])}
          >
            {serviceCount > 0 ? (
              <ScriptSection value="services" title="Services" count={serviceCount} first>
                {config.services.map((entry) => (
                  <ScriptEntryRow
                    key={scriptEntryKey(entry.kind, entry.id)}
                    scriptId={entry.id}
                    scriptKind={entry.kind}
                    label={entry.label}
                    description={entry.description}
                    targetLabel={entry.target.label}
                    orbitEnabled={Boolean(entry.orbit)}
                    state={runtime.entries[scriptEntryKey(entry.kind, entry.id)]}
                    origin={originFor(entry.kind, entry.id)}
                    lensAvailable={lensAvailable}
                    onOpenOrbitUrlInLens={openOrbitUrlInLens}
                    onRun={runEntry}
                    onStop={stopEntry}
                    onClearLog={clearLog}
                  />
                ))}
              </ScriptSection>
            ) : null}

            {actionCount > 0 ? (
              <ScriptSection value="actions" title="Actions" count={actionCount} first={serviceCount === 0}>
                {config.actions.map((entry) => (
                  <ScriptEntryRow
                    key={scriptEntryKey(entry.kind, entry.id)}
                    scriptId={entry.id}
                    scriptKind={entry.kind}
                    label={entry.label}
                    description={entry.description}
                    targetLabel={entry.target.label}
                    orbitEnabled={Boolean(entry.orbit)}
                    state={runtime.entries[scriptEntryKey(entry.kind, entry.id)]}
                    origin={originFor(entry.kind, entry.id)}
                    lensAvailable={lensAvailable}
                    onOpenOrbitUrlInLens={openOrbitUrlInLens}
                    onRun={runEntry}
                    onStop={stopEntry}
                    onClearLog={clearLog}
                  />
                ))}
              </ScriptSection>
            ) : null}

            {hookCount > 0 ? (
              <ScriptSection
                value="hooks"
                title="Hooks"
                count={hookCount}
                first={serviceCount === 0 && actionCount === 0}
              >
                {hookEntries.map(([trigger, refs]) => (
                  <HookRow
                    key={trigger}
                    trigger={trigger}
                    refs={refs}
                    onRun={runHook}
                    running={Boolean(runtime.hookRunningByTrigger[trigger])}
                  />
                ))}
              </ScriptSection>
            ) : null}
          </Accordion>
        ) : null}
      </div>
    </div>
  );
}
