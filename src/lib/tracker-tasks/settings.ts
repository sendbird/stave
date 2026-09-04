import { z } from "zod";

import {
  TRACKER_TASK_VIEWS,
  type TrackerTaskView,
} from "@/lib/tracker-tasks/filter";
import {
  TRACKER_SOURCE_IDS,
  TRACKER_TASK_START_MODES,
  type TrackerSourceId,
  type TrackerTaskStartMode,
} from "@/lib/tracker-tasks/types";

/**
 * A minute is the floor because every refresh is a round trip to an external
 * tracker, and an hour is the ceiling because past that the list is stale
 * enough that the manual refresh is the honest answer.
 */
export const MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS = 60;
export const MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS = 3_600;
export const DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS = 300;

const DefaultViewSchema = z.enum(TRACKER_TASK_VIEWS);

const RefreshIntervalSecondsSchema = z
  .number()
  .int()
  .min(MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS)
  .max(MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS)
  .default(DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS);

const DefaultKickoffStartModeSchema = z.enum(TRACKER_TASK_START_MODES);

export const DEFAULT_TRACKER_SOURCE_ENABLED = Object.freeze({
  jira: true,
  crane: true,
}) satisfies Record<TrackerSourceId, boolean>;

const SourceEnabledSchema = z
  .object({
    jira: z.boolean(),
    crane: z.boolean(),
  })
  .strict()
  .default({ ...DEFAULT_TRACKER_SOURCE_ENABLED });

export const TrackerTasksSettingsSchema = z
  .object({
    defaultView: DefaultViewSchema,
    refreshIntervalSeconds: RefreshIntervalSecondsSchema,
    /**
     * Whether kickoff runs immediately or drops a prompt into the composer.
     * Staging is the safer default only for people who edit the prompt first,
     * so it stays a setting rather than a guess.
     */
    defaultKickoffStartMode: DefaultKickoffStartModeSchema,
    /**
     * Whether Tasks reads this tracker. Independent of the connector: turning
     * Crane off here leaves pairing and dispatched jobs alone.
     */
    sourceEnabled: SourceEnabledSchema,
  })
  .strict();

export type TrackerTasksSettings = z.infer<typeof TrackerTasksSettingsSchema>;

export const DEFAULT_TRACKER_TASKS_SETTINGS = Object.freeze({
  defaultView: "assigned-open" as TrackerTaskView,
  refreshIntervalSeconds: DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  defaultKickoffStartMode: "run" as TrackerTaskStartMode,
  sourceEnabled: { ...DEFAULT_TRACKER_SOURCE_ENABLED },
}) satisfies TrackerTasksSettings;

/**
 * Read persisted settings without letting one bad field reset the rest.
 *
 * Whole-object `safeParse` is tried first because it is the common case. When
 * it fails, each field falls back on its own: a `refreshIntervalSeconds` that a
 * newer build wrote outside this build's range must not also throw away the
 * default view and kickoff mode the user chose, which is exactly what a single
 * `?? DEFAULTS` would do.
 */
export function normalizeTrackerTasksSettings(
  value: unknown,
): TrackerTasksSettings {
  const parsed = TrackerTasksSettingsSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const defaultView = DefaultViewSchema.safeParse(record.defaultView);
  const refreshIntervalSeconds = RefreshIntervalSecondsSchema.safeParse(
    record.refreshIntervalSeconds,
  );
  const defaultKickoffStartMode = DefaultKickoffStartModeSchema.safeParse(
    record.defaultKickoffStartMode,
  );
  const sourceEnabledRecord =
    record.sourceEnabled &&
    typeof record.sourceEnabled === "object" &&
    !Array.isArray(record.sourceEnabled)
      ? (record.sourceEnabled as Record<string, unknown>)
      : {};
  const sourceEnabled = Object.fromEntries(
    TRACKER_SOURCE_IDS.map((source) => {
      const parsed = z.boolean().safeParse(sourceEnabledRecord[source]);
      return [
        source,
        parsed.success
          ? parsed.data
          : DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled[source],
      ];
    }),
  ) as Record<TrackerSourceId, boolean>;

  return {
    defaultView: defaultView.success
      ? defaultView.data
      : DEFAULT_TRACKER_TASKS_SETTINGS.defaultView,
    refreshIntervalSeconds: refreshIntervalSeconds.success
      ? refreshIntervalSeconds.data
      : DEFAULT_TRACKER_TASKS_SETTINGS.refreshIntervalSeconds,
    defaultKickoffStartMode: defaultKickoffStartMode.success
      ? defaultKickoffStartMode.data
      : DEFAULT_TRACKER_TASKS_SETTINGS.defaultKickoffStartMode,
    sourceEnabled,
  };
}
