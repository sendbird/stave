import { Badge } from "@/components/ui";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  resolveTrackerLabelColor,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerTask } from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { TRACKER_SOURCE_LABELS, TRACKER_PRIORITY_ICONS } from "./tracker-task-ui";

function MetaField(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {props.label}
      </dt>
      <dd className="mt-0.5 truncate text-[11px] text-foreground">
        {props.children}
      </dd>
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
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <MetaField label="Status">
          <Badge
            variant="outline"
            className={cn("text-[10px]", status.toneClassName)}
          >
            {/* The raw status is what the tracker actually shows, so it wins
                over the normalized label the list groups by. */}
            {task.status.raw || status.label}
          </Badge>
        </MetaField>
        <MetaField label="Priority">
          <span
            className={cn("inline-flex items-center gap-1", priority.toneClassName)}
          >
            <PriorityIcon className="size-3.5" aria-hidden="true" />
            {task.priority.raw ?? priority.label}
          </span>
        </MetaField>
        <MetaField label="Assignee">
          {task.assignee?.name ?? "Unassigned"}
        </MetaField>
        <MetaField label="Due">{due?.label ?? "No due date"}</MetaField>
        <MetaField label="Source">
          <span className="inline-flex items-center gap-1">
            <ServiceLinkIcon
              kind={task.source === "crane" ? "crane" : "jira"}
              className="text-[11px]"
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
        <div className="flex flex-wrap gap-1">
          {task.labels.map((label) => {
            const color = resolveTrackerLabelColor(label.color);
            return (
              <span
                key={label.name}
                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground"
              >
                {color === null ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      color.kind === "token" && color.className,
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
