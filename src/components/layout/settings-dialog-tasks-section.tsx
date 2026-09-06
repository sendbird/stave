import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/components/ui";
import { useTrackerSourceStatuses } from "@/lib/tracker-tasks/client-state";
import { TRACKER_TASK_VIEWS } from "@/lib/tracker-tasks/filter";
import { describeTrackerSources } from "@/lib/tracker-tasks/source-status";
import {
  DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
} from "@/lib/tracker-tasks/settings";
import {
  TRACKER_SOURCE_IDS,
  TRACKER_TASK_START_MODES,
} from "@/lib/tracker-tasks/types";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { TRACKER_SOURCE_LABELS } from "@/lib/tracker-tasks/context";
import { sx } from "@/components/ads/utils/stylex";
import { tasksSectionStyles as styles } from "./settings-dialog-tasks-section.styles";

const VIEW_LABELS: Record<(typeof TRACKER_TASK_VIEWS)[number], string> = {
  "assigned-open": "Assigned to me",
  "all-open": "All open",
  "recently-done": "Recently done",
  "in-stave": "Already in Stave",
};

const START_MODE_LABELS: Record<
  (typeof TRACKER_TASK_START_MODES)[number],
  string
> = {
  run: "Start the run immediately",
  stage: "Stage the prompt in the composer",
};

const HINT = sx(styles.hint);

function describeInterval(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function TrackerTasksSettingsSection() {
  const tasks = useAppStore((state) => state.settings.trackerTasks);
  const updateSettings = useAppStore((state) => state.updateSettings);
  // Live status rather than the enabled switches: a connector turned on but
  // never given a credential used to render as an enabled source next to a
  // permanently empty list, with nothing naming the missing credential.
  const syncBySource = useTrackerSourceStatuses();
  const summaries = useMemo(
    () => describeTrackerSources(syncBySource),
    [syncBySource],
  );

  // The interval box is edited as free text, so it keeps its own draft and
  // clamps on blur: clamping per keystroke would rewrite "6" into "60" before
  // the second digit arrives.
  const [intervalDraft, setIntervalDraft] = useState(
    String(tasks.refreshIntervalSeconds),
  );
  useEffect(() => {
    setIntervalDraft(String(tasks.refreshIntervalSeconds));
  }, [tasks.refreshIntervalSeconds]);

  const save = (patch: Partial<typeof tasks>) => {
    updateSettings({ patch: { trackerTasks: { ...tasks, ...patch } } });
  };

  const commitInterval = () => {
    const parsed = Number.parseInt(intervalDraft.trim(), 10);
    const next = Number.isFinite(parsed)
      ? Math.min(
          Math.max(parsed, MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS),
          MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
        )
      : DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS;
    setIntervalDraft(String(next));
    save({ refreshIntervalSeconds: next });
  };

  return (
    <div
      id="settings-field-tracker-tasks"
      tabIndex={-1}
      className={sx(styles.card)}
    >
      <div className={sx(styles.cardHeader)}>
        <h3 className={sx(styles.cardTitle)}>Tasks</h3>
        <p className={sx(styles.hintSpaced)}>
          The ticket list opens on Assigned to me, with no extra filters. Chips
          you pick narrow that list; Reset clears the chips and keeps the tab.
        </p>
      </div>

      <div className={sx(styles.cardBody)}>
        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-default-view"
            className={sx(styles.fieldLabel)}
          >
            Default view
          </label>
          <Select
            value={tasks.defaultView}
            onValueChange={(value) =>
              save({ defaultView: value as typeof tasks.defaultView })
            }
          >
            <SelectTrigger
              id="settings-tasks-default-view"
              className={sx(styles.triggerWide)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_TASK_VIEWS.map((view) => (
                <SelectItem key={view} value={view}>
                  {VIEW_LABELS[view]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={HINT}>
            First tab when you open Tasks. Assigned to me is the default. Filter
            chips start empty, so you see every ticket in that tab until you
            pick one.
          </p>
        </div>

        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-refresh-interval"
            className={sx(styles.fieldLabel)}
          >
            Refresh interval (seconds)
          </label>
          <Input
            id="settings-tasks-refresh-interval"
            type="number"
            inputMode="numeric"
            xstyle={styles.intervalInput}
            min={MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS}
            max={MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS}
            step={30}
            value={intervalDraft}
            onChange={(event) => setIntervalDraft(event.target.value)}
            onBlur={commitInterval}
          />
          <p className={HINT}>
            Currently {describeInterval(tasks.refreshIntervalSeconds)}. Each
            refresh is one request per connected tracker, so a short interval
            spends rate limit you may want for your own work. Accepted range is{" "}
            {MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS}–
            {MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS} seconds; anything else
            is clamped.
          </p>
        </div>

        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-start-mode"
            className={sx(styles.fieldLabel)}
          >
            When a ticket starts work
          </label>
          <Select
            value={tasks.defaultKickoffStartMode}
            onValueChange={(value) =>
              save({
                defaultKickoffStartMode:
                  value as typeof tasks.defaultKickoffStartMode,
              })
            }
          >
            <SelectTrigger
              id="settings-tasks-start-mode"
              className={sx(styles.triggerWide)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_TASK_START_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {START_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={HINT}>
            Staging leaves the generated prompt in the composer so you can edit
            it before the first turn.
          </p>
        </div>

        <div className={sx(styles.sourcesCard)}>
          <div>
            <h4 className={sx(styles.sourcesTitle)}>Sources</h4>
            <p className={sx(styles.hintSpaced)}>
              Choose which trackers Tasks reads. Pairing and credentials stay
              under Settings → Integrations. Jira is first in the list; Crane
              follows.
            </p>
          </div>
          <ul className={sx(styles.sourceList)}>
            {TRACKER_SOURCE_IDS.map((source) => {
              const summary = summaries.find(
                (entry) => entry.source === source,
              );
              const enabled = tasks.sourceEnabled[source];
              return (
                <li key={source} className={sx(styles.sourceRow)}>
                  <div className={sx(styles.sourceMain)}>
                    <div className={sx(styles.sourceHead)}>
                      <label
                        htmlFor={`settings-tasks-source-${source}`}
                        className={sx(styles.sourceLabel)}
                      >
                        {TRACKER_SOURCE_LABELS[source]}
                      </label>
                      {summary ? (
                        <Badge
                          variant={
                            summary.condition === "producing" ||
                            summary.condition === "syncing"
                              ? "success"
                              : summary.condition === "error"
                                ? "destructive"
                                : "outline"
                          }
                          className={sx(styles.sourceBadge)}
                        >
                          {summary.headline}
                        </Badge>
                      ) : null}
                    </div>
                    <p className={sx(styles.hintTight)}>
                      {enabled
                        ? (summary?.detail ?? "Used in the Tasks list.")
                        : "Hidden from Tasks. Pairing and credentials are unchanged."}
                    </p>
                  </div>
                  <div className={sx(styles.sourceActions)}>
                    {summary?.fixInSettings ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        xstyle={styles.setUpButton}
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                              detail: { section: "integrations" },
                            }),
                          );
                        }}
                      >
                        Set up
                      </Button>
                    ) : null}
                    <Switch
                      id={`settings-tasks-source-${source}`}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        save({
                          sourceEnabled: {
                            ...tasks.sourceEnabled,
                            [source]: checked,
                          },
                        })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="xs"
            variant="link"
            xstyle={styles.openIntegrations}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                  detail: { section: "integrations" },
                }),
              );
            }}
          >
            Open Settings → Integrations
          </Button>
        </div>
      </div>
    </div>
  );
}
