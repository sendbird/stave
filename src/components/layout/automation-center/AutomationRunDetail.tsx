import { Button as AdsButton } from "@/components/ads/components/Button";
import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  formatAutomationTrustPolicy,
  type RoutineRun,
  type RoutineSpec,
} from "@/lib/routines";
import {
  automationStyles,
  runToneDotStyles,
} from "./automation-center.styles";
import {
  formatDateTime,
  formatRelativeTime,
  formatRunDuration,
  getRunStatusPresentation,
} from "./automation-center.utils";
import { runDetailStyles } from "./automation-run-detail.styles";

export function AutomationRunRow(props: {
  run: RoutineRun;
  automationName?: string;
  active: boolean;
  onSelect: (run: RoutineRun) => void;
}) {
  const presentation = getRunStatusPresentation(props.run.status);
  return (
    <AdsButton layout="host"
      type="button"
      onClick={() => props.onSelect(props.run)}
      aria-current={props.active}
      xstyle={[runDetailStyles.row, props.active && runDetailStyles.rowActive]}
    >
      <div className={sx(runDetailStyles.rowHead)}>
        <span
          className={sx(
            automationStyles.statusDot,
            runToneDotStyles[presentation.tone],
          )}
          aria-hidden="true"
        />
        <span className={sx(runDetailStyles.rowName)}>
          {props.automationName ?? "Removed automation"}
        </span>
        <Badge
          variant="outline"
          tone={presentation.tone}
          className={sx(automationStyles.statusBadge)}
        >
          {presentation.label}
        </Badge>
      </div>
      <div className={sx(runDetailStyles.rowMeta)}>
        <span>{formatRelativeTime(props.run.startedAt)}</span>
        <span className={sx(automationStyles.truncate)}>
          {props.run.trigger === "scheduled" ? "Schedule" : "Manual"} ·{" "}
          {formatRunDuration(props.run)}
        </span>
      </div>
    </AdsButton>
  );
}

function DetailRow(props: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={sx(runDetailStyles.detailCell)}>
      <dt className={sx(runDetailStyles.detailTerm)}>{props.label}</dt>
      <dd
        // Values such as timestamps and paths truncate in the narrow detail
        // grid, so keep the full text reachable on hover.
        title={props.value}
        className={sx(
          runDetailStyles.detailValue,
          props.mono && runDetailStyles.detailValueMono,
        )}
      >
        {props.value}
      </dd>
    </div>
  );
}

export function AutomationRunDetail(props: {
  run: RoutineRun;
  automation: RoutineSpec | null;
  busy: boolean;
  onOpenTask: (run: RoutineRun) => void;
  onRunAgain: (automation: RoutineSpec) => void;
}) {
  const presentation = getRunStatusPresentation(props.run.status);
  const automation = props.automation;
  return (
    <div className={sx(runDetailStyles.root)}>
      <div className={sx(runDetailStyles.header)}>
        <div className={sx(runDetailStyles.headerRow)}>
          <div className={sx(runDetailStyles.headerMain)}>
            <div className={sx(runDetailStyles.headerTitleRow)}>
              <Badge
                variant="outline"
                tone={presentation.tone}
                className={sx(automationStyles.statusBadge)}
              >
                {presentation.label}
              </Badge>
              <h2 className={sx(runDetailStyles.headerTitle)}>
                {automation?.name ?? "Removed automation"}
              </h2>
            </div>
            <p className={sx(runDetailStyles.headerSub)}>
              Started {formatRelativeTime(props.run.startedAt)} ·{" "}
              {formatDateTime(props.run.startedAt)}
            </p>
          </div>
          <div className={sx(runDetailStyles.headerActions)}>
            {automation ? (
              <Button
                variant="outline"
                size="sm"
                xstyle={runDetailStyles.headerButton}
                disabled={props.busy}
                onClick={() => props.onRunAgain(automation)}
              >
                <RotateCw className={sx(runDetailStyles.buttonIcon)} />
                Run again
              </Button>
            ) : null}
            {props.run.taskId ? (
              <Button
                size="sm"
                xstyle={runDetailStyles.headerButton}
                onClick={() => props.onOpenTask(props.run)}
              >
                <ExternalLink className={sx(runDetailStyles.buttonIcon)} />
                Open task
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={sx(runDetailStyles.body)}>
        <div className={sx(runDetailStyles.bodyGrid)}>
          <dl className={sx(runDetailStyles.facts)}>
            <DetailRow
              label="Trigger"
              value={props.run.trigger === "scheduled" ? "Schedule" : "Manual"}
            />
            <DetailRow
              label="Permissions"
              value={formatAutomationTrustPolicy(props.run.trustPolicy)}
            />
            <DetailRow label="Duration" value={formatRunDuration(props.run)} />
            <DetailRow
              label="Scheduled for"
              value={formatDateTime(props.run.scheduledFor)}
            />
            <DetailRow
              label="Started"
              value={formatDateTime(props.run.startedAt)}
            />
            <DetailRow
              label="Completed"
              value={formatDateTime(props.run.completedAt)}
            />
            <DetailRow
              label="Repository"
              value={automation?.environment.label ?? props.run.projectPath}
            />
            <DetailRow
              label="Model"
              value={automation?.runtime.model ?? "—"}
            />
            <DetailRow
              label="Config hash"
              value={props.run.configHash ?? "legacy"}
              mono
            />
          </dl>

          <div className={sx(runDetailStyles.executionRow)}>
            <span className={sx(runDetailStyles.detailTerm)}>Execution ID</span>
            <span className={sx(runDetailStyles.executionId)}>
              {props.run.id}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy execution ID"
              title="Copy execution ID"
              onClick={() => void copyTextToClipboard(props.run.id)}
            >
              <Copy className={sx(runDetailStyles.buttonIcon)} />
            </Button>
          </div>

          {props.run.error ? (
            <section className={sx(runDetailStyles.section)}>
              <h3 className={sx(automationStyles.sectionHeading)}>
                {props.run.status === "skipped" ? "Skip reason" : "Error"}
              </h3>
              <p
                className={sx(
                  runDetailStyles.prose,
                  props.run.status === "skipped"
                    ? runDetailStyles.proseSkipped
                    : runDetailStyles.proseError,
                )}
              >
                {props.run.error}
              </p>
            </section>
          ) : null}

          <section className={sx(runDetailStyles.section)}>
            <h3 className={sx(automationStyles.sectionHeading)}>Result</h3>
            {props.run.resultPreview ? (
              <p className={sx(runDetailStyles.prose, runDetailStyles.proseResult)}>
                {props.run.resultPreview}
              </p>
            ) : (
              <p className={sx(runDetailStyles.prose, runDetailStyles.proseEmpty)}>
                {props.run.status === "completed"
                  ? "Completed without a text response. Open the task to inspect its tool output."
                  : props.run.status === "waiting"
                    ? "Waiting for approval or user input. Open the task to respond."
                    : props.run.status === "running"
                      ? "The task is still running."
                      : "No result was recorded for this run."}
              </p>
            )}
          </section>

          {automation ? (
            <section className={sx(runDetailStyles.section)}>
              <h3 className={sx(automationStyles.sectionHeading)}>
                Instructions
              </h3>
              <p
                className={sx(
                  runDetailStyles.prose,
                  runDetailStyles.proseInstructions,
                )}
              >
                {automation.prompt}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
