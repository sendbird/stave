import * as stylex from "@stylexjs/stylex";
import { CalendarClock, GitPullRequest, Rocket, Ticket, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Select } from "@/components/ads/components/Select";
import { Switch } from "@/components/ads/components/Switch";
import { TextField } from "@/components/ads/components/TextField";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { playbookCanAutoStart, type Playbook } from "@/lib/playbooks/schema";
import { applyStartsWhen, type StartsWhenPatch } from "@/lib/playbooks/starts-when";
import { SCHEDULE_LABELS, SCHEDULES, type Schedule } from "@/lib/schedules";

function ConditionRow(props: {
  icon: LucideIcon;
  label: string;
  hint: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <li className={sx(styles.row)}>
      <span className={sx(styles.rowIcon)}>
        <Icon aria-hidden className={sx(styles.icon)} />
      </span>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)}>{props.label}</span>
        <span className={sx(styles.hint)}>{props.hint}</span>
        {props.children}
      </span>
      <span className={sx(styles.control)}>{props.control}</span>
    </li>
  );
}

/**
 * Starts when: what proposes a mission with this playbook — an assigned
 * issue, a pull request in trouble, a schedule — waiting in Issues →
 * Proposed, or starting on its own where that is safe.
 */
export function PlaybookStartsWhen(props: {
  draft: Playbook;
  /** Where a schedule runs when it is turned on: the workspace in view. */
  workspace: { id: string; name: string } | null;
  onChange: (draft: Playbook) => void;
  now?: () => Date;
}) {
  const { draft, workspace } = props;
  const startsWhen = draft.startsWhen ?? {};
  const now = props.now ?? (() => new Date());
  const update = (patch: StartsWhenPatch) => props.onChange(applyStartsWhen(draft, patch, now()));
  const canAutoStart = playbookCanAutoStart(draft);
  const schedule = startsWhen.schedule;
  const pr = startsWhen.pullRequest;
  const offersAutoStart = Boolean(pr || schedule);

  return (
    <div className={sx(styles.stack)}>
      <ul className={sx(styles.rows)}>
        <ConditionRow
          icon={Ticket}
          label="An issue is assigned to me"
          hint="Proposes a mission in Issues → Proposed; you choose the workspace when you kick it off. Issues assigned before you turn this on are left alone."
          control={
            <Switch
              aria-label="Propose a mission for newly assigned issues"
              checked={Boolean(startsWhen.issueAssigned)}
              onCheckedChange={(checked) => update({ issueAssigned: checked ? { filter: "" } : null })}
            />
          }
        >
          {startsWhen.issueAssigned ? (
            <span className={sx(styles.field)}>
              <TextField
                size="sm"
                label="Only issues matching"
                placeholder="A label, project or key — empty for every issue"
                value={startsWhen.issueAssigned.filter}
                maxLength={80}
                onChange={(event) => update({ issueAssigned: { filter: event.target.value } })}
              />
            </span>
          ) : null}
        </ConditionRow>

        <ConditionRow
          icon={GitPullRequest}
          label="A workspace's pull request needs work"
          hint="Proposes a mission in that workspace, once per commit, when it has no other mission."
          control={
            <Switch
              aria-label="Propose a mission when a pull request needs work"
              checked={Boolean(pr)}
              onCheckedChange={(checked) =>
                update({ pullRequest: checked ? { checksFailed: true, changesRequested: true } : null })
              }
            />
          }
        >
          {pr ? (
            <span className={sx(styles.choices)}>
              <Checkbox
                label="Checks fail"
                checked={pr.checksFailed}
                onCheckedChange={(checked) => update({ pullRequest: { ...pr, checksFailed: checked === true } })}
              />
              <Checkbox
                label="Changes are requested"
                checked={pr.changesRequested}
                onCheckedChange={(checked) => update({ pullRequest: { ...pr, changesRequested: checked === true } })}
              />
            </span>
          ) : null}
        </ConditionRow>

        <ConditionRow
          icon={CalendarClock}
          label="On a schedule"
          hint={
            schedule
              ? `Runs in ${schedule.workspaceName || "its workspace"}, in this computer's time.`
              : workspace
                ? `Runs in ${workspace.name}, the workspace in view, in this computer's time.`
                : "Open the workspace it should run in to schedule it."
          }
          control={
            <span className={sx(styles.select)}>
              <Select
                size="sm"
                aria-label="Schedule"
                disabled={!schedule && !workspace}
                value={schedule?.schedule ?? "off"}
                options={SCHEDULES.map((value) => ({ value, label: SCHEDULE_LABELS[value] }))}
                onValueChange={(value) => {
                  const next = value as Schedule;
                  const target = schedule ? { id: schedule.workspaceId, name: schedule.workspaceName } : workspace;
                  if (next === "off" || !target) return update({ schedule: null });
                  update({
                    schedule: { schedule: next, workspaceId: target.id, workspaceName: target.name },
                    // A new schedule runs on its own when it safely can; turn that off below.
                    ...(!schedule && canAutoStart ? { autoStart: true } : {}),
                  });
                }}
              />
            </span>
          }
        >
          {schedule && workspace && workspace.id !== schedule.workspaceId ? (
            <span className={sx(styles.inlineAction)}>
              <Button
                type="button"
                size="xs"
                variant="quiet"
                onClick={() =>
                  update({ schedule: { schedule: schedule.schedule, workspaceId: workspace.id, workspaceName: workspace.name } })
                }
              >
                Run it in {workspace.name} instead
              </Button>
            </span>
          ) : null}
        </ConditionRow>

        {offersAutoStart ? (
          <ConditionRow
            icon={Rocket}
            label="Start on its own"
            hint={
              canAutoStart
                ? "Pull request and scheduled missions start without asking. Nothing outside this machine is allowed: stages that publish still wait for you."
                : "Its first stage publishes, so these missions always wait for you to start them."
            }
            control={
              <Switch
                aria-label="Start on its own"
                disabled={!canAutoStart}
                checked={canAutoStart && Boolean(startsWhen.autoStart)}
                onCheckedChange={(checked) => update({ autoStart: checked })}
              />
            }
          />
        ) : null}
      </ul>
    </div>
  );
}

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], width: "100%" },
  rows: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
  },
  row: {
    display: "grid",
    gridTemplateColumns: "20px minmax(0, 1fr) auto",
    alignItems: "start",
    columnGap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  rowIcon: { display: "flex", justifyContent: "center", paddingTop: 3, color: vars["--ads-color-text-subtle"] },
  icon: { width: 14, height: 14 },
  rowText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  rowTitle: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  hint: { fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-normal"], color: vars["--ads-color-text-muted"] },
  control: { display: "flex", alignItems: "center", minHeight: 22 },
  field: { display: "block", marginTop: vars["--ads-space-8"], maxWidth: "26rem" },
  choices: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-16"], marginTop: vars["--ads-space-8"] },
  select: { display: "block", width: "12rem" },
  inlineAction: { display: "block", marginTop: vars["--ads-space-4"] },
});
