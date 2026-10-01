import { useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight, Globe, Hand, Settings2, Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Segmented } from "@/components/playbooks/Segmented";
import { StageList } from "@/components/playbooks/StageList";
import type { AutomationPermissionMode } from "@/lib/automations";
import { useLocalMcpReadiness } from "@/lib/local-mcp-readiness";
import { isActiveMissionState, MISSION_LIMITS } from "@/lib/missions/domain";
import {
  canStartWith,
  evaluatePreStartChecks,
  readGitHubStatus,
  readWorkingTreeStatus,
  WORKING_TREE_PENDING,
  type GitHubReading,
  type WorkingTreeReading,
} from "@/lib/missions/pre-start-checks";
import {
  buildMissionStartInput,
  defaultAuthorizedEffects,
  defaultPlaybookChoice,
  listPlaybookChoices,
  resolvePlaybookChoice,
  STARTER_CHOICE_PREFIX,
  describeExternalEffect,
  describeMissionStops,
  describeStartButton,
  listMissionStops,
  remainingStages,
} from "@/lib/missions/start-sheet";
import { duplicatePlaybook, explainPlaybookLimit, groupIssuesByField, upsertPlaybook } from "@/lib/playbooks/library";
import { parsePlaybook } from "@/lib/playbooks/normalize";
import {
  CHECK_IN_LABELS,
  CHECK_INS,
  DEFAULT_PLAYBOOK_PERMISSION_MODE,
  PLAYBOOK_LIMITS,
  type CheckIns,
  type Playbook,
} from "@/lib/playbooks/schema";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore, useTaskMission } from "@/store/missions-store";
import { usePlaybooksUiStore, type StartMissionRequest } from "@/store/playbooks-ui-store";
import { PreStartChecks } from "./PreStartChecks";

const MISSION_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>(["claude-code", "codex"]);
const CHECK_IN_OPTIONS = CHECK_INS.map((value) => ({ value, label: CHECK_IN_LABELS[value] }));
const PERMISSION_OPTIONS: ReadonlyArray<{ value: AutomationPermissionMode; label: string; description: string }> = [
  {
    value: "auto",
    label: "Auto",
    description: "The agent works without asking; the mission still stops at your sign-offs and at steps you did not allow.",
  },
  { value: "guided", label: "Guided", description: "The agent asks before sensitive actions, and the mission waits for each answer." },
  { value: "manual", label: "Your settings", description: "Uses your provider permission settings." },
];

/** Mounted once; renders the sheet while a start request is open. */
export function StartMissionSheetHost() {
  const request = usePlaybooksUiStore((state) => state.startSheet);
  const close = usePlaybooksUiStore((state) => state.closeStartSheet);
  if (!request) return null;
  return <StartMissionSheet key={`${request.workspaceId}:${request.taskId}`} request={request} onClose={close} />;
}

/**
 * Start mission: choose a playbook, say what it should achieve, and decide
 * where it stops. Everything the mission may do outside this machine is
 * listed with its own consent, and Start stays off until the checks pass.
 * The target task is frozen when the sheet opens.
 */
export function StartMissionSheet(props: { request: StartMissionRequest; onClose: () => void }) {
  const { request } = props;
  const saved = useAppStore((state) => state.settings.playbooks);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updatePromptDraft = useAppStore((state) => state.updatePromptDraft);
  const closeAutomationCenter = useAppStore((state) => state.closeAutomationCenter);
  const task = useAppStore((state) => state.tasks.find((candidate) => candidate.id === request.taskId) ?? null);
  const workspacePath = useAppStore((state) => state.workspacePathById[request.workspaceId] ?? null);
  const openPlaybooks = usePlaybooksUiStore((state) => state.openPlaybooks);
  const startMission = useMissionsStore((state) => state.startMission);
  const taskMission = useTaskMission(request.workspaceId, request.taskId);

  const [playbookId, setPlaybookId] = useState(request.playbookId ?? defaultPlaybookChoice(saved));
  const base = useMemo(() => resolvePlaybookChoice(playbookId, saved, new Date()), [playbookId, saved]);
  const [copy, setCopy] = useState<Playbook | null>(base);
  const [assignment, setAssignment] = useState(request.assignment ?? "");
  const [checkIns, setCheckIns] = useState<CheckIns>(base?.checkIns ?? "plan-and-publishing");
  const [permissionMode, setPermissionMode] = useState<AutomationPermissionMode>(
    base?.runtime?.permissionMode ?? DEFAULT_PLAYBOOK_PERMISSION_MODE,
  );
  const [authorized, setAuthorized] = useState<string[]>(() => (base ? defaultAuthorizedEffects(base) : []));
  const [customizing, setCustomizing] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [github, setGithub] = useState<GitHubReading>({ state: "pending" });
  const [workingTree, setWorkingTree] = useState<WorkingTreeReading>(WORKING_TREE_PENDING);
  // An acknowledgement covers the reading it was given for, not a later one.
  const [acknowledgedTree, setAcknowledgedTree] = useState<WorkingTreeReading | null>(null);
  const dirtyAcknowledged = acknowledgedTree === workingTree;
  // "Save as new" keeps one copy across a failed start and its retry.
  const savedCopyId = useRef<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState(0);

  // A different playbook starts from its own defaults.
  useEffect(() => {
    setCopy(base);
    setCheckIns(base?.checkIns ?? "plan-and-publishing");
    setPermissionMode(base?.runtime?.permissionMode ?? DEFAULT_PLAYBOOK_PERMISSION_MODE);
    setAuthorized(base ? defaultAuthorizedEffects(base) : []);
    setCustomizing(false);
    setStartIndex(0);
    setSaveAsNew(false);
    savedCopyId.current = null;
    setNewName(base ? `${base.name} (edited)`.slice(0, PLAYBOOK_LIMITS.name) : "");
    // Keyed on the choice, not the object: saving a copy must not reset the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  const providerId = (task?.provider ?? "claude-code") as ProviderId;
  const providerSupported = Boolean(task && MISSION_PROVIDERS.has(providerId));
  const { readiness } = useLocalMcpReadiness({ primaryProviderId: providerId, refreshKey: request.taskId });
  // Stages before the one the mission starts at never run, so they need nothing.
  const startAt = copy ? Math.min(startIndex, copy.stages.length - 1) : 0;
  const remaining = copy ? remainingStages(copy, startAt) : null;
  const usesPullRequests = Boolean(remaining?.stages.some((stage) => stage.kind === "action"));

  useEffect(() => {
    let cancelled = false;
    const scm = window.api?.sourceControl;
    if (!scm?.getStatus || !workspacePath) {
      setWorkingTree({
        dirtyFileCount: null,
        error: scm?.getStatus
          ? "Stave does not know this workspace's folder."
          : "The working tree can be read only in the desktop app.",
      });
    } else {
      setWorkingTree(WORKING_TREE_PENDING);
      void scm
        .getStatus({ cwd: workspacePath })
        .then((result) => !cancelled && setWorkingTree(readWorkingTreeStatus(result)))
        .catch(() => !cancelled && setWorkingTree(readWorkingTreeStatus(null)));
    }
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!usesPullRequests) return;
    let cancelled = false;
    const scm = window.api?.sourceControl;
    if (!scm?.getPrStatus || !workspacePath) {
      setGithub({ state: "unknown", detail: "The GitHub CLI can be checked only in the desktop app." });
      return;
    }
    setGithub({ state: "pending" });
    void scm
      .getPrStatus({ cwd: workspacePath })
      .then((result) => !cancelled && setGithub(readGitHubStatus(result)))
      .catch(() => !cancelled && setGithub(readGitHubStatus(null)));
    return () => {
      cancelled = true;
    };
  }, [usesPullRequests, workspacePath]);

  const consent = { checkIns, permissionMode, authorizedEffectStageIds: authorized };
  const checks = remaining
    ? evaluatePreStartChecks({
        playbook: remaining,
        providerSupported,
        reporting: readiness,
        github,
        dirtyFileCount: workingTree.dirtyFileCount,
        workingTreeError: workingTree.error,
        dirtyAcknowledged,
        activeMission: Boolean(taskMission && isActiveMissionState(taskMission.mission.state)),
      })
    : [];
  const parsedCopy = copy ? parsePlaybook(copy) : null;
  const effectStages = copy ? copy.stages.filter((stage) => describeExternalEffect(stage) !== null) : [];
  const stops = copy ? new Set(listMissionStops(copy, consent, startAt)) : new Set<number>();
  // A retry updates the copy it saved, which never counts against the limit.
  const playbookLimit = saveAsNew ? explainPlaybookLimit(saved, savedCopyId.current ?? undefined) : null;
  const ready =
    Boolean(copy) &&
    parsedCopy?.ok === true &&
    assignment.trim().length > 0 &&
    canStartWith(checks) &&
    (!saveAsNew || (newName.trim().length > 0 && !playbookLimit)) &&
    !starting;

  const start = async () => {
    if (!copy || !parsedCopy?.ok) return;
    setStarting(true);
    setFailure(null);
    let playbook = parsedCopy.playbook;
    if (saveAsNew) {
      const duplicate = duplicatePlaybook({ playbook, now: new Date(), taken: saved });
      // A retry after a failed start updates the copy it saved, not a second one.
      const created = { ...duplicate, id: savedCopyId.current ?? duplicate.id, name: newName.trim() };
      savedCopyId.current = created.id;
      updateSettings({ patch: { playbooks: upsertPlaybook(saved, created) } });
      playbook = created;
    }
    const response = await startMission(
      buildMissionStartInput({
        workspaceId: request.workspaceId,
        taskId: request.taskId,
        playbook,
        assignment,
        consent,
        startStageIndex: startAt,
      }),
    );
    setStarting(false);
    if (!response.ok) {
      setFailure(response.message ?? "The mission did not start.");
      return;
    }
    request.onMissionStarted?.(response.mission?.mission.id ?? null);
    if (request.onStarted) request.onStarted();
    else if (request.fromComposerDraft) updatePromptDraft({ taskId: request.taskId, patch: { text: "" } });
    closeAutomationCenter();
    props.onClose();
  };

  const playbookOptions = listPlaybookChoices(saved);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !starting) props.onClose();
      }}
    >
      <SheetContent side="right" xstyle={styles.sheet}>
        <SheetHeader xstyle={styles.header}>
          <div className={sx(styles.headerRow)}>
            <IconTile size="sm" tone="accent">
              <Target size={iconTileGlyphSizes.sm} />
            </IconTile>
            <div className={sx(styles.headerText)}>
              <SheetTitle className={sx(styles.title)}>Start a mission</SheetTitle>
              <SheetDescription className={sx(styles.subtitle)}>
                On {task?.title ? `“${task.title}”` : "this task"} ·{" "}
                {task ? getProviderLabel({ providerId }) : "no task"}. Stave runs each stage and stops where you ask.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className={sx(styles.content)}>
          <section className={sx(styles.section)}>
            <Textarea
              label="What should this mission achieve?"
              description="Describe the outcome, or paste a Slack thread or issue link."
              placeholder="Fix the billing table overflow on narrow screens."
              value={assignment}
              maxLength={MISSION_LIMITS.maxAssignmentChars}
              autoResize
              maxRows={10}
              size="sm"
              autoFocus={!assignment}
              onChange={(event) => setAssignment(event.target.value)}
            />
          </section>

          <section className={sx(styles.section)} aria-labelledby="start-mission-playbook">
            <div className={sx(styles.sectionHeader)}>
              <h3 id="start-mission-playbook" className={sx(styles.sectionTitle)}>
                Playbook
              </h3>
              <Button
                variant="link"
                size="xs"
                onClick={() => {
                  openPlaybooks(base && !playbookId.startsWith(STARTER_CHOICE_PREFIX) ? base.id : null);
                  props.onClose();
                }}
              >
                <Settings2 aria-hidden />
                Manage playbooks
              </Button>
            </div>
            <Select
              aria-label="Playbook"
              size="sm"
              value={playbookId}
              options={playbookOptions}
              onValueChange={(value) => setPlaybookId(String(value))}
            />
            {copy ? <p className={sx(styles.hint)}>{copy.purpose}</p> : null}
            {copy && copy.stages.length > 1 ? (
              <div className={sx(styles.startAt)}>
                <span className={sx(styles.startAtLabel)}>Start at</span>
                <div className={sx(styles.startAtSelect)}>
                  <Select
                    aria-label="Start at stage"
                    size="sm"
                    value={String(startAt)}
                    options={copy.stages.map((stage, index) => ({ value: String(index), label: `${index + 1}. ${stage.title}` }))}
                    onValueChange={(value) => setStartIndex(Number(value))}
                  />
                </div>
                {startAt > 0 ? (
                  <span className={sx(styles.hint)}>Earlier stages are skipped — for work you already did.</span>
                ) : null}
              </div>
            ) : null}
            {copy ? (
              <ol className={sx(styles.rail)} aria-label="Stages">
                {copy.stages.map((stage, index) => {
                  const effect = describeExternalEffect(stage);
                  const asks = stops.has(index);
                  const skipped = index < startAt;
                  return (
                    <li key={stage.id} className={sx(styles.railRow, skipped && styles.railRowSkipped)}>
                      <span className={sx(styles.railIndex)}>{index + 1}</span>
                      <span className={sx(styles.railKind, stage.kind === "action" && styles.railKindAction)}>
                        {stage.kind === "ai" ? <Sparkles aria-hidden className={sx(styles.icon)} /> : <Zap aria-hidden className={sx(styles.icon)} />}
                      </span>
                      <span className={sx(styles.railTitle)}>
                        {stage.title}
                        {effect ? (
                          <Globe
                            role="img"
                            aria-label="acts outside this machine"
                            className={sx(styles.icon, styles.railEffect)}
                          >
                            <title>{effect}</title>
                          </Globe>
                        ) : null}
                      </span>
                      <span className={sx(styles.railState, asks && styles.railStateAsks)}>
                        {skipped ? (
                          "Skipped"
                        ) : index === startAt ? (
                          "Starts now"
                        ) : asks ? (
                          <>
                            <Hand aria-hidden className={sx(styles.icon)} />
                            Asks you
                          </>
                        ) : (
                          "Automatic"
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={sx(styles.error)}>This playbook is no longer saved. Choose another.</p>
            )}
          </section>

          <section className={sx(styles.section)} aria-labelledby="start-mission-checkins">
            <h3 id="start-mission-checkins" className={sx(styles.sectionTitle)}>
              Check-ins
            </h3>
            <Segmented aria-label="Check-ins" value={checkIns} options={CHECK_IN_OPTIONS} onChange={setCheckIns} />
            <p className={sx(styles.hint)}>{copy ? describeMissionStops(copy, consent, startAt) : null}</p>
          </section>

          {copy && effectStages.length > 0 ? (
            <section className={sx(styles.section)} aria-labelledby="start-mission-effects">
              <h3 id="start-mission-effects" className={sx(styles.sectionTitle)}>
                Acts outside this machine
              </h3>
              <p className={sx(styles.hint)}>
                Checked stages go ahead on their own; unchecked ones always ask you first.
              </p>
              <div className={sx(styles.effects)}>
                {effectStages.map((stage) => (
                  <Checkbox
                    key={stage.id}
                    label={
                      <span className={sx(styles.effectLabel)}>
                        <span className={sx(styles.railTitle)}>{stage.title}</span>
                        <span className={sx(styles.effectText)}>{describeExternalEffect(stage)}</span>
                      </span>
                    }
                    checked={authorized.includes(stage.id)}
                    onCheckedChange={(value) =>
                      setAuthorized((current) =>
                        value === true ? [...new Set([...current, stage.id])] : current.filter((id) => id !== stage.id),
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className={sx(styles.section)} aria-labelledby="start-mission-permissions">
            <h3 id="start-mission-permissions" className={sx(styles.sectionTitle)}>
              Permissions for this mission
            </h3>
            <Segmented aria-label="Permissions" value={permissionMode} options={PERMISSION_OPTIONS} onChange={setPermissionMode} />
            <p className={sx(styles.hint)}>
              {PERMISSION_OPTIONS.find((option) => option.value === permissionMode)?.description} Recorded for this start
              only; the playbook grants nothing on its own.
            </p>
          </section>

          {copy ? (
            <section className={sx(styles.section)}>
              <Button
                variant="quiet"
                size="sm"
                press="none"
                aria-expanded={customizing}
                xstyle={styles.disclosure}
                onClick={() => setCustomizing((value) => !value)}
              >
                <ChevronRight aria-hidden className={sx(styles.chevron, customizing && styles.chevronOpen)} />
                Edit stages for this mission
              </Button>
              {customizing ? (
                <>
                  <StageList
                    playbook={copy}
                    issues={parsedCopy && !parsedCopy.ok ? groupIssuesByField(parsedCopy.issues) : new Map()}
                    onChange={(next) => {
                      setCopy(next);
                      setAuthorized((current) => current.filter((id) => next.stages.some((stage) => stage.id === id)));
                    }}
                  />
                  <Checkbox
                    label="Save as a new playbook"
                    description="Leave it off to change the stages for this mission only."
                    checked={saveAsNew}
                    onCheckedChange={(value) => setSaveAsNew(value === true)}
                  />
                  {saveAsNew ? (
                    <TextField
                      size="sm"
                      label="Name"
                      value={newName}
                      maxLength={PLAYBOOK_LIMITS.name}
                      error={playbookLimit ?? undefined}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          <section className={sx(styles.section)} aria-labelledby="start-mission-checks">
            <h3 id="start-mission-checks" className={sx(styles.sectionTitle)}>
              Before you start
            </h3>
            <PreStartChecks
              checks={checks}
              dirtyAcknowledged={dirtyAcknowledged}
              onAcknowledgeDirty={(value) => setAcknowledgedTree(value ? workingTree : null)}
            />
          </section>
        </div>

        <SheetFooter xstyle={styles.footer}>
          {failure ? (
            <p className={sx(styles.error)} role="alert">
              {failure}
            </p>
          ) : null}
          <div className={sx(styles.footerRow)}>
            <Button variant="quiet" size="sm" disabled={starting} onClick={props.onClose}>
              Cancel
            </Button>
            <span className={sx(styles.spacer)} />
            <Button size="sm" disabled={!ready} loading={starting} onClick={() => void start()}>
              {copy ? describeStartButton(copy, consent, startAt) : "Start"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const styles = stylex.create({
  sheet: {
    gap: 0,
    padding: 0,
    width: "100%",
    "@media (min-width: 40rem)": { maxWidth: "34rem" },
  },
  header: {
    flexShrink: 0,
    paddingBlockStart: vars["--ads-space-20"],
    paddingBlockEnd: vars["--ads-space-16"],
    paddingInlineStart: vars["--ads-space-20"],
    paddingInlineEnd: "3rem",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  headerRow: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-12"] },
  headerText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  title: { margin: 0, fontSize: vars["--ads-font-size-heading"], fontWeight: vars["--ads-font-weight-semibold"] },
  subtitle: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-20"],
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"] },
  sectionTitle: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  hint: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-danger-text"],
  },
  rail: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    overflow: "hidden",
  },
  railRow: {
    display: "grid",
    gridTemplateColumns: "16px 16px minmax(0, 1fr) auto",
    columnGap: vars["--ads-space-8"],
    alignItems: "center",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
  },
  railRowSkipped: { opacity: 0.55 },
  startAt: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], flexWrap: "wrap" },
  startAtLabel: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  startAtSelect: { width: "13rem", maxWidth: "100%" },
  railIndex: { color: vars["--ads-color-text-subtle"], fontVariantNumeric: "tabular-nums", textAlign: "center" },
  railKind: { display: "flex", alignItems: "center", height: "1.25rem", color: vars["--ads-color-text-muted"] },
  railKindAction: { color: vars["--ads-color-accent"] },
  railTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  railEffect: { color: vars["--ads-color-text-subtle"] },
  effects: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  effectLabel: { display: "flex", flexDirection: "column", gap: 1, fontSize: vars["--ads-font-size-caption"] },
  effectText: { color: vars["--ads-color-text-muted"], fontWeight: vars["--ads-font-weight-regular"] },
  railState: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: vars["--ads-color-text-subtle"],
    whiteSpace: "nowrap",
  },
  railStateAsks: { color: vars["--ads-color-warning-text"], fontWeight: vars["--ads-font-weight-medium"] },
  icon: { width: 13, height: 13, flex: "0 0 auto" },
  disclosure: {
    alignSelf: "flex-start",
    gap: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--ads-space-4"]})`,
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
  },
  chevron: { transitionProperty: "transform", transitionDuration: vars["--ads-motion-duration-fast"] },
  chevronOpen: { transform: "rotate(90deg)" },
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-20"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  footerRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  spacer: { flex: "1 1 auto" },
});
