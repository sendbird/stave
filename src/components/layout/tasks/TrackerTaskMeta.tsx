import {
  trackerVisualStyles,
  priorityToneStyles,
  labelColorStyles,
} from "./tracker-visual.styles";
import { Badge } from "../../ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  resolveTrackerLabelColor,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerTask } from "@/lib/tracker-tasks/types";
import {
  TRACKER_SOURCE_LABELS,
  TRACKER_PRIORITY_ICONS,
} from "./tracker-task-ui";
import { taskLayoutStyles } from "./tasks-layout.stylex";

function MetaField(props: { label: string; children: React.ReactNode }) {
  return (
    <div className={sx(taskLayoutStyles.metaField)}>
      <dt className={sx(taskLayoutStyles.metaLabel)}>{props.label}</dt>
      <dd className={sx(taskLayoutStyles.metaValue)}>{props.children}</dd>
    </div>
  );
}

/** The fixed facts about a ticket, in a two-column grid above the description. */
export function TrackerTaskMeta(props: { task: TrackerTask; now: Date }) {
  const { task } = props;
  const status = TRACKER_STATUS_PRESENTATION[task.status.category];
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
  const PriorityIcon = TRACKER_PRIORITY_ICONS[priority.iconName];
  const due = formatTrackerDue(task.dueDate, props.now);

  return (
    <div className={sx(taskLayoutStyles.meta)}>
      <dl className={sx(taskLayoutStyles.metaGrid)}>
        <MetaField label="Status">
          <Badge variant="outline" tone={status.tone}>
            {/* The raw status is what the tracker actually shows, so it wins
                over the normalized label the list groups by. */}
            {task.status.raw || status.label}
          </Badge>
        </MetaField>
        <MetaField label="Priority">
          <span
            className={sx(
              taskLayoutStyles.metaInline,
              priorityToneStyles[priority.tone],
            )}
          >
            <PriorityIcon
              className={sx(trackerVisualStyles.icon)}
              aria-hidden="true"
            />
            {task.priority.raw ?? priority.label}
          </span>
        </MetaField>
        <MetaField label="Assignee">
          {task.assignee?.name ?? "Unassigned"}
        </MetaField>
        <MetaField label="Due">{due?.label ?? "No due date"}</MetaField>
        <MetaField label="Source">
          <span className={sx(taskLayoutStyles.metaInline)}>
            <ServiceLinkIcon
              kind={task.source === "crane" ? "crane" : "jira"}
              className={sx(trackerVisualStyles.icon)}
            />
            {TRACKER_SOURCE_LABELS[task.source]} {task.key}
          </span>
        </MetaField>
        <MetaField label={task.project ? "Project" : "Team"}>
          {task.project?.name ?? task.team?.name ?? "None"}
        </MetaField>
        {task.issueType ? (
          <MetaField label="Type">{task.issueType}</MetaField>
        ) : null}
        {task.effort === null ? null : (
          <MetaField label="Estimate">{task.effort}</MetaField>
        )}
        {task.parentKey ? (
          <MetaField label="Parent">{task.parentKey}</MetaField>
        ) : null}
        {task.subtasks ? (
          <MetaField label="Subtasks">
            {task.subtasks.done} / {task.subtasks.count} done
          </MetaField>
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
