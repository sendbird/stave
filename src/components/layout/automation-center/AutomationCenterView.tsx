import { Badge } from "@/components/ads/components/Badge";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
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
import { automationStyles } from "./automation-center.styles";
import { centerStyles } from "./automation-center-view.styles";

const ALL_AUTOMATIONS = "all";

type AutomationCenterTab = "automations" | "runs";

function Detail(props: { label: string; value: string }) {
  return (
    <div className={sx(centerStyles.detail)}>
      <dt className={sx(centerStyles.detailTerm)}>{props.label}</dt>
      {/* Cadence and repository labels truncate here, so keep the full text
          reachable on hover. */}
      <dd
        title={props.value}
        className={sx(centerStyles.detailValue)}
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
        await flushActiveWorkspaceSnapshot();
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
        await flushActiveWorkspaceSnapshot();
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
      <div className={sx(centerStyles.root)}>
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
                  xstyle={[
                    centerStyles.filterChip,
                    runFilter === option.value && centerStyles.filterChipActive,
                  ]}
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
                className={sx(centerStyles.runSelect)}
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
            <span className={sx(centerStyles.shownCount)}>
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
            <p className={sx(centerStyles.loadingTitle)}>
              Loading Automation Center
            </p>
            <p className={sx(centerStyles.loadingHint)}>
              Restoring workflows, execution policy, and run history.
            </p>
          </div>
        </div>
      ) : activeTab === "automations" ? (
        snapshot.routines.length === 0 ? (
          <Empty xstyle={centerStyles.emptyPane}>
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
                <Plus className={sx(centerStyles.actionIcon)} />
                Create automation
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className={sx(centerStyles.masterDetail)}>
            <div className={sx(centerStyles.masterColumn)}>
              <div className={sx(centerStyles.cardList)}>
                {snapshot.routines.map((routine) => {
                  const active = routine.id === selectedRoutineId;
                  const latestRun = latestRunByRoutineId.get(routine.id);
                  return (
                    <AdsButton layout="host"
                      key={routine.id}
                      type="button"
                      onClick={() => setSelectedRoutineId(routine.id)}
                      aria-current={active}
                      xstyle={[
                        centerStyles.routineCard,
                        transition.colors,
                        active && centerStyles.routineCardActive,
                      ]}
                    >
                      <div className={sx(centerStyles.routineCardHead)}>
                        <span
                          className={sx(
                            centerStyles.routineDot,
                            routine.enabled
                              ? centerStyles.routineDotOn
                              : centerStyles.routineDotOff,
                          )}
                          aria-hidden="true"
                        />
                        <span className={sx(centerStyles.routineName)}>
                          {routine.name}
                        </span>
                        {latestRun && isActiveRunStatus(latestRun.status) ? (
                          <Badge
                            variant="outline"
                            tone={
                              getRunStatusPresentation(latestRun.status).tone
                            }
                            className={sx(automationStyles.statusBadge)}
                          >
                            {getRunStatusPresentation(latestRun.status).label}
                          </Badge>
                        ) : null}
                      </div>
                      <div className={sx(centerStyles.routineMeta)}>
                        <span className={sx(centerStyles.routineMetaText)}>
                          {routine.enabled
                            ? formatRoutineSchedule(routine.schedule)
                            : "Manual only"}
                        </span>
                        <span className={sx(centerStyles.routineMetaModel)}>
                          {routine.runtime.model}
                        </span>
                      </div>
                    </AdsButton>
                  );
                })}
              </div>
            </div>

            <div className={sx(centerStyles.detailColumn)}>
              {/* Narrow layouts hide the master column, so offer a picker. */}
              <div className={sx(centerStyles.compactPicker)}>
                <Select
                  value={selectedRoutineId ?? ""}
                  onValueChange={setSelectedRoutineId}
                >
                  <SelectTrigger
                    className={sx(centerStyles.compactSelect)}
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
                <div className={sx(centerStyles.detailBody)}>
                  <div className={sx(centerStyles.detailHeadRow)}>
                    <div className={sx(centerStyles.detailHeadText)}>
                      <h2 className={sx(centerStyles.detailTitle)}>
                        {selectedRoutine.name}
                      </h2>
                      <p className={sx(centerStyles.detailPrompt)}>
                        {selectedRoutine.prompt}
                      </p>
                    </div>
                    <div className={sx(centerStyles.detailActions)}>
                      <Button
                        variant="outline"
                        size="sm"
                        xstyle={centerStyles.headerButton}
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
                        <Play className={sx(centerStyles.buttonIcon)} />
                        Run now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={centerStyles.iconButton}
                        onClick={() => startEdit(selectedRoutine)}
                        aria-label="Edit automation"
                        title="Edit"
                      >
                        <Pencil className={sx(centerStyles.buttonIcon)} />
                      </Button>
                    </div>
                  </div>

                  <dl className={sx(centerStyles.facts)}>
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

                  <div className={sx(centerStyles.footerActions)}>
                    <Button
                      variant="outline"
                      size="sm"
                      xstyle={centerStyles.headerButton}
                      onClick={() => showRunHistory(selectedRoutine)}
                    >
                      <History className={sx(centerStyles.buttonIcon)} />
                      View run history
                      <span className={sx(centerStyles.runCount)}>
                        {runCountByRoutineId.get(selectedRoutine.id) ?? 0}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      xstyle={centerStyles.headerButton}
                      onClick={() => void toggleEnabled(selectedRoutine)}
                      disabled={busyRoutineId === selectedRoutine.id}
                    >
                      {selectedRoutine.enabled ? (
                        <>
                          <Pause className={sx(centerStyles.buttonIcon)} />
                          Pause schedule
                        </>
                      ) : (
                        <>
                          <Play className={sx(centerStyles.buttonIcon)} />
                          Enable schedule
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      xstyle={centerStyles.deleteButton}
                      onClick={() => setDeleteRoutine(selectedRoutine)}
                      disabled={selectedRoutineActiveRunCount > 0}
                      title={
                        selectedRoutineActiveRunCount > 0
                          ? "Wait for active runs to finish"
                          : "Delete automation"
                      }
                    >
                      <Trash2 className={sx(centerStyles.buttonIcon)} />
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
                <div className={sx(centerStyles.placeholder)}>
                  Select an automation to see its configuration.
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className={sx(centerStyles.runsMasterDetail)}>
          <div className={sx(centerStyles.runsMasterColumn)}>
            {visibleRuns.length === 0 ? (
              <Empty xstyle={centerStyles.emptyPaneFull}>
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
              <div className={sx(centerStyles.cardList)}>
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
          <div className={sx(centerStyles.runsDetailColumn)}>
            {selectedRun ? (
              <AutomationRunDetail
                run={selectedRun}
                automation={routineById.get(selectedRun.routineId) ?? null}
                busy={busyRoutineId === selectedRun.routineId}
                onOpenTask={(target) => void openRunResult(target)}
                onRunAgain={(automation) => void runNow(automation)}
              />
            ) : (
              <div className={sx(centerStyles.placeholder)}>
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
