import { useEffect, useState } from "react";
import { CalendarClock, GitPullRequest, Ticket } from "lucide-react";
import { Select } from "@/components/ads/components/Select";
import { Switch } from "@/components/ads/components/Switch";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import { PROJECT_SCHEDULES, type ProjectSchedule, type ProjectTriggers } from "@/lib/projects/domain";
import { SCHEDULE_LABELS } from "@/lib/projects/policy";
import { projectStyles as styles } from "./projects.styles";

/** How many start conditions are on, for the tab and the header. */
export function countActiveTriggers(triggers: ProjectTriggers): number {
  return Number(triggers.issueAssigned) + Number(triggers.pullRequestFeedback) + Number(triggers.schedule !== "off");
}

/** "New issues · PR feedback · Weekdays at 09:00", or null when nothing is watched. */
export function describeTriggers(triggers: ProjectTriggers): string | null {
  const parts = [
    triggers.issueAssigned ? (triggers.issueFilter ? `Issues matching “${triggers.issueFilter}”` : "New issues") : null,
    triggers.pullRequestFeedback ? "PR feedback" : null,
    triggers.schedule !== "off" ? SCHEDULE_LABELS[triggers.schedule] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function TriggerRow(props: {
  icon: typeof Ticket;
  label: string;
  hint: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <li className={sx(styles.settingRow, styles.triggerRow)}>
      <span className={sx(styles.triggerIcon)}>
        <Icon aria-hidden className={sx(styles.icon)} />
      </span>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)}>{props.label}</span>
        <span className={sx(styles.settingHint)}>{props.hint}</span>
        {props.children}
      </span>
      {props.control}
    </li>
  );
}

/**
 * Starts when: what wakes the coordinator besides its own missions. Each only
 * wakes it; the coordinator decides whether a mission follows.
 */
export function ProjectStartsWhen(props: { triggers: ProjectTriggers; onChange: (triggers: ProjectTriggers) => void }) {
  const { triggers } = props;
  const [filter, setFilter] = useState(triggers.issueFilter);
  useEffect(() => setFilter(triggers.issueFilter), [triggers.issueFilter]);
  const update = (patch: Partial<ProjectTriggers>) => props.onChange({ ...triggers, ...patch });
  const commitFilter = () => {
    if (filter.trim() !== triggers.issueFilter) update({ issueFilter: filter.trim() });
  };
  return (
    <div className={sx(styles.tabStack)}>
      <p className={sx(styles.settingHint)}>
        Each wakes the coordinator, which decides whether a mission follows.
        {" "}With Ask before starting on, you still approve every mission.
      </p>
      <ul className={sx(styles.rows)}>
        <TriggerRow
          icon={Ticket}
          label="An issue is assigned to me"
          hint="From Issues (Crane or Jira). Issues assigned before you turn this on are left alone."
          control={
            <Switch
              aria-label="Wake on newly assigned issues"
              checked={triggers.issueAssigned}
              onCheckedChange={(checked) => update({ issueAssigned: checked })}
            />
          }
        >
          {triggers.issueAssigned ? (
            <span className={sx(styles.triggerField)}>
              <TextField
                size="sm"
                label="Only issues matching"
                placeholder="A label, project or key — empty for every issue"
                value={filter}
                maxLength={80}
                onChange={(event) => setFilter(event.target.value)}
                onBlur={commitFilter}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitFilter();
                }}
              />
            </span>
          ) : null}
        </TriggerRow>
        <TriggerRow
          icon={GitPullRequest}
          label="A mission's pull request gets feedback"
          hint="Failing checks, requested changes or a merge on a PR one of this project's missions opened. Checked every few minutes."
          control={
            <Switch
              aria-label="Wake on pull request feedback"
              checked={triggers.pullRequestFeedback}
              onCheckedChange={(checked) => update({ pullRequestFeedback: checked })}
            />
          }
        />
        <TriggerRow
          icon={CalendarClock}
          label="Scheduled check-in"
          hint="The coordinator reviews where the project stands and plans the next step, in this computer's time."
          control={
            <span className={sx(styles.triggerSelect)}>
              <Select
                size="sm"
                aria-label="Scheduled check-in"
                value={triggers.schedule}
                options={PROJECT_SCHEDULES.map((schedule) => ({ value: schedule, label: SCHEDULE_LABELS[schedule] }))}
                onValueChange={(value) => update({ schedule: value as ProjectSchedule })}
              />
            </span>
          }
        />
      </ul>
    </div>
  );
}
