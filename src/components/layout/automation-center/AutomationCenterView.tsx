import { formatAutomationSchedule, formatAutomationTrustPolicy, describeAutomationDraftIssue } from "@/lib/automation-presentation";
import { i18n, useTranslation } from "@/i18n";
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
import { WORKSPACE_TOOLS_LABEL_KEY } from "@/lib/workspace-scripts/constants";
import {
  buildScheduleRows,
  resolveScheduleSelection,
  scheduleListState,
  type ScheduleRow,
} from "@/lib/schedule-rows";
import { useScheduleRequestStore } from "@/store/schedule-request-store";
import type { WakeUp } from "@/lib/supervision/wake-up-policy";
import { AutomationEditor } from "./AutomationEditor";
import { CheckBackDetail } from "./CheckBackDetail";
import { CheckBackEditor } from "./CheckBackEditor";
import { ScheduleKindSwitch } from "./ScheduleKindSwitch";
import { ScheduleRows } from "./ScheduleRows";
import { useCheckBacks } from "./useCheckBacks";
import { AutomationLatestRun } from "./AutomationLatestRun";
import { AutomationRunDetail, AutomationRunRow } from "./AutomationRunDetail";
import {
  AUTOMATION_RUN_FILTERS,
  buildEnvironmentOptions,
  createAutomationDraft,
  formatDateTime,
  formatRelativeTime,
  getAutomationErrorMessage,
  isActiveRunStatus,
  matchesRunFilter,
  automationToDraft,
  type AutomationRunFilter,
} from "./automation-center.utils";
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
  const { t: tI18n } = useTranslation(["automation", "scripts"]);
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
    tasks,
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
          state.tasks,
        ] as const,
    ),
  );
  const [snapshot, setSnapshot] = useState<AutomationSnapshot>({
    automations: [],
    runs: [],
  });
  const [activeTab, setActiveTab] = useState<AutomationCenterTab>("automations");
  // The row the user picked (`start:<id>` / `check-back:<id>`); the shown one
  // falls back to the first row when it is gone or nothing was picked.
  const [pickedScheduleKey, setPickedScheduleKey] = useState<string | null>(null);
  const [checkBackSheet, setCheckBackSheet] = useState<{
    wakeUp: WakeUp | null;
    taskId: string | null;
  } | null>(null);
  const [removeCheckBack, setRemoveCheckBack] = useState<WakeUp | null>(null);
  const checkBacks = useCheckBacks();
  const checkBackRequest = useScheduleRequestStore((state) => state.checkBack);
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
  // The first answer, data or error; later reloads keep what is on screen.
  const [snapshotAnswered, setSnapshotAnswered] = useState(false);
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
      workspaces, i18n.resolvedLanguage],
  );
  const environmentOptions = useMemo(
    () =>
      buildEnvironmentOptions({
        recentRepositories,
        activeRepository,
      }),
    [activeRepository, recentRepositories, i18n.resolvedLanguage],
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
  }, [environmentOptions, repositoryPath, i18n.resolvedLanguage]);

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
    [i18n.resolvedLanguage],
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
          setError(result.message ?? i18n.t("automation:additionalCopy.message20"));
          return;
        }
        setSnapshot(result.snapshot);
        setError("");
      } catch (loadError) {
        if (!isCurrent()) return;
        setError(
          getAutomationErrorMessage(loadError, "Failed to load automations."),
        );
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setSnapshotAnswered(true);
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

  const hasDraft = draft !== null || checkBackSheet !== null;
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
    [snapshot.automations, i18n.resolvedLanguage],
  );
  const runCountByAutomationId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      counts.set(run.automationId, (counts.get(run.automationId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.runs, i18n.resolvedLanguage]);
  const latestRunByAutomationId = useMemo(() => {
    // `snapshot.runs` arrives sorted by startedAt desc, so the first hit wins.
    const latest = new Map<string, AutomationRun>();
    for (const run of snapshot.runs) {
      if (!latest.has(run.automationId)) {
        latest.set(run.automationId, run);
      }
    }
    return latest;
  }, [snapshot.runs, i18n.resolvedLanguage]);
  const activeRunCountByAutomationId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of snapshot.runs) {
      if (isActiveRunStatus(run.status)) {
        counts.set(run.automationId, (counts.get(run.automationId) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshot.runs, i18n.resolvedLanguage]);

  const taskTitleById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks, i18n.resolvedLanguage],
  );
  const scheduleRows = useMemo(
    () =>
      buildScheduleRows({
        automations: snapshot.automations,
        runs: snapshot.runs,
        wakeUps: checkBacks.wakeUps,
        summaries: checkBacks.summaries,
        taskTitleById,
      }),
    [checkBacks.summaries, checkBacks.wakeUps, snapshot.automations, snapshot.runs, taskTitleById, i18n.resolvedLanguage],
  );
  const selectedRow = resolveScheduleSelection(scheduleRows, pickedScheduleKey);
  const selectedKey = selectedRow?.key ?? null;
  const selectedAutomation =
    selectedRow?.kind === "start" ? (automationById.get(selectedRow.id) ?? null) : null;
  const selectedCheckBack =
    selectedRow?.kind === "check-back"
      ? (checkBacks.wakeUps.find((wakeUp) => wakeUp.id === selectedRow.id) ?? null)
      : null;
  const selectedCheckBackRow = selectedCheckBack ? selectedRow : null;

  // A task's "Check back…" menu item parks a request here; open its sheet once
  // the check-backs have loaded, so an existing one is edited rather than doubled.
  useEffect(() => {
    if (!checkBackRequest || !checkBacks.loaded) return;
    const request = useScheduleRequestStore.getState().consume();
    if (!request) return;
    const existing =
      checkBacks.wakeUps.find(
        (wakeUp) => wakeUp.taskId === request.taskId && wakeUp.workspaceId === request.workspaceId,
      ) ?? null;
    setActiveTab("automations");
    setCheckBackSheet({ wakeUp: existing, taskId: request.taskId });
  }, [checkBackRequest, checkBacks.loaded, checkBacks.wakeUps]);

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
    [runAutomationFilter, runFilter, snapshot.runs, i18n.resolvedLanguage],
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
      toast.error(describeAutomationDraftIssue(parsed.error.issues[0], tI18n));
      return;
    }
    const api = window.api?.automations;
    if (
      (editingAutomationId && !api?.update) ||
      (!editingAutomationId && !api?.create)
    ) {
      toast.error(tI18n("automation:automationCenterView.automationServiceIsUnavailable"));
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
        toast.error(result.message ?? tI18n("automation:automationCenterView.failedToSaveAutomation"));
        return;
      }
      setPickedScheduleKey(`start:${result.automation.id}`);
      cancelEdit();
      await loadSnapshot();
      toast.success(
        editingAutomationId ? tI18n("automation:automationCenterView.scheduleUpdated") : tI18n("automation:automationCenterView.scheduleCreated"),
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
      toast.error(tI18n("automation:automationCenterView.automationServiceIsUnavailable"));
      return;
    }
    setBusyAutomationId(automation.id);
    try {
      if (automation.environment.workspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot();
      }
      const result = await api({ id: automation.id });
      if (!result.ok || !result.run) {
        toast.error(result.message ?? tI18n("automation:automationCenterView.failedToStartAutomation"));
        return;
      }
      await loadSnapshot({ quiet: true });
      if (result.run.status === "failed") {
        toast.error(result.run.error ?? tI18n("automation:automationCenterView.failedToStartAutomation"));
        return;
      }
      toast.success(tI18n("automation:automationCenterView.scheduleStarted"));
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
      toast.error(tI18n("automation:automationCenterView.automationServiceIsUnavailable"));
      return;
    }
    setBusyAutomationId(automation.id);
    try {
      const result = await api({
        id: automation.id,
        enabled: !automation.enabled,
      });
      if (!result.ok) {
        toast.error(result.message ?? tI18n("automation:automationCenterView.failedToUpdateAutomation"));
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
      toast.error(tI18n("automation:automationCenterView.automationServiceIsUnavailable"));
      return;
    }
    setBusyAutomationId(deleteAutomation.id);
    try {
      const result = await api({ id: deleteAutomation.id });
      if (!result.ok) {
        toast.error(result.message ?? tI18n("automation:automationCenterView.failedToDeleteAutomation"));
        return;
      }
      setDeleteAutomation(null);
      await loadSnapshot();
      toast.success(tI18n("automation:automationCenterView.scheduleDeleted"));
    } catch (deleteError) {
      toast.error(
        getAutomationErrorMessage(deleteError, "Failed to delete automation."),
      );
    } finally {
      setBusyAutomationId(null);
    }
  }

  function selectRow(row: ScheduleRow) {
    setPickedScheduleKey(row.key);
  }

  function runRowNow(row: ScheduleRow) {
    const automation = automationById.get(row.id);
    if (automation) void runNow(automation);
  }

  async function setCheckBackPaused(id: string, paused: boolean) {
    const api = window.api?.wakeUps;
    if (!api) {
      toast.error(tI18n("automation:automationCenterView.schedulesAreAvailableInTheStaveDesktop"));
      return;
    }
    setBusyAutomationId(id);
    try {
      const result = await api.setPaused({ id, paused });
      if (!result.ok) toast.error(result.message ?? tI18n("automation:automationCenterView.failedToUpdateTheSchedule"));
      await checkBacks.reload();
    } catch (updateError) {
      toast.error(getAutomationErrorMessage(updateError, "Failed to update the schedule."));
    } finally {
      setBusyAutomationId(null);
    }
  }

  function toggleRow(row: ScheduleRow) {
    if (row.kind === "start") {
      const automation = automationById.get(row.id);
      if (automation) void toggleEnabled(automation);
      return;
    }
    void setCheckBackPaused(row.id, row.toggle === "pause");
  }

  async function confirmRemoveCheckBack() {
    if (!removeCheckBack) return;
    const api = window.api?.wakeUps;
    if (!api) return;
    setBusyAutomationId(removeCheckBack.id);
    try {
      const result = await api.remove({ id: removeCheckBack.id });
      if (!result.ok) {
        toast.error(result.message ?? tI18n("automation:automationCenterView.failedToRemoveTheSchedule"));
        return;
      }
      setRemoveCheckBack(null);
      setPickedScheduleKey(null);
      await checkBacks.reload();
      toast.success(tI18n("automation:automationCenterView.scheduleRemoved"));
    } catch (removeError) {
      toast.error(getAutomationErrorMessage(removeError, "Failed to remove the schedule."));
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
        toast.error(tI18n("automation:automationCenterView.thisAutomationSTaskConversationCouldNot"));
        return;
      }
      closeAutomationCenter();
    } catch (openError) {
      toast.error(
        getAutomationErrorMessage(openError, "Failed to open task result."),
      );
    }
  }

  if (checkBackSheet) {
    return (
      <div className={sx(centerStyles.root)}>
        <CheckBackEditor
          key={checkBackSheet.wakeUp?.id ?? checkBackSheet.taskId ?? "new"}
          wakeUp={checkBackSheet.wakeUp}
          taskId={checkBackSheet.taskId}
          taskTitle={checkBackSheet.taskId ? (taskTitleById.get(checkBackSheet.taskId) ?? null) : null}
          onKindChange={() => {
            setCheckBackSheet(null);
            startCreate();
          }}
          onCancel={() => setCheckBackSheet(null)}
          onSaved={() => {
            const saved = checkBackSheet.wakeUp;
            setCheckBackSheet(null);
            if (saved) setPickedScheduleKey(`check-back:${saved.id}`);
            void checkBacks.reload();
          }}
        />
      </div>
    );
  }

  if (draft) {
    return (
      <div className={sx(centerStyles.root)}>
        <AutomationEditor
          kindSwitch={
            editingAutomationId === null ? (
              <ScheduleKindSwitch
                value="start"
                onChange={() => {
                  cancelEdit();
                  setCheckBackSheet({ wakeUp: null, taskId: null });
                }}
              />
            ) : null
          }
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

  const loadError = [error, checkBacks.error].filter(Boolean).join(" ");
  const listState = scheduleListState({
    rowCount: scheduleRows.length,
    automationsLoaded: snapshotAnswered,
    checkBacksLoaded: checkBacks.loaded,
    failed: Boolean(loadError),
  });
  const showLoadingState =
    activeTab === "automations"
      ? listState === "loading"
      : !snapshotAnswered && snapshot.runs.length === 0;
  const tabLabel = (label: string, count: number) =>
    count > 0 ? `${label} · ${count}` : label;

  return (
    <div className={sx(centerStyles.root)}>
      <header className={sx(centerStyles.header)}>
        <div className={sx(centerStyles.headerText)}>
          <div className={sx(centerStyles.headerTitleRow)}>
            <Workflow className={sx(centerStyles.headerIcon)} />
            <h1 className={sx(centerStyles.headerTitle)}>{tI18n("automation:automationCenterView.schedules")}</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>
            {tI18n("automation:automationCenterView.workThatRunsOnItsOwnAnd")}</p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          {activeTab === "runs" ? null : (
            <Button
              size="sm"
              xstyle={centerStyles.headerButton}
              onClick={startCreate}
            >
              <Plus className={sx(centerStyles.buttonIcon)} />
              {tI18n("automation:automationCenterView.newSchedule")}</Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            onClick={openCommandsAndProcesses}
            aria-label={tI18n("automation:automationCenterView.openValue", { WORKSPACE_TOOLS_LABEL: tI18n(WORKSPACE_TOOLS_LABEL_KEY) })}
            title={tI18n(WORKSPACE_TOOLS_LABEL_KEY)}
          >
            <SquareTerminal className={sx(centerStyles.actionIcon)} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            xstyle={centerStyles.iconButton}
            onClick={() => {
              void loadSnapshot();
              void checkBacks.reload();
            }}
            aria-label={tI18n("automation:automationCenterView.refreshSchedules")}
            title={tI18n("automation:automationCenterView.refresh")}
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
            data-testid="close-schedules"
            aria-label={i18n.t("automation:automationCenterView.accessibility.closeSchedules")}
            title={tI18n("automation:automationCenterView.closeSchedules")}
            onClick={closeAutomationCenter}
          >
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>

      <div className={sx(centerStyles.toolbar)}>
        <nav aria-label={tI18n("automation:automationCenterView.scheduleViews")} className={sx(centerStyles.tabNav)}>
          {(
            [
              ["automations", tabLabel("Schedules", scheduleRows.length)],
              ["runs", tabLabel("Run history", snapshot.runs.length)],
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
            {tI18n("automation:automationCenterView.runsWhileStaveIsOpenAfterReopening")}</p>
        ) : null}

        {activeTab === "runs" ? (
          <>
            <div className={sx(centerStyles.filterGroup)}>
              {AUTOMATION_RUN_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="xs"
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
                size="sm"
                className={sx(centerStyles.runSelect)}
                aria-label={tI18n("automation:automationCenterView.filterRunsByAutomation")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AUTOMATIONS}>{tI18n("automation:automationCenterView.allAutomations")}</SelectItem>
                {snapshot.automations.map((automation) => (
                  <SelectItem key={automation.id} value={automation.id}>
                    {automation.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={sx(centerStyles.shownCount)}>
          {tI18n("automation:automationCenterView.shownCount", { count: visibleRuns.length })}
        </span>
          </>
        ) : null}
      </div>

      {loadError ? (
        <div className={sx(centerStyles.errorBanner)} role="alert">
          <AlertCircle className={sx(centerStyles.errorIcon)} />
          {loadError}
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
              aria-label={tI18n("automation:automationCenterView.loadingSchedules")}
            />
          </div>
          <div>
            <p className={sx(centerStyles.loadingTitle)}>{tI18n("automation:automationCenterView.loadingSchedules")}</p>
            <p className={sx(centerStyles.loadingHint)}>
              {tI18n("automation:automationCenterView.restoringSchedulesExecutionPolicyAndRunHistory")}</p>
          </div>
        </div>
      ) : activeTab === "automations" ? (
        listState === "failed" ? null : listState === "empty" ? (
          <Empty xstyle={centerStyles.emptyPane}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>{tI18n("automation:automationCenterView.noSchedulesYet")}</EmptyTitle>
              <EmptyDescription>
                {tI18n("automation:automationCenterView.startATaskOnACadenceOr")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={startCreate}>
                <Plus className={sx(centerStyles.actionIcon)} />
                {tI18n("automation:automationCenterView.newSchedule")}</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className={sx(centerStyles.masterDetail)}>
            <div className={sx(centerStyles.masterColumn)}>
              <ScheduleRows
                rows={scheduleRows}
                selectedKey={selectedKey}
                busyId={busyAutomationId}
                onSelect={selectRow}
                onRunNow={runRowNow}
                onToggle={toggleRow}
              />
            </div>

            <div className={sx(centerStyles.detailColumn)}>
              {/* Narrow layouts hide the master column, so offer a picker. */}
              <div className={sx(centerStyles.compactPicker)}>
                <Select
                  value={selectedKey ?? ""}
                  onValueChange={(key) => {
                    const row = scheduleRows.find((candidate) => candidate.key === key);
                    if (row) selectRow(row);
                  }}
                >
                  <SelectTrigger
                    className={sx(centerStyles.compactSelect)}
                    aria-label={tI18n("automation:automationCenterView.selectSchedule")}
                  >
                    <SelectValue placeholder={tI18n("automation:automationCenterView.selectASchedule")} />
                  </SelectTrigger>
                  <SelectContent>
                    {scheduleRows.map((row) => (
                      <SelectItem key={row.key} value={row.key}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCheckBack && selectedCheckBackRow ? (
                <CheckBackDetail
                  row={selectedCheckBackRow}
                  wakeUp={selectedCheckBack}
                  busy={busyAutomationId === selectedCheckBack.id}
                  onEdit={() =>
                    setCheckBackSheet({ wakeUp: selectedCheckBack, taskId: selectedCheckBack.taskId })
                  }
                  onToggle={() => toggleRow(selectedCheckBackRow)}
                  onRemove={() => setRemoveCheckBack(selectedCheckBack)}
                />
              ) : selectedAutomation ? (
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
                            ? tI18n("automation:automationCenterView.concurrencyLimitReached")
                            : tI18n("automation:automationCenterView.runNow")
                        }
                      >
                        <Play className={sx(centerStyles.buttonIcon)} />
                        {tI18n("automation:automationCenterView.runNow")}</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        xstyle={centerStyles.iconButton}
                        onClick={() => startEdit(selectedAutomation)}
                        aria-label={tI18n("automation:automationCenterView.editSchedule")}
                        title={tI18n("automation:automationCenterView.edit")}
                      >
                        <Pencil className={sx(centerStyles.buttonIcon)} />
                      </Button>
                    </div>
                  </div>

                  <dl className={sx(centerStyles.facts)}>
                    <Detail
                      label={tI18n("automation:automationCenterView.status")}
                      value={
                        selectedAutomation.enabled ? "Scheduled" : "Manual only"
                      }
                    />
                    {selectedAutomation.enabled ? (
                      <>
                        <Detail
                          label={tI18n("automation:automationCenterView.cadence")}
                          value={formatAutomationSchedule(selectedAutomation.schedule)}
                        />
                        <Detail
                          label={tI18n("automation:automationCenterView.nextRun")}
                          value={formatRelativeTime(selectedAutomation.nextRunAt)}
                        />
                      </>
                    ) : null}
                    <Detail
                      label={tI18n("automation:automationCenterView.lastRun")}
                      value={formatRelativeTime(selectedAutomation.lastRunAt)}
                    />
                    <Detail
                      label={tI18n("automation:automationCenterView.permissions")}
                      value={formatAutomationTrustPolicy(
                        selectedAutomation.trustPolicy,
                      )}
                    />
                    <Detail
                      label={tI18n("automation:automationCenterView.provider")}
                      value={`${
                        selectedAutomation.runtime.provider === "codex"
                          ? "Codex"
                          : "Claude"
                      } · ${selectedAutomation.runtime.effort}`}
                    />
                    <Detail
                      label={tI18n("automation:automationCenterView.repository")}
                      value={selectedAutomation.environment.label}
                    />
                    <Detail
                      label={tI18n("automation:automationCenterView.concurrency")}
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
                      {tI18n("automation:automationCenterView.viewRunHistory")}<span className={sx(centerStyles.runCount)}>
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
                          {tI18n("automation:automationCenterView.pauseSchedule")}</>
                      ) : (
                        <>
                          <Play className={sx(centerStyles.buttonIcon)} />
                          {tI18n("automation:automationCenterView.enableSchedule")}</>
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
                          ? tI18n("automation:automationCenterView.waitForActiveRunsToFinish")
                          : tI18n("automation:automationCenterView.deleteSchedule")
                      }
                    >
                      <Trash2 className={sx(centerStyles.buttonIcon)} />
                      {tI18n("automation:automationCenterView.delete")}</Button>
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
                  {tI18n("automation:automationCenterView.selectAScheduleToSeeItsConfiguration")}</div>
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
                  <EmptyTitle>{tI18n("automation:automationCenterView.noMatchingRuns")}</EmptyTitle>
                  <EmptyDescription>
                    {tI18n("automation:automationCenterView.everyManualOrScheduledExecutionIsRecorded")}</EmptyDescription>
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
                {tI18n("automation:automationCenterView.selectARunToSeeItsFull")}</div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteAutomation)}
        title={tI18n("automation:automationCenterView.deleteSchedule")}
        description={
          deleteAutomation
            ? tI18n("automation:automationCenterView.deleteValueAndItsSavedRunHistory", { value1: deleteAutomation.name })
            : ""
        }
        confirmLabel={tI18n("automation:automationCenterView.delete")}
        loading={Boolean(deleteAutomation && busyAutomationId === deleteAutomation.id)}
        onCancel={() => setDeleteAutomation(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ConfirmDialog
        open={Boolean(removeCheckBack)}
        title={tI18n("automation:automationCenterView.removeSchedule")}
        description={tI18n("automation:automationCenterView.removeThisCheckBackAndItsHistory")}
        confirmLabel={tI18n("automation:automationCenterView.remove")}
        loading={Boolean(removeCheckBack && busyAutomationId === removeCheckBack.id)}
        onCancel={() => setRemoveCheckBack(null)}
        onConfirm={() => void confirmRemoveCheckBack()}
      />
    </div>
  );
}
