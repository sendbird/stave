import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { useId } from "react";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { AgentRunDoneWhen } from "@/components/agent-runs/AgentRunDoneWhen";
import { describeSignOffQuestion } from "@/components/agent-runs/SignOffCard";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { openExternalUrl } from "@/lib/external-links";
import { TASK_USER_STATE_LABELS, taskUserStateToWorkState, type TaskResult } from "@/lib/task-user-state";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";
import type { TaskPanelStatus } from "./task-panel-state";

/**
 * The top of the Task panel, top to bottom: the state on one line, what the
 * user must do (only while something waits on them), the result or why it
 * stopped, and the conditions still open. Everything here comes from one
 * `TaskPanelStatus`, so no two lines can disagree.
 */
export function TaskPanelSummary(props: {
  workspaceId: string;
  taskId: string;
  view: TaskPanelStatus;
  agentRun: AgentRunDetail | undefined;
  onShowLatest: () => void;
}) {
  useTranslation();
  const { view, taskId, workspaceId } = props;
  const status = view.status;
  return (
    <div className={sx(styles.root)}>
      {view.pastTurnAt ? (
        <div className={sx(styles.titleRow)}>
          <h3 className={sx(styles.title)} data-testid="task-state-title">
            {i18n.t("session:taskPanel.earlierTurn", {
              time: formatDateTime(view.pastTurnAt, { dateStyle: "medium", timeStyle: "short" }),
            })}
          </h3>
          <Button variant="quiet" size="2xs" onClick={props.onShowLatest}>
            {i18n.t("session:taskPanel.backToLatest")}
          </Button>
        </div>
      ) : null}
      <p className={sx(styles.state)} data-testid="task-state" data-task-state={status?.state} role="status">
        {status ? (
          <StateMark
            state={taskUserStateToWorkState(status)}
            size="md"
            showLabel
            label={TASK_USER_STATE_LABELS[status.state]}
          />
        ) : (
          <span className={sx(styles.muted)}>{i18n.t("session:taskPanel.notStarted")}</span>
        )}
      </p>
      {status?.state === "waiting" ? (
        <Section label={i18n.t("session:taskPanel.needsYou")}>
          <p className={sx(styles.text)}>
            {status.waitingOn === "sign-off"
              ? describeSignOff(props.agentRun)
              : view.request?.text || i18n.t(status.waitingOn === "approval" ? "session:taskPanel.approvalWaits" : "session:taskPanel.questionWaits")}
          </p>
          <div>
            <Button
              variant="primary"
              size="xs"
              onClick={() => goToRequest({ workspaceId, taskId, request: view.request })}
            >
              {i18n.t(status.waitingOn === "question" ? "session:taskPanel.answer" : "session:taskPanel.reviewRequest")}
            </Button>
          </div>
        </Section>
      ) : null}
      {status?.state === "finished" && status.result ? (
        <Section label={i18n.t("session:taskPanel.result")}>
          <ResultLinks taskId={taskId} turnId={view.turnId} result={status.result} />
        </Section>
      ) : null}
      {status?.state === "stopped" || status?.state === "blocked" ? (
        <Section label={i18n.t(status.state === "stopped" ? "session:taskPanel.result" : "session:taskPanel.reason")}>
          <p className={sx(styles.text)}>{status.reason || i18n.t("session:taskPanel.noReason")}</p>
        </Section>
      ) : null}
      {view.remaining.length > 0 ? (
        <Section label={i18n.t("session:taskPanel.remaining")}>
          <AgentRunDoneWhen lines={view.remaining} />
        </Section>
      ) : null}
    </div>
  );
}

function Section(props: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={sx(styles.section)}>
      <h3 id={id} className={sx(styles.sectionLabel)}>{props.label}</h3>
      {props.children}
    </section>
  );
}

/** The question the stage that waits asks, or a plain sentence when the run names none. */
function describeSignOff(detail: AgentRunDetail | undefined) {
  const stage = detail?.agentRun.workflow.stages[detail.agentRun.currentStageIndex];
  return stage ? describeSignOffQuestion(stage) : i18n.t("session:taskPanel.signOffWaits");
}

/**
 * The open request lives in the conversation (a question or approval card, or
 * the sign-off card above the composer): show the conversation and go there.
 */
function goToRequest(args: { workspaceId: string; taskId: string; request: TaskPanelStatus["request"] }) {
  useTaskReviewModeStore.getState().showConversation(args.taskId);
  const state = useAppStore.getState();
  if (args.request) {
    state.focusTranscriptDecision({ taskId: args.taskId, messageId: args.request.messageId, requestId: args.request.requestId });
  } else {
    void state.focusTaskAttention({ workspaceId: args.workspaceId, taskId: args.taskId });
  }
}

function ResultLinks(props: { taskId: string; turnId: string | null; result: TaskResult }) {
  useTranslation();
  const { result, taskId, turnId } = props;
  const pr = result.pullRequest;
  return (
    <ul className={sx(styles.links)}>
      {pr ? (
        <li className={sx(styles.linkRow)}>
          <a
            href={pr.url}
            className={sx(styles.link, focusRing.ring)}
            title={pr.title}
            onClick={(event) => {
              event.preventDefault();
              void openExternalUrl({ url: pr.url });
            }}
          >
            {pr.number
              ? i18n.t("session:taskPanel.pullRequestNumber", { number: pr.number })
              : i18n.t("session:taskPanel.pullRequest")}
          </a>
          {pr.title ? <span className={sx(styles.linkDetail)}>{pr.title}</span> : null}
        </li>
      ) : null}
      {result.changedFiles > 0 ? (
        <li className={sx(styles.linkRow)}>
          <span className={sx(styles.text)}>{i18n.t("session:taskPanel.changedFiles", { count: result.changedFiles })}</span>
          {turnId ? (
            <Button
              variant="link"
              size="2xs"
              xstyle={styles.inlineAction}
              onClick={() => useTaskReviewModeStore.getState().openReview(taskId, { kind: "turn", taskId, turnId })}
            >
              {i18n.t("session:taskPanel.reviewChanges")}
            </Button>
          ) : null}
        </li>
      ) : null}
      {result.answerMessageId ? (
        <li className={sx(styles.linkRow)}>
          <Button
            variant="link"
            size="2xs"
            xstyle={styles.inlineAction}
            onClick={() => {
              useTaskReviewModeStore.getState().showConversation(taskId);
              useAppStore.getState().focusTranscriptMessage({ taskId, messageId: result.answerMessageId! });
            }}
          >
            {i18n.t("session:taskPanel.showAnswer")}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  titleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    minWidth: 0,
  },
  title: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  state: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    minWidth: 0,
  },
  muted: { color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-regular"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  sectionLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  text: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  links: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  linkRow: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"], minWidth: 0 },
  link: {
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-accent"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    textDecoration: { default: "none", ":hover": "underline" },
  },
  // A link-weight action sits on the text's edge, like the pull request link above it.
  inlineAction: { paddingInline: 0 },
  linkDetail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
