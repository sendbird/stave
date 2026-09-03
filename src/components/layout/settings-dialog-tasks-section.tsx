import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { TRACKER_TASK_VIEWS } from "@/lib/tracker-tasks/filter";
import {
  DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
} from "@/lib/tracker-tasks/settings";
import { TRACKER_TASK_START_MODES } from "@/lib/tracker-tasks/types";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

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

const HINT = "text-xs leading-5 text-muted-foreground";

function describeInterval(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function TrackerTasksSettingsSection() {
  const tasks = useAppStore((state) => state.settings.trackerTasks);
  const updateSettings = useAppStore((state) => state.updateSettings);
  // Primitive selectors: the Sources summary only needs the two switches, so
  // subscribing to the connector objects would re-render this card on every
  // unrelated JQL or mapping edit.
  const craneEnabled = useAppStore(
    (state) => state.settings.craneConnector.enabled,
  );
  const jiraEnabled = useAppStore(
    (state) => state.settings.jiraConnector.enabled,
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

  const enabledSources = [
    craneEnabled ? "Crane" : null,
    jiraEnabled ? "Jira" : null,
  ].filter((source): source is string => source !== null);

  return (
    <div
      id="settings-field-tracker-tasks"
      tabIndex={-1}
      className="rounded-xl border border-border bg-card"
    >
      <div className="border-b border-border/70 px-5 py-4">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <p className={`mt-1 ${HINT}`}>
          Defaults for the ticket list: which view opens first, how often it
          refreshes, and what happens when a ticket starts work in Stave.
        </p>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-2">
          <label
            htmlFor="settings-tasks-default-view"
            className="text-xs font-medium"
          >
            Default view
          </label>
          <Select
            value={tasks.defaultView}
            onValueChange={(value) =>
              save({ defaultView: value as typeof tasks.defaultView })
            }
          >
            <SelectTrigger id="settings-tasks-default-view" className="w-64">
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
            The tab the Tasks surface opens on. Filter chips always start clear.
          </p>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="settings-tasks-refresh-interval"
            className="text-xs font-medium"
          >
            Refresh interval (seconds)
          </label>
          <Input
            id="settings-tasks-refresh-interval"
            type="number"
            inputMode="numeric"
            className="w-40"
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

        <div className="grid gap-2">
          <label
            htmlFor="settings-tasks-start-mode"
            className="text-xs font-medium"
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
            <SelectTrigger id="settings-tasks-start-mode" className="w-64">
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

        <div className="space-y-2 rounded-lg border border-border bg-muted/25 p-4">
          <h4 className="text-sm font-medium">Sources</h4>
          {enabledSources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {enabledSources.map((source) => (
                <Badge key={source} variant="secondary">
                  {source}
                </Badge>
              ))}
            </div>
          ) : (
            <p className={HINT}>
              No tracker is enabled, so the list stays empty.
            </p>
          )}
          <Button
            type="button"
            size="xs"
            variant="link"
            className="h-auto px-0 text-xs"
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
