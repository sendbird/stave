import { PullRequestFixMenuItem } from "./pull-request/PullRequestFixMenuItem";
import { useAppStore } from "@/store/app.store";
import { openTarsPrCiFixDraft } from "@/components/tars/ask-tars";
import { Badge, Button, Loader } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { GitHubPrActivityResult, GitHubPrWorkflowJob, GitHubPrWorkflowRun } from "@/lib/github-pr-activity";
import { useCallback, useRef, useState } from "react";
import { reviewsStyles as styles } from "./source-control-reviews-panel.styles";
import { prActivityError, requestPrActivity, usePrActivityRead, type PrActivityTarget } from "./use-github-pr-activity";

const states = {
  queued: "prActivity.queued",
  in_progress: "prActivity.inProgress",
  completed: "prActivity.completed",
  failure: "prActivity.failure",
  success: "prActivity.success",
  cancelled: "prActivity.cancelled",
  skipped: "prActivity.skipped",
  timed_out: "prActivity.timedOut",
} as const;

function stateLabel(state: string) {
  return Object.hasOwn(states, state) ? states[state as keyof typeof states] : undefined;
}

function failed(conclusion: string) {
  return conclusion === "failure" || conclusion === "timed_out";
}

function JobRow({ job, runId, prUrl, cwd }: PrActivityTarget & { job: GitHubPrWorkflowJob; runId: number }) {
  const { t } = useTranslation("sourceControl");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<Extract<GitHubPrActivityResult, { kind: "log" }> | null>(null);
  const state = job.conclusion || job.status;
  const label = stateLabel(state);

  async function toggleLog() {
    if (log) {
      setLog(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setLog(await requestPrActivity({ action: "log", prUrl, cwd, runId, jobId: job.id }, "log"));
    } catch (cause) {
      setError(prActivityError(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className={sx(styles.conversationSection)}>
      <div className={sx(styles.activityActions)}>
        <span className={sx(styles.threadPath)}>{job.name}</span>
        <Badge variant="outline">{label ? t(label) : state}</Badge>
      </div>
      {job.failedSteps.length ? (
        <ul className={sx(styles.activityList)}>
          {job.failedSteps.map((step) => (
            <li key={step.number} className={sx(styles.bodyText)}>
              {t("prActivity.failedStep", { number: formatNumber(step.number), name: step.name })}
            </li>
          ))}
        </ul>
      ) : null}
      {job.status === "completed" && failed(job.conclusion) ? (
        <div className={sx(styles.activityActions)}>
          <Button type="button" size="sm" variant="ghost" disabled={loading}
            aria-expanded={!!log} onClick={() => void toggleLog()}>
            {loading ? t("prActivity.loadingLog") : log ? t("prActivity.hideLog") : t("prActivity.showLog")}
          </Button>
        </div>
      ) : null}
      {error ? <p role="alert" className={sx(styles.activityError)}>{error}</p> : null}
      {log ? (
        log.text ? (
          <>
            {log.truncated ? <p className={sx(styles.mutedText)}>{t("prActivity.truncatedLog")}</p> : null}
            <pre className={sx(styles.logTail)} tabIndex={0} aria-label={t("prActivity.logTail")}>{log.text}</pre>
          </>
        ) : <p className={sx(styles.mutedText)}>{t("prActivity.emptyLog")}</p>
      ) : null}
    </li>
  );
}

function WorkflowJobs({ runId, prUrl, cwd }: PrActivityTarget & { runId: number }) {
  const { t } = useTranslation("sourceControl");
  const request = useCallback(() => requestPrActivity({ action: "jobs", prUrl, cwd, runId }, "jobs"), [prUrl, cwd, runId]);
  const { value, loading, error } = usePrActivityRead<"jobs">(request);
  const ownPr = useAppStore(state => state.workspacePrInfoById[state.activeWorkspaceId]?.pr);
  const [rerun, setRerun] = useState<"idle" | "busy" | "sent">("idle");
  const [rerunError, setRerunError] = useState("");
  const writing = useRef(false);

  async function rerunFailed() {
    if (!value || writing.current) return;
    writing.current = true;
    setRerun("busy");
    setRerunError("");
    try {
      await requestPrActivity({ action: "rerun", prUrl, cwd, runId, attempt: value.attempt }, "written");
      setRerun("sent");
    } catch (cause) {
      setRerunError(prActivityError(cause));
      setRerun("idle");
    } finally {
      writing.current = false;
    }
  }

  if (loading) return <Loader role="status" aria-label={t("prActivity.loadingCi")} size="xs" />;
  if (error) return <p role="alert" className={sx(styles.activityError)}>{error}</p>;
  if (!value) return null;
  const state = value.conclusion || value.status;
  const label = stateLabel(state);
  return (
    <>
      <div className={sx(styles.activityActions)}>
        <p className={sx(styles.mutedText)}>
          {t("prActivity.attempt", { number: formatNumber(value.attempt) })}
        </p>
        <Badge variant="outline">{label ? t(label) : state}</Badge>
      </div>
      {value.jobs.length ? (
        <ul className={sx(styles.activityList)}>
          {value.jobs.map((job) => <JobRow key={job.id} job={job} runId={runId} prUrl={prUrl} cwd={cwd} />)}
        </ul>
      ) : <p className={sx(styles.mutedText)}>{t("prActivity.noJobs")}</p>}
      {value.omitted > 0 ? <p className={sx(styles.mutedText)}>{t("prActivity.omittedJobs", { count: value.omitted })}</p> : null}
      {value.status === "completed" && failed(value.conclusion) ? (
        <div className={sx(styles.activityActions)}>
          <Button type="button" size="sm" variant="outline" disabled={rerun !== "idle"} onClick={() => void rerunFailed()}>
            {rerun === "busy" ? t("prActivity.requestingRerun") : t("prActivity.rerunFailed")}
          </Button>
          {ownPr?.url === prUrl ? <PullRequestFixMenuItem button pr={ownPr} cwd={cwd} /> : <Button type="button" size="sm" variant="ghost" onClick={() => void openTarsPrCiFixDraft(prUrl)}>
            {t("tarsCI.fixAction")}
          </Button>}
        </div>
      ) : null}
      {rerunError ? <p role="alert" className={sx(styles.activityError)}>{rerunError}</p> : null}
      {rerun === "sent" ? <p role="status" className={sx(styles.mutedText)}>{t("prActivity.rerunRequested")}</p> : null}
    </>
  );
}

export function SourceControlPrChecks({ prUrl, cwd }: PrActivityTarget) {
  const { t } = useTranslation("sourceControl");
  const request = useCallback(() => requestPrActivity({ action: "runs", prUrl, cwd }, "runs"), [prUrl, cwd]);
  const { value, loading, error, refresh } = usePrActivityRead<"runs">(request);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function runName(run: GitHubPrWorkflowRun) {
    return t("prActivity.runName", { name: run.name || t("prActivity.workflowRun"), id: String(run.id) });
  }

  return (
    <section className={sx(styles.activityPane)}>
      <div className={sx(styles.activityActions)}>
        <h3 className={sx(styles.sectionLabel)}>{t("prActivity.workflowRuns")}</h3>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => void refresh()}>
          {t("sourceControlReviewsPanel.refresh")}
        </Button>
      </div>
      {loading ? <Loader role="status" aria-label={t("prActivity.loadingCi")} size="xs" /> : null}
      {error ? <p role="alert" className={sx(styles.activityError)}>{error}</p> : null}
      {value && !value.runs.length && !loading && !error ? <p className={sx(styles.mutedText)}>{t("prActivity.noRuns")}</p> : null}
      {!!value?.runs.length && !loading && !error ? (
        <ul className={sx(styles.activityList)}>
          {value.runs.map((run) => (
            <li key={run.id} className={sx(styles.timelineItem, styles.conversationSection)}>
              <div className={sx(styles.activityActions)}>
                <Button type="button" variant="ghost" size="sm" xstyle={styles.runButton} aria-expanded={selectedId === run.id}
                  onClick={() => setSelectedId(selectedId === run.id ? null : run.id)}>
                  {runName(run)}
                </Button>
              </div>
              {selectedId === run.id ? <WorkflowJobs runId={run.id} prUrl={prUrl} cwd={cwd} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {value?.partial ? <p className={sx(styles.mutedText)}>{t("prActivity.partialRuns")}</p> : null}
      {value && !value.partial && value.omitted > 0 ? <p className={sx(styles.mutedText)}>{t("prActivity.omittedRuns", { count: value.omitted })}</p> : null}
    </section>
  );
}
