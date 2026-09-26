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
import { ActionButton } from "@/components/system/ActionButton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  formatAutomationSchedule,
  getAutomationInformationReferenceKey,
  AutomationUpsertInputSchema,
  type AutomationEnvironmentInput,
  type AutomationRun,
  type AutomationSnapshot,
  type AutomationSpec,
  type AutomationUpsertInput,
} from "@/lib/automations";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import { useAppStore } from "@/store/app.store";
import { createCoalescedLoader } from "@/lib/coalesced-loader";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
import { AutomationEditor } from "./AutomationEditor";
import { AutomationLatestRun } from "./AutomationLatestRun";
import { AutomationRunDetail, AutomationRunRow } from "./AutomationRunDetail";
import {
  AUTOMATION_RUN_FILTERS,
  buildEnvironmentOptions,
  createAutomationDraft,
  formatDateTime,
  formatRelativeTime,
  getAutomationErrorMessage,
  getRunStatusPresentation,
  isActiveRunStatus,
  matchesRunFilter,
  automationToDraft,
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
    recentRepositories,
    repositoryPath,
    repositoryName,
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
          state.recentRepositories,
          state.repositoryPath,
          state.repositoryName,
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
  const [snapshot, setSnapshot] = useState<AutomationSnapshot>({
    automations: [],
    runs: [],
  });
  const [activeTab, setActiveTab] = useState<AutomationCenterTab>("automations");
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(
    null,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<AutomationRunFilter>("all");
  const [runAutomationFilter, setRunAutomationFilter] =
    useState<string>(ALL_AUTOMATIONS);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>();
  const [draft, setDraft] = useState<AutomationUpsertInput | null>(null);
  const [informationOptions, setInformationOptions] = useState<
    WorkspaceInformationReferenceOption[]
  >([]);
  const [informationLoading, setInformationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAutomationId, setBusyAutomationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteAutomation, setDeleteAutomation] = useState<AutomationSpec | null>(null);

  const activeRepository = useMemo(
    () =>
      repositoryPath && repositoryName
        ? {
            repositoryPath,
            repositoryName,
            workspaces,
            workspacePathById,
            workspaceDefaultById,
          }
        : null,
    [
      repositoryName,
      repositoryPath,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );
  const environmentOptions = useMemo(
    () =>
      buildEnvironmentOptions({
        recentRepositories,
        activeRepository,
      }),
    [activeRepository, recentRepositories],
  );
  const defaultEnvironment = useMemo<AutomationEnvironmentInput | null>(() => {
    const active =
      environmentOptions.find((option) => option.repositoryPath === repositoryPath) ??
      environmentOptions[0];
    return active
      ? {
          kind: "repository",
          workspaceId: active.workspaceId,
          path: active.path,
          repositoryPath: active.repositoryPath,
          label: active.label,
        }
      : null;
  }, [environmentOptions, repositoryPath]);

  const activeLoadScope = useRef(false);
  const loadSequence = useRef(0);
  const readSnapshot = useMemo(
    () =>
      createCoalescedLoader(async () => {
        const list = window.api?.automations?.list;
        if (!list)
          throw new Error(
            "Automations are available in the Stave desktop app.",
          );
        return list();
      }),
    [],
  );
  const loadSnapshot = useCallback(
    async (options?: { quiet?: boolean; poll?: boolean }) => {
      if (!activeLoadScope.current) return;
      const sequence = ++loadSequence.current;
      const isCurrent = () =>
        activeLoadScope.current && sequence === loadSequence.current;
      if (!options?.quiet) {
        setLoading(true);
      }
      try {
        const result = await readSnapshot({ fresh: !options?.poll });
        if (!isCurrent()) return;
        if (!result.ok) {
          setError(result.message ?? "Failed to load automations.");
          return;
        }
        setSnapshot(result.snapshot);
        setError("");
        setSelectedAutomationId((current) => {
          if (
            current &&
            result.snapshot.automations.some((automation) => automation.id === current)
          ) {
            return current;
          }
          return result.snapshot.automations[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!isCurrent()) return;
        setError(
          getAutomationErrorMessage(loadError, "Failed to load automations."),
        );
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    },
    [readSnapshot],
  );

  useEffect(() => {
    activeLoadScope.current = true;
    void loadSnapshot();
    const interval = window.setInterval(() => {
      void loadSnapshot({ quiet: true, poll: true });
    }, 5_000);
    return () => {
      activeLoadScope.current = false;
      loadSequence.current += 1;
      window.clearInterval(interval);
    };
  }, [loadSnapshot]);

  const informationWorkspaceId = draft?.environment.workspaceId ?? null;
  useEffect(() => {
    let cancelled = false;
    const listReferences = window.api?.automations?.listInformationReferences;
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
            getAutomationErrorMessage(
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

  const automationById = useMemo(
    () => new Map(snapshot.automations.map((automation) => [automation.id, automation])),
    [snapshot.automations],
  );
  const selectedAutomation = selectedAutomationId
    ? (automationById.get(selectedAutomationId) ?? null)
    : null;
  const runCountByAutomationId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      counts.set(run.automationId, (counts.get(run.automationId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.runs]);
  const latestRunByAutomationId = useMemo(() => {
    // `snapshot.runs` arrives sorted by startedAt desc, so the first hit wins.
    const latest = new Map<string, AutomationRun>();
    for (const run of snapshot.runs) {
      if (!latest.has(run.automationId)) {
        latest.set(run.automationId, run);
      }
    }
    return latest;
  }, [snapshot.runs]);
  const activeRunCountByAutomationId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      if (isActiveRunStatus(run.status)) {
        counts.set(run.automationId, (counts.get(run.automationId) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshot.runs]);

  const selectedAutomationActiveRunCount = selectedAutomation
    ? (activeRunCountByAutomationId.get(selectedAutomation.id) ?? 0)
    : 0;
  const selectedAutomationAtConcurrencyLimit = selectedAutomation
    ? selectedAutomationActiveRunCount >= selectedAutomation.maxConcurrentRuns
    : false;

  const visibleRuns = useMemo(
    () =>
      snapshot.runs.filter(
        (run) =>
          (runAutomationFilter === ALL_AUTOMATIONS ||
            run.automationId === runAutomationFilter) &&
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
    setEditingAutomationId(null);
    setDraft(createAutomationDraft(defaultEnvironment));
  }

  function startEdit(automation: AutomationSpec) {
    setEditingAutomationId(automation.id);
    setDraft(automationToDraft(automation));
  }

  function cancelEdit() {
    setEditingAutomationId(undefined);
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

  function showRunHistory(automation: AutomationSpec) {
    setRunAutomationFilter(automation.id);
    setRunFilter("all");
    setSelectedRunId(null);
    setActiveTab("runs");
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }
    const parsed = AutomationUpsertInputSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid automation.");
      return;
    }
    const api = window.api?.automations;
    if (
      (editingAutomationId && !api?.update) ||
      (!editingAutomationId && !api?.create)
    ) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setSaving(true);
    try {
      const result = editingAutomationId
        ? await api!.update!({
            id: editingAutomationId,
            input: parsed.data,
          })
        : await api!.create!(parsed.data);
      if (!result.ok || !result.automation) {
        toast.error(result.message ?? "Failed to save automation.");
        return;
      }
      setSelectedAutomationId(result.automation.id);
      cancelEdit();
      await loadSnapshot();
      toast.success(
        editingAutomationId ? "Automation updated" : "Automation created",
      );
    } catch (saveError) {
      toast.error(
        getAutomationErrorMessage(saveError, "Failed to save automation."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function runNow(automation: AutomationSpec) {
    const api = window.api?.automations?.runNow;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyAutomationId(automation.id);
    try {
      if (automation.environment.workspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot();
      }
      const result = await api({ id: automation.id });
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
        getAutomationErrorMessage(runError, "Failed to start automation."),
      );
    } finally {
      setBusyAutomationId(null);
    }
  }

  async function toggleEnabled(automation: AutomationSpec) {
    const api = window.api?.automations?.setEnabled;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyAutomationId(automation.id);
    try {
      const result = await api({
        id: automation.id,
        enabled: !automation.enabled,
      });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to update automation.");
        return;
      }
      await loadSnapshot({ quiet: true });
    } catch (updateError) {
      toast.error(
        getAutomationErrorMessage(updateError, "Failed to update automation."),
      );
    } finally {
      setBusyAutomationId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteAutomation) {
      return;
    }
    const api = window.api?.automations?.remove;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyAutomationId(deleteAutomation.id);
    try {
      const result = await api({ id: deleteAutomation.id });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to delete automation.");
        return;
      }
      setDeleteAutomation(null);
      await loadSnapshot();
      toast.success("Automation deleted");
    } catch (deleteError) {
      toast.error(
        getAutomationErrorMessage(deleteError, "Failed to delete automation."),
      );
    } finally {
      setBusyAutomationId(null);
    }
  }

  async function openRunResult(run: AutomationRun) {
    if (!run.taskId) {
      return;
    }
    try {
      await focusTaskAttention({
        taskId: run.taskId,
        workspaceId: run.workspaceId,
        repositoryPath: run.repositoryPath,
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
        getAutomationErrorMessage(openError, "Failed to open task result."),
      );
    }
  }

  if (draft) {
    return (
      <div className={sx(centerStyles.root)}>
        <AutomationEditor
          automationId={editingAutomationId ?? null}
          draft={draft}
          environmentOptions={environmentOptions}
          informationOptions={informationOptions}
          informationLoading={informationLoading}
          saving={saving}
          onDraftChange={setDraft}
          onInformationCreated={(option) => {
            const key = getAutomationInformationReferenceKey(option.reference);
            setInformationOptions((current) => [
              ...current.filter(
                (candidate) =>
                  getAutomationInformationReferenceKey(candidate.reference) !==
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
    loading && snapshot.automations.length === 0 && snapshot.runs.length === 0;

  return (
    <div className={sx(centerStyles.root)}>
      <header className={sx(centerStyles.header)}>
        <div className={sx(centerStyles.headerText)}>
          <div className={sx(centerStyles.headerTitleRow)}>
            <Workflow className={sx(centerStyles.headerIcon)} />
            <h1 className={sx(centerStyles.headerTitle)}>Automations</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>
            Schedule repeatable agent work and inspect run history.
          </p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          <Button
            size="sm"
            xstyle={centerStyles.headerButton}
            onClick={startCreate}
          >
            <Plus className={sx(centerStyles.buttonIcon)} />
            New automation
          </Button>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            onClick={openCommandsAndProcesses}
            aria-label={`Open ${WORKSPACE_TOOLS_LABEL}`}
            title={WORKSPACE_TOOLS_LABEL}
          >
            <SquareTerminal className={sx(centerStyles.actionIcon)} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            onClick={() => void loadSnapshot()}
            aria-label="Refresh automations"
            title="Refresh"
          >
            <RefreshCw
              className={sx(
                centerStyles.actionIcon,
                loading && centerStyles.actionIconSpinning,
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            aria-label="close-automation-center"
            title="Close Automations"
            onClick={closeAutomationCenter}
          >
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>

      <div className={sx(centerStyles.toolbar)}>
        <nav aria-label="Automation views" className={sx(centerStyles.tabNav)}>
          {(
            [
              ["automations", `Automations · ${snapshot.automations.length}`],
              ["runs", `Run history · ${snapshot.runs.length}`],
            ] as const
          ).map(([id, label]) => (
            <ActionButton
              key={id}
              size="sm"
              weight={activeTab === id ? "secondary" : "quiet"}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </ActionButton>
          ))}
        </nav>

        {activeTab === "automations" ? (
          <p className={sx(centerStyles.toolbarNote)}>
            Runs while Stave is open. After reopening, one missed occurrence is
            caught up.
          </p>
        ) : null}

        {activeTab === "runs" ? (
          <>
            <div className={sx(centerStyles.filterGroup)}>
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
                {snapshot.automations.map((automation) => (
                  <SelectItem key={automation.id} value={automation.id}>
                    {automation.name}
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
        <div className={sx(centerStyles.errorBanner)}>
          <AlertCircle className={sx(centerStyles.errorIcon)} />
          {error}
        </div>
      ) : null}

      {showLoadingState ? (
        <div
          className={sx(centerStyles.loadingPane)}
          role="status"
          aria-live="polite"
        >
          <div className={sx(centerStyles.loadingOrb)}>
            <ThinkingOrb
              state="searching"
              size={64}
              theme="auto"
              aria-label="Loading automation center"
            />
          </div>
          <div>
            <p className={sx(centerStyles.loadingTitle)}>Loading automations</p>
            <p className={sx(centerStyles.loadingHint)}>
              Restoring automations, execution policy, and run history.
            </p>
          </div>
        </div>
      ) : activeTab === "automations" ? (
        snapshot.automations.length === 0 ? (
          <Empty xstyle={centerStyles.emptyPane}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>No automations yet</EmptyTitle>
              <EmptyDescription>
                Run recurring reviews and checks on a schedule. Each automation
                keeps its own instructions, workspace, model, permissions, and
                run history.
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
                {snapshot.automations.map((automation) => {
                  const active = automation.id === selectedAutomationId;
                  const latestRun = latestRunByAutomationId.get(automation.id);
                  return (
                    <AdsButton layout="host"
                      key={automation.id}
                      type="button"
                      onClick={() => setSelectedAutomationId(automation.id)}
                      aria-current={active}
                      xstyle={[
                        centerStyles.automationCard,
                        transition.colors,
                        active && centerStyles.automationCardActive,
                      ]}
                    >
                      <div className={sx(centerStyles.automationCardHead)}>
                        <span
                          className={sx(
                            centerStyles.automationDot,
                            automation.enabled
                              ? centerStyles.automationDotOn
                              : centerStyles.automationDotOff,
                          )}
                          aria-hidden="true"
                        />
                        <span className={sx(centerStyles.automationName)}>
                          {automation.name}
                        </span>
                        {latestRun && isActiveRunStatus(latestRun.status) ? (
                          <Badge
                            variant="outline"
                            tone={
                              getRunStatusPresentation(latestRun.status).tone
                            }
                            xstyle={automationStyles.statusBadge}
                          >
                            {getRunStatusPresentation(latestRun.status).label}
                          </Badge>
                        ) : null}
                      </div>
                      <div className={sx(centerStyles.automationMeta)}>
                        <span className={sx(centerStyles.automationMetaText)}>
                          {automation.enabled
                            ? formatAutomationSchedule(automation.schedule)
                            : "Manual only"}
                        </span>
                        <span className={sx(centerStyles.automationMetaModel)}>
                          {automation.runtime.model}
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
                  value={selectedAutomationId ?? ""}
                  onValueChange={setSelectedAutomationId}
                >
                  <SelectTrigger
                    className={sx(centerStyles.compactSelect)}
                    aria-label="Select automation"
                  >
                    <SelectValue placeholder="Select an automation" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.automations.map((automation) => (
                      <SelectItem key={automation.id} value={automation.id}>
                        {automation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAutomation ? (
                <div className={sx(centerStyles.detailBody)}>
                  <div className={sx(centerStyles.detailHeadRow)}>
                    <div className={sx(centerStyles.detailHeadText)}>
                      <h2 className={sx(centerStyles.detailTitle)}>
                        {selectedAutomation.name}
                      </h2>
                      <p className={sx(centerStyles.detailPrompt)}>
                        {selectedAutomation.prompt}
                      </p>
                    </div>
                    <div className={sx(centerStyles.detailActions)}>
                      <Button
                        variant="outline"
                        size="sm"
                        xstyle={centerStyles.headerButton}
                        onClick={() => void runNow(selectedAutomation)}
                        disabled={
                          busyAutomationId === selectedAutomation.id ||
                          selectedAutomationAtConcurrencyLimit
                        }
                        title={
                          selectedAutomationAtConcurrencyLimit
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
                        onClick={() => startEdit(selectedAutomation)}
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
                        selectedAutomation.enabled ? "Scheduled" : "Manual only"
                      }
                    />
                    <Detail
                      label="Cadence"
                      value={
                        selectedAutomation.enabled
                          ? formatAutomationSchedule(selectedAutomation.schedule)
                          : "—"
                      }
                    />
                    <Detail
                      label="Next run"
                      value={
                        selectedAutomation.enabled
                          ? formatRelativeTime(selectedAutomation.nextRunAt)
                          : "—"
                      }
                    />
                    <Detail
                      label="Last run"
                      value={formatRelativeTime(selectedAutomation.lastRunAt)}
                    />
                    <Detail
                      label="Permissions"
                      value={formatAutomationTrustPolicy(
                        selectedAutomation.trustPolicy,
                      )}
                    />
                    <Detail
                      label="Provider"
                      value={`${
                        selectedAutomation.runtime.provider === "codex"
                          ? "Codex"
                          : "Claude"
                      } · ${selectedAutomation.runtime.effort}`}
                    />
                    <Detail
                      label="Repository"
                      value={selectedAutomation.environment.label}
                    />
                    <Detail
                      label="Concurrency"
                      value={`${selectedAutomationActiveRunCount}/${selectedAutomation.maxConcurrentRuns}`}
                    />
                  </dl>

                  <div className={sx(centerStyles.footerActions)}>
                    <Button
                      variant="outline"
                      size="sm"
                      xstyle={centerStyles.headerButton}
                      onClick={() => showRunHistory(selectedAutomation)}
                    >
                      <History className={sx(centerStyles.buttonIcon)} />
                      View run history
                      <span className={sx(centerStyles.runCount)}>
                        {runCountByAutomationId.get(selectedAutomation.id) ?? 0}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      xstyle={centerStyles.headerButton}
                      onClick={() => void toggleEnabled(selectedAutomation)}
                      disabled={busyAutomationId === selectedAutomation.id}
                    >
                      {selectedAutomation.enabled ? (
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
                      onClick={() => setDeleteAutomation(selectedAutomation)}
                      disabled={selectedAutomationActiveRunCount > 0}
                      title={
                        selectedAutomationActiveRunCount > 0
                          ? "Wait for active runs to finish"
                          : "Delete automation"
                      }
                    >
                      <Trash2 className={sx(centerStyles.buttonIcon)} />
                      Delete
                    </Button>
                  </div>

                  <AutomationLatestRun
                    run={latestRunByAutomationId.get(selectedAutomation.id) ?? null}
                    onOpenTask={(run) => void openRunResult(run)}
                    onOpenDetail={(run) => {
                      setRunAutomationFilter(selectedAutomation.id);
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
                    automationName={automationById.get(run.automationId)?.name}
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
                automation={automationById.get(selectedRun.automationId) ?? null}
                busy={busyAutomationId === selectedRun.automationId}
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
        open={Boolean(deleteAutomation)}
        title="Delete automation"
        description={
          deleteAutomation
            ? `Delete "${deleteAutomation.name}" and its saved run history? Created task conversations remain in their workspaces.`
            : ""
        }
        confirmLabel="Delete"
        loading={Boolean(deleteAutomation && busyAutomationId === deleteAutomation.id)}
        onCancel={() => setDeleteAutomation(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
