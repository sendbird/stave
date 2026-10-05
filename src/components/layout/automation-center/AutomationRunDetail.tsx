import { formatAutomationTrustPolicy } from "@/lib/automation-presentation";
import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  type AutomationRun,
  type AutomationSpec,
} from "@/lib/automations";
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
  run: AutomationRun;
  automationName?: string;
  active: boolean;
  onSelect: (run: AutomationRun) => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
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
          {props.automationName ?? tI18n("automation:automationRunDetail.removedAutomation")}
        </span>
        <Badge
          variant="outline"
          tone={presentation.tone}
          xstyle={automationStyles.statusBadge}
        >
          {presentation.label}
        </Badge>
      </div>
      <div className={sx(runDetailStyles.rowMeta)}>
        <span>{formatRelativeTime(props.run.startedAt)}</span>
        <span className={sx(automationStyles.truncate)}>
          {props.run.trigger === "scheduled" ? tI18n("automation:automationRunDetail.schedule") : tI18n("automation:automationRunDetail.manual")} ·{" "}
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
  run: AutomationRun;
  automation: AutomationSpec | null;
  busy: boolean;
  onOpenTask: (run: AutomationRun) => void;
  onRunAgain: (automation: AutomationSpec) => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
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
                xstyle={automationStyles.statusBadge}
              >
                {presentation.label}
              </Badge>
              <h2 className={sx(runDetailStyles.headerTitle)}>
                {automation?.name ?? tI18n("automation:automationRunDetail.removedAutomation")}
              </h2>
            </div>
            <p className={sx(runDetailStyles.headerSub)}>
          {tI18n("automation:automationRunDetail.startedAt", { relative: formatRelativeTime(props.run.startedAt), date: formatDateTime(props.run.startedAt) })}
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
                {tI18n("automation:automationRunDetail.runAgain")}</Button>
            ) : null}
            {props.run.taskId ? (
              <Button
                size="sm"
                xstyle={runDetailStyles.headerButton}
                onClick={() => props.onOpenTask(props.run)}
              >
                <ExternalLink className={sx(runDetailStyles.buttonIcon)} />
                {tI18n("automation:automationRunDetail.openTask")}</Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={sx(runDetailStyles.body)}>
        <div className={sx(runDetailStyles.bodyGrid)}>
          <dl className={sx(runDetailStyles.facts)}>
            <DetailRow
              label={tI18n("automation:automationRunDetail.trigger")}
              value={props.run.trigger === "scheduled" ? "Schedule" : "Manual"}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.permissions")}
              value={formatAutomationTrustPolicy(props.run.trustPolicy)}
            />
            <DetailRow label={tI18n("automation:automationRunDetail.duration")} value={formatRunDuration(props.run)} />
            <DetailRow
              label={tI18n("automation:automationRunDetail.scheduledFor")}
              value={formatDateTime(props.run.scheduledFor)}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.started")}
              value={formatDateTime(props.run.startedAt)}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.completed")}
              value={formatDateTime(props.run.completedAt)}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.repository")}
              value={automation?.environment.label ?? props.run.repositoryPath}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.model")}
              value={automation?.runtime.model ?? "—"}
            />
            <DetailRow
              label={tI18n("automation:automationRunDetail.configHash")}
              value={props.run.configHash ?? "legacy"}
              mono
            />
          </dl>

          <div className={sx(runDetailStyles.executionRow)}>
            <span className={sx(runDetailStyles.detailTerm)}>{tI18n("automation:automationRunDetail.executionId")}</span>
            <span className={sx(runDetailStyles.executionId)}>
              {props.run.id}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={tI18n("automation:automationRunDetail.copyExecutionId")}
              title={tI18n("automation:automationRunDetail.copyExecutionId")}
              onClick={() => void copyTextToClipboard(props.run.id)}
            >
              <Copy className={sx(runDetailStyles.buttonIcon)} />
            </Button>
          </div>

          {props.run.error ? (
            <section className={sx(runDetailStyles.section)}>
              <h3 className={sx(automationStyles.sectionHeading)}>
                {props.run.status === "skipped" ? tI18n("automation:automationRunDetail.skipReason") : tI18n("automation:automationRunDetail.error")}
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
            <h3 className={sx(automationStyles.sectionHeading)}>{tI18n("automation:automationRunDetail.result")}</h3>
            {props.run.resultPreview ? (
              <p className={sx(runDetailStyles.prose, runDetailStyles.proseResult)}>
                {props.run.resultPreview}
              </p>
            ) : (
              <p className={sx(runDetailStyles.prose, runDetailStyles.proseEmpty)}>
                {props.run.status === "completed"
                  ? tI18n("automation:automationRunDetail.completedWithoutATextResponseOpenThe")
                  : props.run.status === "waiting"
                    ? tI18n("automation:automationRunDetail.waitingForApprovalOrUserInputOpen")
                    : props.run.status === "running"
                      ? tI18n("automation:automationRunDetail.theTaskIsStillRunning")
                      : tI18n("automation:automationRunDetail.noResultWasRecordedForThisRun")}
              </p>
            )}
          </section>

          {automation ? (
            <section className={sx(runDetailStyles.section)}>
              <h3 className={sx(automationStyles.sectionHeading)}>
                {tI18n("automation:automationRunDetail.instructions")}</h3>
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
