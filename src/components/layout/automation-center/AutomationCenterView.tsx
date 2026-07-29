import {
  AlertCircle,
  Clock3,
  History,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  SquareTerminal,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  formatAutomationTrustPolicy,
  formatRoutineSchedule,
  getRoutineInformationReferenceKey,
  RoutineUpsertInputSchema,
  type RoutineEnvironmentInput,
  type RoutineRun,
  type RoutineSnapshot,
  type RoutineSpec,
  type RoutineUpsertInput,
} from "@/lib/routines";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import { useAppStore } from "@/store/app.store";
import { cn } from "@/lib/utils";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
import { AutomationEditor } from "./AutomationEditor";
import { AutomationLatestRun } from "./AutomationLatestRun";
import { AutomationRunDetail, AutomationRunRow } from "./AutomationRunDetail";
import {
  AUTOMATION_RUN_FILTERS,
  buildEnvironmentOptions,
  createRoutineDraft,
  formatDateTime,
  formatRelativeTime,
  getRoutineErrorMessage,
  getRunStatusPresentation,
  isActiveRunStatus,
  matchesRunFilter,
  routineToDraft,
  type AutomationRunFilter,
} from "./automation-center.utils";

const ALL_AUTOMATIONS = "all";

type AutomationCenterTab = "automations" | "runs";

function Detail(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {props.label}
      </dt>
      {/* Cadence and repository labels truncate here, so keep the full text
          reachable on hover. */}
      <dd
        title={props.value}
        className="mt-0.5 truncate text-[11px] text-foreground"
      >
        {props.value}
      </dd>
    </div>
  );
}

export function AutomationCenterView() {
  const [
    recentProjects,
    projectPath,
    projectName,
    workspaces,
    workspacePathById,
    workspaceDefaultById,
    activeWorkspaceId,
    flushActiveWorkspaceSnapshot,
    focusTaskAttention,
    setLayout,
    closeAutomationCenter,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.recentProjects,
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.workspacePathById,
          state.workspaceDefaultById,
          state.activeWorkspaceId,
          state.flushActiveWorkspaceSnapshot,
          state.focusTaskAttention,
          state.setLayout,
          state.closeAutomationCenter,
        ] as const,
    ),
  );
  const [snapshot, setSnapshot] = useState<RoutineSnapshot>({
    routines: [],
    runs: [],
  });
  const [activeTab, setActiveTab] =
    useState<AutomationCenterTab>("automations");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    null,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<AutomationRunFilter>("all");
  const [runAutomationFilter, setRunAutomationFilter] =
    useState<string>(ALL_AUTOMATIONS);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>();
  const [draft, setDraft] = useState<RoutineUpsertInput | null>(null);
  const [informationOptions, setInformationOptions] = useState<
    WorkspaceInformationReferenceOption[]
  >([]);
  const [informationLoading, setInformationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyRoutineId, setBusyRoutineId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteRoutine, setDeleteRoutine] = useState<RoutineSpec | null>(null);

  const activeProject = useMemo(
    () =>
      projectPath && projectName
        ? {
            projectPath,
            projectName,
            workspaces,
            workspacePathById,
            workspaceDefaultById,
          }
        : null,
    [
      projectName,
      projectPath,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );
  const environmentOptions = useMemo(
    () =>
      buildEnvironmentOptions({
        recentProjects,
        activeProject,
      }),
    [activeProject, recentProjects],
  );
  const defaultEnvironment = useMemo<RoutineEnvironmentInput | null>(() => {
    const active =
      environmentOptions.find((option) => option.projectPath === projectPath) ??
      environmentOptions[0];
    return active
      ? {
          kind: "repository",
          workspaceId: active.workspaceId,
          path: active.path,
          projectPath: active.projectPath,
          label: active.label,
        }
      : null;
  }, [environmentOptions, projectPath]);

  const loadSnapshot = useCallback(async (options?: { quiet?: boolean }) => {
    const list = window.api?.routines?.list;
    if (!list) {
      setLoading(false);
      setError("Automations are available in the Stave desktop app.");
      return;
    }
    if (!options?.quiet) {
      setLoading(true);
    }
    try {
      const result = await list();
      if (!result.ok) {
        setError(result.message ?? "Failed to load automations.");
        return;
      }
      setSnapshot(result.snapshot);
      setError("");
      setSelectedRoutineId((current) => {
        if (
          current &&
          result.snapshot.routines.some((routine) => routine.id === current)
        ) {
          return current;
        }
        return result.snapshot.routines[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        getRoutineErrorMessage(loadError, "Failed to load automations."),
      );
    } finally {
      if (!options?.quiet) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => {
      void loadSnapshot({ quiet: true });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);

  const informationWorkspaceId = draft?.environment.workspaceId ?? null;
  useEffect(() => {
    let cancelled = false;
    const listReferences = window.api?.routines?.listInformationReferences;
    if (!informationWorkspaceId || !listReferences) {
      setInformationOptions([]);
      setInformationLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setInformationLoading(true);
    void (async () => {
      if (informationWorkspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot({ sync: true });
      }
      return listReferences({ workspaceId: informationWorkspaceId });
    })()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setInformationOptions(result.ok ? result.options : []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setInformationOptions([]);
          setError(
            getRoutineErrorMessage(
              loadError,
              "Failed to load Information resources.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInformationLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, flushActiveWorkspaceSnapshot, informationWorkspaceId]);

  const hasDraft = draft !== null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Escape" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      // The editor owns Escape while it is open so an in-progress draft is
      // never dismissed together with the whole surface.
      if (hasDraft) {
        return;
      }
      closeAutomationCenter();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAutomationCenter, hasDraft]);

  const routineById = useMemo(
    () => new Map(snapshot.routines.map((routine) => [routine.id, routine])),
    [snapshot.routines],
  );
  const selectedRoutine = selectedRoutineId
    ? (routineById.get(selectedRoutineId) ?? null)
    : null;
  const runCountByRoutineId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      counts.set(run.routineId, (counts.get(run.routineId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.runs]);
  const latestRunByRoutineId = useMemo(() => {
    // `snapshot.runs` arrives sorted by startedAt desc, so the first hit wins.
    const latest = new Map<string, RoutineRun>();
    for (const run of snapshot.runs) {
      if (!latest.has(run.routineId)) {
        latest.set(run.routineId, run);
      }
    }
    return latest;
  }, [snapshot.runs]);
  const activeRunCountByRoutineId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      if (isActiveRunStatus(run.status)) {
        counts.set(run.routineId, (counts.get(run.routineId) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshot.runs]);

  const selectedRoutineActiveRunCount = selectedRoutine
    ? (activeRunCountByRoutineId.get(selectedRoutine.id) ?? 0)
    : 0;
  const selectedRoutineAtConcurrencyLimit = selectedRoutine
    ? selectedRoutineActiveRunCount >= selectedRoutine.maxConcurrentRuns
    : false;

  const visibleRuns = useMemo(
    () =>
      snapshot.runs.filter(
        (run) =>
          (runAutomationFilter === ALL_AUTOMATIONS ||
            run.routineId === runAutomationFilter) &&
          matchesRunFilter(run, runFilter),
      ),
    [runAutomationFilter, runFilter, snapshot.runs],
  );
  const selectedRun =
    visibleRuns.find((run) => run.id === selectedRunId) ??
    visibleRuns[0] ??
    null;

  function startCreate() {
    setActiveTab("automations");
    setEditingRoutineId(null);
    setDraft(createRoutineDraft(defaultEnvironment));
  }

  function startEdit(routine: RoutineSpec) {
    setEditingRoutineId(routine.id);
    setDraft(routineToDraft(routine));
  }

  function cancelEdit() {
    setEditingRoutineId(undefined);
    setDraft(null);
  }

  function openCommandsAndProcesses() {
    setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: "scripts",
      },
    });
    closeAutomationCenter();
  }

  function showRunHistory(routine: RoutineSpec) {
    setRunAutomationFilter(routine.id);
    setRunFilter("all");
    setSelectedRunId(null);
    setActiveTab("runs");
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }
    const parsed = RoutineUpsertInputSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid automation.");
      return;
    }
    const api = window.api?.routines;
    if (
      (editingRoutineId && !api?.update) ||
      (!editingRoutineId && !api?.create)
    ) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setSaving(true);
    try {
      const result = editingRoutineId
        ? await api!.update!({
            id: editingRoutineId,
            input: parsed.data,
          })
        : await api!.create!(parsed.data);
      if (!result.ok || !result.routine) {
        toast.error(result.message ?? "Failed to save automation.");
        return;
      }
      setSelectedRoutineId(result.routine.id);
      cancelEdit();
      await loadSnapshot();
      toast.success(
        editingRoutineId ? "Automation updated" : "Automation created",
      );
    } catch (saveError) {
      toast.error(
        getRoutineErrorMessage(saveError, "Failed to save automation."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function runNow(routine: RoutineSpec) {
    const api = window.api?.routines?.runNow;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(routine.id);
    try {
      if (routine.environment.workspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot({ sync: true });
      }
      const result = await api({ id: routine.id });
      if (!result.ok || !result.run) {
        toast.error(result.message ?? "Failed to start automation.");
        return;
      }
      await loadSnapshot({ quiet: true });
      if (result.run.status === "failed") {
        toast.error(result.run.error ?? "Failed to start automation.");
        return;
      }
      toast.success("Automation started");
    } catch (runError) {
      toast.error(
        getRoutineErrorMessage(runError, "Failed to start automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function toggleEnabled(routine: RoutineSpec) {
    const api = window.api?.routines?.setEnabled;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(routine.id);
    try {
      const result = await api({
        id: routine.id,
        enabled: !routine.enabled,
      });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to update automation.");
        return;
      }
      await loadSnapshot({ quiet: true });
    } catch (updateError) {
      toast.error(
        getRoutineErrorMessage(updateError, "Failed to update automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteRoutine) {
      return;
    }
    const api = window.api?.routines?.remove;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(deleteRoutine.id);
    try {
      const result = await api({ id: deleteRoutine.id });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to delete automation.");
        return;
      }
      setDeleteRoutine(null);
      await loadSnapshot();
      toast.success("Automation deleted");
    } catch (deleteError) {
      toast.error(
        getRoutineErrorMessage(deleteError, "Failed to delete automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function openRunResult(run: RoutineRun) {
    if (!run.taskId) {
      return;
    }
    try {
      await focusTaskAttention({
        taskId: run.taskId,
        workspaceId: run.workspaceId,
        projectPath: run.projectPath,
        refreshFromPersistence: true,
      });
      const opened = useAppStore
        .getState()
        .tasks.some((task) => task.id === run.taskId);
      if (!opened) {
        // selectTask silently no-ops when the task is gone (for example runs
        // recorded before the task was persisted). Surface that instead of
        // leaving the click without any feedback.
        toast.error("This automation's task conversation could not be found.");
        return;
      }
      closeAutomationCenter();
    } catch (openError) {
      toast.error(
        getRoutineErrorMessage(openError, "Failed to open task result."),
      );
    }
  }

  if (draft) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <AutomationEditor
          routineId={editingRoutineId ?? null}
          draft={draft}
          environmentOptions={environmentOptions}
          informationOptions={informationOptions}
          informationLoading={informationLoading}
          saving={saving}
          onDraftChange={setDraft}
          onInformationCreated={(option) => {
            const key = getRoutineInformationReferenceKey(option.reference);
            setInformationOptions((current) => [
              ...current.filter(
                (candidate) =>
                  getRoutineInformationReferenceKey(candidate.reference) !==
                  key,
              ),
              option,
            ]);
          }}
          onCancel={cancelEdit}
          onSave={() => void saveDraft()}
        />
      </div>
    );
  }

  const showLoadingState =
    loading && snapshot.routines.length === 0 && snapshot.runs.length === 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-18 shrink-0 items-center justify-between gap-4 border-b border-border/65 bg-[linear-gradient(110deg,color-mix(in_oklch,var(--surface)_92%,var(--background)),var(--background))] px-5 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Workflow className="size-4.5 shrink-0 text-primary" />
            <h1 className="font-heading truncate text-base font-semibold tracking-[-0.01em] text-foreground">
              Automation Center
            </h1>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Scheduled agent workflows and their auditable run history.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={startCreate}
          >
            <Plus className="size-3.5" />
            New automation
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={openCommandsAndProcesses}
            aria-label={`Open ${WORKSPACE_TOOLS_LABEL}`}
            title={WORKSPACE_TOOLS_LABEL}
          >
            <SquareTerminal className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => void loadSnapshot()}
            aria-label="Refresh automations"
            title="Refresh"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="close-automation-center"
            title="Close Automation Center"
            onClick={closeAutomationCenter}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2">
        <div
          className="flex items-center gap-0.5 rounded-md bg-muted/45 p-0.5"
          role="tablist"
          aria-label="Automation Center views"
        >
          <Button
            type="button"
            size="sm"
            variant={activeTab === "automations" ? "secondary" : "ghost"}
            role="tab"
            aria-selected={activeTab === "automations"}
            className={cn(
              "h-6.5 gap-1.5 px-2 text-[11px]",
              activeTab === "automations" &&
                "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
            )}
            onClick={() => setActiveTab("automations")}
          >
            <Workflow className="size-3.5" />
            Automations
            <span className="tabular-nums text-muted-foreground">
              {snapshot.routines.length}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "runs" ? "secondary" : "ghost"}
            role="tab"
            aria-selected={activeTab === "runs"}
            className={cn(
              "h-6.5 gap-1.5 px-2 text-[11px]",
              activeTab === "runs" &&
                "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
            )}
            onClick={() => setActiveTab("runs")}
          >
            <ListChecks className="size-3.5" />
            Run history
            <span className="tabular-nums text-muted-foreground">
              {snapshot.runs.length}
            </span>
          </Button>
        </div>

        {activeTab === "runs" ? (
          <>
            <div className="flex items-center gap-0.5 rounded-md bg-muted/45 p-0.5">
              {AUTOMATION_RUN_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={runFilter === option.value ? "secondary" : "ghost"}
                  aria-pressed={runFilter === option.value}
                  className={cn(
                    "h-6.5 px-2 text-[11px]",
                    runFilter === option.value &&
                      "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
                  )}
                  onClick={() => setRunFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Select
              value={runAutomationFilter}
              onValueChange={(value) => {
                setRunAutomationFilter(value);
                setSelectedRunId(null);
              }}
            >
              <SelectTrigger
                className="h-7 w-56 text-[11px]"
                aria-label="Filter runs by automation"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AUTOMATIONS}>All automations</SelectItem>
                {snapshot.routines.map((routine) => (
                  <SelectItem key={routine.id} value={routine.id}>
                    {routine.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {visibleRuns.length} shown
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {showLoadingState ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="grid size-20 place-items-center rounded-full bg-muted/45 ring-1 ring-border/70">
            <ThinkingOrb
              state="searching"
              size={64}
              theme="auto"
              aria-label="Loading automation center"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Loading Automation Center
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Restoring workflows, execution policy, and run history.
            </p>
          </div>
        </div>
      ) : activeTab === "automations" ? (
        snapshot.routines.length === 0 ? (
          <Empty className="min-h-0 flex-1 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>No automations yet</EmptyTitle>
              <EmptyDescription>
                Schedule fresh-context agent work with its own cadence,
                permissions, model, repository, and Information resources.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={startCreate}>
                <Plus className="size-4" />
                Create automation
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
            <div className="hidden min-h-0 flex-col overflow-y-auto border-r border-border/65 p-3 md:flex">
              <div className="grid gap-2">
                {snapshot.routines.map((routine) => {
                  const active = routine.id === selectedRoutineId;
                  const latestRun = latestRunByRoutineId.get(routine.id);
                  return (
                    <button
                      key={routine.id}
                      type="button"
                      onClick={() => setSelectedRoutineId(routine.id)}
                      aria-current={active}
                      className={cn(
                        "w-full rounded-md border p-2.5 text-left transition-colors",
                        active
                          ? "border-primary/50 bg-primary/8"
                          : "border-border/70 hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            routine.enabled
                              ? "bg-success"
                              : "bg-muted-foreground",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                          {routine.name}
                        </span>
                        {latestRun && isActiveRunStatus(latestRun.status) ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 shrink-0 px-1.5 text-[9px]",
                              getRunStatusPresentation(latestRun.status)
                                .className,
                            )}
                          >
                            {getRunStatusPresentation(latestRun.status).label}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">
                          {routine.enabled
                            ? formatRoutineSchedule(routine.schedule)
                            : "Manual only"}
                        </span>
                        <span className="shrink-0 truncate">
                          {routine.runtime.model}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto">
              {/* Narrow layouts hide the master column, so offer a picker. */}
              <div className="border-b border-border/65 p-3 md:hidden">
                <Select
                  value={selectedRoutineId ?? ""}
                  onValueChange={setSelectedRoutineId}
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label="Select automation"
                  >
                    <SelectValue placeholder="Select an automation" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.routines.map((routine) => (
                      <SelectItem key={routine.id} value={routine.id}>
                        {routine.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRoutine ? (
                <div className="grid gap-4 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {selectedRoutine.name}
                      </h2>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                        {selectedRoutine.prompt}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => void runNow(selectedRoutine)}
                        disabled={
                          busyRoutineId === selectedRoutine.id ||
                          selectedRoutineAtConcurrencyLimit
                        }
                        title={
                          selectedRoutineAtConcurrencyLimit
                            ? "Concurrency limit reached"
                            : "Run now"
                        }
                      >
                        <Play className="size-3.5" />
                        Run now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => startEdit(selectedRoutine)}
                        aria-label="Edit automation"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border/70 bg-surface/30 p-3 sm:grid-cols-4">
                    <Detail
                      label="Status"
                      value={
                        selectedRoutine.enabled ? "Scheduled" : "Manual only"
                      }
                    />
                    <Detail
                      label="Cadence"
                      value={
                        selectedRoutine.enabled
                          ? formatRoutineSchedule(selectedRoutine.schedule)
                          : "—"
                      }
                    />
                    <Detail
                      label="Next run"
                      value={
                        selectedRoutine.enabled
                          ? formatRelativeTime(selectedRoutine.nextRunAt)
                          : "—"
                      }
                    />
                    <Detail
                      label="Last run"
                      value={formatRelativeTime(selectedRoutine.lastRunAt)}
                    />
                    <Detail
                      label="Permissions"
                      value={formatAutomationTrustPolicy(
                        selectedRoutine.trustPolicy,
                      )}
                    />
                    <Detail
                      label="Provider"
                      value={`${
                        selectedRoutine.runtime.provider === "codex"
                          ? "Codex"
                          : "Claude"
                      } · ${selectedRoutine.runtime.effort}`}
                    />
                    <Detail
                      label="Repository"
                      value={selectedRoutine.environment.label}
                    />
                    <Detail
                      label="Concurrency"
                      value={`${selectedRoutineActiveRunCount}/${selectedRoutine.maxConcurrentRuns}`}
                    />
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showRunHistory(selectedRoutine)}
                    >
                      <History className="size-3.5" />
                      View run history
                      <span className="tabular-nums text-muted-foreground">
                        {runCountByRoutineId.get(selectedRoutine.id) ?? 0}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => void toggleEnabled(selectedRoutine)}
                      disabled={busyRoutineId === selectedRoutine.id}
                    >
                      {selectedRoutine.enabled ? (
                        <>
                          <Pause className="size-3.5" />
                          Pause schedule
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" />
                          Enable schedule
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeleteRoutine(selectedRoutine)}
                      disabled={selectedRoutineActiveRunCount > 0}
                      title={
                        selectedRoutineActiveRunCount > 0
                          ? "Wait for active runs to finish"
                          : "Delete automation"
                      }
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>

                  <AutomationLatestRun
                    run={latestRunByRoutineId.get(selectedRoutine.id) ?? null}
                    onOpenTask={(run) => void openRunResult(run)}
                    onOpenDetail={(run) => {
                      setRunAutomationFilter(selectedRoutine.id);
                      setRunFilter("all");
                      setSelectedRunId(run.id);
                      setActiveTab("runs");
                    }}
                  />
                </div>
              ) : (
                <div className="p-6 text-xs text-muted-foreground">
                  Select an automation to see its configuration.
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-border/65 p-3 md:border-b-0 md:border-r">
            {visibleRuns.length === 0 ? (
              <Empty className="h-full border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListChecks />
                  </EmptyMedia>
                  <EmptyTitle>No matching runs</EmptyTitle>
                  <EmptyDescription>
                    Every manual or scheduled execution is recorded here with
                    its execution ID, config hash, permissions, and result.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-2">
                {visibleRuns.map((run) => (
                  <AutomationRunRow
                    key={run.id}
                    run={run}
                    automationName={routineById.get(run.routineId)?.name}
                    active={run.id === selectedRun?.id}
                    onSelect={(target) => setSelectedRunId(target.id)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 overflow-hidden">
            {selectedRun ? (
              <AutomationRunDetail
                run={selectedRun}
                automation={routineById.get(selectedRun.routineId) ?? null}
                busy={busyRoutineId === selectedRun.routineId}
                onOpenTask={(target) => void openRunResult(target)}
                onRunAgain={(automation) => void runNow(automation)}
              />
            ) : (
              <div className="p-6 text-xs text-muted-foreground">
                Select a run to see its full result.
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteRoutine)}
        title="Delete automation"
        description={
          deleteRoutine
            ? `Delete "${deleteRoutine.name}" and its saved run history? Created task conversations remain in their workspaces.`
            : ""
        }
        confirmLabel="Delete"
        loading={Boolean(deleteRoutine && busyRoutineId === deleteRoutine.id)}
        onCancel={() => setDeleteRoutine(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
