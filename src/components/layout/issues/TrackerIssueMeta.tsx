import { i18n, useTranslation } from "@/i18n";
import {
  trackerVisualStyles,
  priorityToneStyles,
  labelColorStyles,
} from "./tracker-visual.styles";
import { Badge } from "../../ads/components/Badge";
import { PriorityIcon } from "@/components/ads/components/WorkflowIcon";
import { sx } from "@/components/ads/utils/stylex";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  resolveTrackerLabelColor,
} from "@/lib/tracker-issues/presentation";
import type { TrackerIssue } from "@/lib/tracker-issues/types";
import {
  TRACKER_SOURCE_LABELS,
} from "./tracker-issue-ui";
import { taskLayoutStyles } from "./issues-layout.stylex";

function MetaField(props: { label: string; children: React.ReactNode }) {
  return (
    <div className={sx(taskLayoutStyles.metaField)}>
      <dt className={sx(taskLayoutStyles.metaLabel)}>{props.label}</dt>
      <dd className={sx(taskLayoutStyles.metaValue)}>{props.children}</dd>
    </div>
  );
}

/** The fixed facts about a ticket, in a two-column grid above the description. */
export function TrackerIssueMeta(props: { task: TrackerIssue; now: Date }) {
  const { t: tI18n } = useTranslation(["issues"]);
  const { task } = props;
  const status = TRACKER_STATUS_PRESENTATION[task.status.category];
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
  const due = formatTrackerDue(task.dueDate, props.now);

  return (
    <div className={sx(taskLayoutStyles.meta)}>
      <dl className={sx(taskLayoutStyles.metaGrid)}>
        <MetaField label={tI18n("issues:trackerIssueMeta.status")}>
          <Badge variant="outline" tone={status.tone}>
            {/* The raw status is what the tracker actually shows, so it wins
                over the normalized label the list groups by. */}
            {task.status.raw || status.label}
          </Badge>
        </MetaField>
        <MetaField label={tI18n("issues:trackerIssueMeta.priority")}>
          <span
            className={sx(
              taskLayoutStyles.metaInline,
              priorityToneStyles[priority.tone],
            )}
          >
            <PriorityIcon
              xstyle={trackerVisualStyles.icon}
              priority={task.priority.level}
              aria-hidden="true"
            />
            {task.priority.raw ?? priority.label}
          </span>
        </MetaField>
        <MetaField label={tI18n("issues:trackerIssueMeta.assignee")}>
          {task.assignee?.name ?? tI18n("issues:trackerIssueMeta.unassigned")}
        </MetaField>
        <MetaField label={tI18n("issues:trackerIssueMeta.due")}>{due?.label ?? tI18n("issues:trackerIssueMeta.noDueDate")}</MetaField>
        <MetaField label={tI18n("issues:trackerIssueMeta.source")}>
          <span className={sx(taskLayoutStyles.metaInline)}>
            <ServiceLinkIcon
              kind={task.source === "crane" ? "crane" : "jira"}
              className={sx(trackerVisualStyles.icon)}
            />
            {TRACKER_SOURCE_LABELS[task.source]} {task.key}
          </span>
        </MetaField>
        <MetaField label={task.project ? tI18n("issues:trackerIssueMeta.project") : tI18n("issues:trackerIssueMeta.team")}>
          {task.project?.name ?? task.team?.name ?? tI18n("issues:trackerIssueMeta.none")}
        </MetaField>
        {task.issueType ? (
          <MetaField label={tI18n("issues:trackerIssueMeta.type")}>{task.issueType}</MetaField>
        ) : null}
        {task.effort === null ? null : (
          <MetaField label={tI18n("issues:trackerIssueMeta.estimate")}>{task.effort}</MetaField>
        )}
        {task.parentKey ? (
          <MetaField label={tI18n("issues:trackerIssueMeta.parent")}>{task.parentKey}</MetaField>
        ) : null}
        {task.subtasks ? (
          <MetaField label={tI18n("issues:trackerIssueMeta.subtasks")}>
            {tI18n("issues:trackerIssueMeta.subtaskProgress", { completed: task.subtasks.done, total: task.subtasks.count })}</MetaField>
        ) : null}
      </dl>

      {task.labels.length > 0 ? (
        <div className={sx(taskLayoutStyles.metaLabels)}>
          {task.labels.map((label) => {
            const color = resolveTrackerLabelColor(label.color);
            return (
              <span
                key={label.name}
                className={sx(taskLayoutStyles.metaLabelChip)}
              >
                {color === null ? null : (
                  <span
                    aria-hidden="true"
                    className={sx(
                      taskLayoutStyles.labelDot,
                      color.kind === "token" && labelColorStyles[color.token],
                    )}
                    style={
                      color.kind === "css"
                        ? { backgroundColor: color.value }
                        : undefined
                    }
                  />
                )}
                {label.name}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
