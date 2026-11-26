import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { StateMark } from "@/components/aui/components/StateMark";
import { StepRail } from "@/components/aui/components/StepRail";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { Button } from "@/components/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import {
  WORKSPACE_CREATION_STEPS,
  useWorkspaceCreationStore,
  type WorkspaceCreationProgress,
  type WorkspaceCreationStep,
} from "@/store/workspace-creation-progress";

type StepStatus = WorkspaceCreationProgress["steps"][WorkspaceCreationStep]["status"];

/** Each step status drawn in the shared work-state vocabulary (`state-vocabulary.ts`). */
const STEP_WORK_STATE: Record<StepStatus, WorkState> = {
  waiting: "queued",
  running: "working",
  complete: "ready",
  skipped: "skipped",
  failed: "failed",
};

function currentStep(progress: WorkspaceCreationProgress) {
  return WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "running")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "failed")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "waiting");
}

/** A running step's clock, ticking once a second only while one runs. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

export function useWorkspaceCreationDialogProgress(onClose: () => void) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const owner = useRef<string | null>(null);
  const progress = useWorkspaceCreationStore((state) => workspaceId ? state.byId[workspaceId] : undefined);
  const reset = () => {
    owner.current = null;
    setWorkspaceId(null);
  };
  return {
    progress,
    running: !!progress && WORKSPACE_CREATION_STEPS.some((step) => progress.steps[step].status === "running"),
    begin: (id: string) => {
      owner.current = id;
      setWorkspaceId(id);
    },
    ready: (id: string) => {
      if (owner.current !== id) return;
      reset();
      onClose();
    },
    reset,
  };
}

/**
 * Workspace preparation as a checklist: every step with its state and how long
 * it took, the setup command under the running setup step, and a failed
 * step's reason, logs and retry in its own row. In the create dialog, once the
 * worktree exists (the workspace has a sidebar row to come back to), the
 * dialog can be closed and preparation continues.
 */
export function WorkspaceCreationPanel({ progress, inDialog = false, onBackground }: {
  progress: WorkspaceCreationProgress;
  inDialog?: boolean;
  /** Closes the dialog while preparation continues. */
  onBackground?: () => void;
}) {
  const { t } = useTranslation(["workspace", "common"]);
  const [openLogs, setOpenLogs] = useState<WorkspaceCreationStep | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (inDialog) section.current?.focus({ preventScroll: true });
  }, [inDialog]);
  const step = currentStep(progress);
  const anyRunning = WORKSPACE_CREATION_STEPS.some((key) => progress.steps[key].status === "running");
  const anyFailed = WORKSPACE_CREATION_STEPS.some((key) => progress.steps[key].status === "failed");
  const now = useNow(anyRunning);
  const position = step ? WORKSPACE_CREATION_STEPS.indexOf(step) + 1 : WORKSPACE_CREATION_STEPS.length;
  const statusText = step
    // A failed step changes the words, so the status region announces the failure.
    ? t(progress.steps[step].status === "failed"
        ? (progress.branch ? "creationProgress.positionWithBranchFailed" : "creationProgress.positionFailed")
        : (progress.branch ? "creationProgress.positionWithBranch" : "creationProgress.position"), {
        branch: progress.branch,
        current: position,
        total: WORKSPACE_CREATION_STEPS.length,
        step: t(`creationProgress.steps.${step}`),
      })
    : null;
  const canBackground = inDialog && !!onBackground && !anyFailed
    && progress.steps.worktree.status === "complete";
  return (
    <section
      aria-label={t("creationProgress.title")}
      className={sx(inDialog ? styles.dialog : styles.panel)}
      ref={section}
      tabIndex={inDialog ? -1 : undefined}
    >
      <div className={sx(styles.content, inDialog && styles.dialogContent)}>
        <div className={sx(styles.header)}>
          {!inDialog ? <h2 className={sx(styles.title)}>{t("creationProgress.title")}</h2> : null}
          {statusText ? <p role="status" className={sx(styles.position)}>{statusText}</p> : null}
        </div>
        {/* Each step leads with its own state mark, so no rail is drawn (`StepRail` rail={false}). */}
        <StepRail density="compact" rail={false} role="list">
          {WORKSPACE_CREATION_STEPS.map((key) => {
            const state = progress.steps[key];
            const running = state.status === "running";
            const failed = state.status === "failed";
            const detail = failed ? state.detail : undefined;
            const logsVisible = openLogs === key;
            const elapsed = state.startedAt === undefined || state.status === "skipped"
              ? null
              : running
                ? formatDuration(now - state.startedAt)
                : state.endedAt !== undefined
                  // Tenths only from a second up: a quicker step reads `<1s`, not `0s`.
                  ? formatDuration(state.endedAt - state.startedAt, { tenths: state.endedAt - state.startedAt >= 1_000 })
                  : null;
            return (
              <StepRail.Step
                key={key}
                role="listitem"
                data-step={key}
                data-status={state.status}
                marker={(
                  <StateMark
                    state={STEP_WORK_STATE[state.status]}
                    label={t(`creationProgress.status.${state.status}`)}
                  />
                )}
              >
                <div className={sx(styles.stepRow)}>
                  <span className={sx(
                    styles.stepLabel,
                    (running || failed) && styles.stepLabelCurrent,
                    (state.status === "waiting" || state.status === "skipped") && styles.stepLabelIdle,
                    failed && styles.failed,
                  )}>
                    {t(`creationProgress.steps.${key}`)}
                  </span>
                  {elapsed ? <span className={sx(styles.elapsed)}>{elapsed}</span> : null}
                </div>
                {running && key === "setup" && progress.setupCommand ? (
                  <code className={sx(styles.command)} aria-label={t("creationProgress.setupCommandLabel")}>
                    {progress.setupCommand}
                  </code>
                ) : null}
                {detail ? (
                  logsVisible
                    ? <pre className={sx(styles.log)}>{detail}</pre>
                    : <p className={sx(styles.reason)}>{detail.split("\n")[0]}</p>
                ) : null}
                {failed && (state.retry || detail) ? (
                  <div className={sx(styles.actions)}>
                    {state.retry ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => {
                        if (inDialog) section.current?.focus({ preventScroll: true });
                        setOpenLogs(null);
                        void state.retry?.();
                      }}>
                        {t("common:actions.retry")}
                      </Button>
                    ) : null}
                    {detail ? (
                      <Button type="button" size="sm" variant="ghost" aria-expanded={logsVisible} onClick={() => setOpenLogs(logsVisible ? null : key)}>
                        {t(logsVisible ? "creationProgress.hideLogs" : "creationProgress.openLogs")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </StepRail.Step>
            );
          })}
        </StepRail>
        {canBackground ? (
          <div className={sx(styles.footer)}>
            <p className={sx(styles.hint)}>{t("creationProgress.backgroundHint")}</p>
            <Button type="button" size="sm" variant="outline" onClick={onBackground}>
              {t("creationProgress.background")}
            </Button>
          </div>
        ) : null}
        {!inDialog && progress.prompt ? (
          <article className={sx(styles.draft)}>
            <h3 className={sx(styles.title)}>{progress.taskTitle}</h3>
            <p className={sx(styles.prompt)}>{progress.prompt}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

const styles = stylex.create({
  failed: { color: vars["--aui-color-danger-text"] },
  dialog: { minWidth: 0, overflowY: "auto", paddingBlock: vars["--aui-space-16"] },
  dialogContent: { margin: 0, maxWidth: "none" },
  panel: { display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: vars["--aui-space-24"], boxSizing: "border-box" },
  content: { display: "grid", gap: vars["--aui-space-12"], width: "100%", maxWidth: "36rem", margin: "auto", fontSize: vars["--aui-font-size-body"] },
  header: { display: "grid", gap: vars["--aui-space-4"], minWidth: 0 },
  title: { margin: 0, fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"] },
  position: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], overflowWrap: "anywhere" },
  // The marker box is `controlHeightSm` tall; a first line of the same height centres the mark on it.
  stepRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0, minHeight: vars["--aui-control-height-sm"] },
  stepLabel: { minWidth: 0, overflowWrap: "anywhere" },
  stepLabelCurrent: { fontWeight: vars["--aui-font-weight-semibold"] },
  stepLabelIdle: { color: vars["--aui-color-text-muted"] },
  elapsed: { flexShrink: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontVariantNumeric: "tabular-nums" },
  command: {
    display: "block", minWidth: 0, marginBlockStart: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"], backgroundColor: vars["--aui-color-surface-tint"],
    color: vars["--aui-color-text-muted"], fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], marginBlockStart: vars["--aui-space-4"] },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: vars["--aui-space-8"] },
  hint: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  draft: { display: "grid", gap: vars["--aui-space-4"], minWidth: 0, paddingBlockStart: vars["--aui-space-12"], borderBlockStart: `1px solid ${vars["--aui-color-border"]}` },
  reason: { margin: 0, marginBlockStart: vars["--aui-space-4"], color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  log: { maxHeight: "12em", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, marginBlockStart: vars["--aui-space-4"] },
  prompt: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});
