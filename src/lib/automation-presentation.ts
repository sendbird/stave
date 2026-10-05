/**
 * How automations and their schedules read on screen, in the display language.
 *
 * Renderer-only: it formats through `@/i18n/format`, so it stays out of
 * `./automations`, which the Electron main process imports for its schemas and
 * scheduling math.
 */
import { i18n, type TFunction, type I18nKey } from "@/i18n/runtime";
import { formatDate, formatList, formatTime } from "@/i18n/format";
import {
  AUTOMATION_SCHEDULE_ISSUE_MESSAGES,
  AUTOMATION_WEEKEND_WEEKDAYS,
  AUTOMATION_WORKWEEK_WEEKDAYS,
  automationTrustPolicyToPermissionMode,
  getAutomationScheduleWeekdays,
  isAutomationWeekdaySet,
  type AutomationCadencePreset,
  type AutomationPermissionMode,
  type AutomationRuntimeConfig,
  type AutomationSchedule,
  type AutomationScheduleIssueId,
  type AutomationScheduleTime,
  type AutomationScheduleUnit,
  type AutomationTrustPolicy,
} from "./automations";

/** 2024-01-07 is a Sunday, so day `n` of that week is weekday `n`. */
function weekdayDate(weekday: number) {
  return new Date(2024, 0, 7 + weekday);
}

/** Localized weekday name: `Mon` / `월` (short), `Monday` / `월요일` (long). */
export function formatAutomationWeekday(
  weekday: number,
  style: "short" | "long" = "short",
) {
  return formatDate(weekdayDate(weekday), { weekday: style });
}

/** Wall-clock time of a schedule anchor, 24-hour like the time input: `09:00`. */
export function formatAutomationScheduleClock(at: AutomationScheduleTime) {
  return formatTime(new Date(2024, 0, 1, at.hour, at.minute), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function formatWeekdayList(weekdays: readonly number[]) {
  return formatList(
    weekdays.map((weekday) => formatAutomationWeekday(weekday)),
    { type: "unit", style: "short" },
  );
}

type ScheduleShape =
  | "minutes"
  | "hours"
  | "days"
  | "daysAt"
  | "weeks"
  | "weeksAt"
  | "weeksOn"
  | "weeksOnAt";

/** "Every {{count}} days at {{time}}"; plural on `count`. */
const EVERY_KEYS = {
  minutes: "automation:scheduleText.every.minutes",
  hours: "automation:scheduleText.every.hours",
  days: "automation:scheduleText.every.days",
  daysAt: "automation:scheduleText.every.daysAt",
  weeks: "automation:scheduleText.every.weeks",
  weeksAt: "automation:scheduleText.every.weeksAt",
  weeksOn: "automation:scheduleText.every.weeksOn",
  weeksOnAt: "automation:scheduleText.every.weeksOnAt",
} as const satisfies Record<ScheduleShape, I18nKey>;

/** The same sentences for a period of one, without the count: "Every day at {{time}}". */
const EVERY_ONE_KEYS = {
  minutes: "automation:scheduleText.everyOne.minutes",
  hours: "automation:scheduleText.everyOne.hours",
  days: "automation:scheduleText.everyOne.days",
  daysAt: "automation:scheduleText.everyOne.daysAt",
  weeks: "automation:scheduleText.everyOne.weeks",
  weeksAt: "automation:scheduleText.everyOne.weeksAt",
  weeksOn: "automation:scheduleText.everyOne.weeksOn",
  weeksOnAt: "automation:scheduleText.everyOne.weeksOnAt",
} as const satisfies Record<ScheduleShape, I18nKey>;

type WeekdaySet = "everyDay" | "workweek" | "weekend";

const WEEKDAY_SET_KEYS = {
  everyDay: {
    plain: "automation:scheduleText.sets.everyDay",
    at: "automation:scheduleText.sets.everyDayAt",
    name: "automation:scheduleText.setNames.everyDay",
  },
  workweek: {
    plain: "automation:scheduleText.sets.workweek",
    at: "automation:scheduleText.sets.workweekAt",
    name: "automation:scheduleText.setNames.workweek",
  },
  weekend: {
    plain: "automation:scheduleText.sets.weekend",
    at: "automation:scheduleText.sets.weekendAt",
    name: "automation:scheduleText.setNames.weekend",
  },
} as const satisfies Record<WeekdaySet, Record<"plain" | "at" | "name", I18nKey>>;

function weekdaySetOf(weekdays: readonly number[]): WeekdaySet | null {
  if (weekdays.length === 7) return "everyDay";
  if (isAutomationWeekdaySet(weekdays, AUTOMATION_WORKWEEK_WEEKDAYS)) return "workweek";
  if (isAutomationWeekdaySet(weekdays, AUTOMATION_WEEKEND_WEEKDAYS)) return "weekend";
  return null;
}

function shapeOf(
  unit: AutomationScheduleUnit,
  hasDays: boolean,
  hasTime: boolean,
): ScheduleShape {
  if (unit === "minutes" || unit === "hours") return unit;
  if (unit === "days") return hasTime ? "daysAt" : "days";
  if (hasDays) return hasTime ? "weeksOnAt" : "weeksOn";
  return hasTime ? "weeksAt" : "weeks";
}

/**
 * One sentence for a schedule: "Every 2 weeks on Mon, Wed at 09:00",
 * "Every weekday at 09:00". `compact` drops a count of one ("Every hour"
 * instead of "Every 1 hour") for list rows.
 */
export function formatAutomationSchedule(
  schedule: AutomationSchedule,
  t: TFunction<["automation"]> = i18n.getFixedT(null, ["automation"]),
  options: { compact?: boolean } = {},
): string {
  const time =
    schedule.at && (schedule.unit === "days" || schedule.unit === "weeks")
      ? formatAutomationScheduleClock(schedule.at)
      : null;

  // Multi-weekday week schedules read better as "Every weekday at 09:00" than
  // as "Every 1 week on Mon, Tue, Wed, Thu, Fri at 09:00".
  if (schedule.unit === "weeks" && schedule.weekdays?.length) {
    const weekdays = getAutomationScheduleWeekdays(schedule);
    const set = weekdaySetOf(weekdays);
    if (schedule.every === 1) {
      if (set) {
        return time
          ? t(WEEKDAY_SET_KEYS[set].at, { time })
          : t(WEEKDAY_SET_KEYS[set].plain);
      }
      const days = formatWeekdayList(weekdays);
      return time
        ? t(EVERY_ONE_KEYS.weeksOnAt, { days, time })
        : t(EVERY_ONE_KEYS.weeksOn, { days });
    }
    const days = set ? t(WEEKDAY_SET_KEYS[set].name) : formatWeekdayList(weekdays);
    return time
      ? t(EVERY_KEYS.weeksOnAt, { count: schedule.every, days, time })
      : t(EVERY_KEYS.weeksOn, { count: schedule.every, days });
  }

  const days =
    schedule.unit === "weeks" && schedule.weekday !== undefined
      ? formatAutomationWeekday(schedule.weekday)
      : null;
  const shape = shapeOf(schedule.unit, days !== null, time !== null);
  const values = { ...(days ? { days } : {}), ...(time ? { time } : {}) };
  return options.compact && schedule.every === 1
    ? t(EVERY_ONE_KEYS[shape], values)
    : t(EVERY_KEYS[shape], { ...values, count: schedule.every });
}

const CADENCE_PRESET_KEYS = {
  manual: {
    labelKey: "automation:editor.cadence.presets.manual.label",
    detailKey: "automation:editor.cadence.presets.manual.detail",
  },
  "every-15-minutes": {
    labelKey: "automation:editor.cadence.presets.every15Minutes.label",
    detailKey: "automation:editor.cadence.presets.every15Minutes.detail",
  },
  hourly: {
    labelKey: "automation:editor.cadence.presets.hourly.label",
    detailKey: "automation:editor.cadence.presets.hourly.detail",
  },
  daily: {
    labelKey: "automation:editor.cadence.presets.daily.label",
    detailKey: "automation:editor.cadence.presets.daily.detail",
  },
  weekdays: {
    labelKey: "automation:editor.cadence.presets.weekdays.label",
    detailKey: "automation:editor.cadence.presets.weekdays.detail",
  },
  weekends: {
    labelKey: "automation:editor.cadence.presets.weekends.label",
    detailKey: "automation:editor.cadence.presets.weekends.detail",
  },
  weekly: {
    labelKey: "automation:editor.cadence.presets.weekly.label",
    detailKey: "automation:editor.cadence.presets.weekly.detail",
  },
  custom: {
    labelKey: "automation:editor.cadence.presets.custom.label",
    detailKey: "automation:editor.cadence.presets.custom.detail",
  },
} as const satisfies Record<
  AutomationCadencePreset,
  { labelKey: I18nKey; detailKey: I18nKey }
>;

export function getAutomationCadencePresetKeys(preset: AutomationCadencePreset) {
  return CADENCE_PRESET_KEYS[preset];
}

const PERMISSION_MODE_KEYS = {
  auto: {
    labelKey: "automation:editor.permissions.modes.auto.label",
    summaryKey: "automation:editor.permissions.modes.auto.summary",
    descriptionKey: "automation:editor.permissions.modes.auto.description",
  },
  guided: {
    labelKey: "automation:editor.permissions.modes.guided.label",
    summaryKey: "automation:editor.permissions.modes.guided.summary",
    descriptionKey: "automation:editor.permissions.modes.guided.description",
  },
  manual: {
    labelKey: "automation:editor.permissions.modes.manual.label",
    summaryKey: "automation:editor.permissions.modes.manual.summary",
    descriptionKey: "automation:editor.permissions.modes.manual.description",
  },
} as const satisfies Record<
  AutomationPermissionMode,
  { labelKey: I18nKey; summaryKey: I18nKey; descriptionKey: I18nKey }
>;

export function getAutomationPermissionModeKeys(mode: AutomationPermissionMode) {
  return PERMISSION_MODE_KEYS[mode];
}

/** The permission mode name a trust policy is shown as: "Guided". */
export function getAutomationTrustPolicyLabelKey(policy: AutomationTrustPolicy) {
  return PERMISSION_MODE_KEYS[automationTrustPolicyToPermissionMode(policy)].labelKey;
}

/**
 * The effective provider permissions as one line. Option values stay as the
 * provider names them (`workspace-write`), since they mirror the settings.
 */
export function formatAutomationRuntimePermissions(
  runtime: AutomationRuntimeConfig,
  t: TFunction<["automation"]> = i18n.getFixedT(null, ["automation"]),
): string {
  const onOff = (value: boolean) =>
    t(
      value
        ? "automation:editor.permissions.summary.on"
        : "automation:editor.permissions.summary.off",
    );
  if (runtime.provider === "codex") {
    return t("automation:editor.permissions.summary.codex", {
      approvals: runtime.approvalPolicy,
      files: runtime.fileAccess,
      network: onOff(runtime.networkAccess),
      web: runtime.webSearch,
    });
  }
  return t("automation:editor.permissions.summary.claude", {
    mode: runtime.permissionMode,
    sandbox: onOff(runtime.sandboxEnabled),
    unsandboxed: onOff(runtime.allowUnsandboxedCommands),
    skipPrompts: onOff(runtime.allowDangerouslySkipPermissions),
  });
}

const SCHEDULE_ISSUE_KEYS = {
  timeNeedsDayOrWeek: "automation:validation.schedule.timeNeedsDayOrWeek",
  weekdayNeedsWeek: "automation:validation.schedule.weekdayNeedsWeek",
  weekdayNeedsTime: "automation:validation.schedule.weekdayNeedsTime",
  weekdaysNeedWeek: "automation:validation.schedule.weekdaysNeedWeek",
  weekdaysNeedTime: "automation:validation.schedule.weekdaysNeedTime",
  weekdaysUnique: "automation:validation.schedule.weekdaysUnique",
  weekdayOrWeekdays: "automation:validation.schedule.weekdayOrWeekdays",
} as const satisfies Record<AutomationScheduleIssueId, I18nKey>;

const SCHEDULE_ISSUE_ID_BY_MESSAGE = new Map<string, AutomationScheduleIssueId>(
  (Object.keys(AUTOMATION_SCHEDULE_ISSUE_MESSAGES) as AutomationScheduleIssueId[]).map(
    (id) => [AUTOMATION_SCHEDULE_ISSUE_MESSAGES[id], id],
  ),
);

/** A translated sentence for a schedule rule the draft broke, or null for any other issue. */
export function describeAutomationScheduleIssue(
  issue: { message: string },
  t: TFunction<["automation"]> = i18n.getFixedT(null, ["automation"]),
): string | null {
  const id = SCHEDULE_ISSUE_ID_BY_MESSAGE.get(issue.message);
  return id ? t(SCHEDULE_ISSUE_KEYS[id]) : null;
}

/** The toast for an automation draft that does not validate. */
export function describeAutomationDraftIssue(
  issue: { message: string; path: readonly PropertyKey[] } | undefined,
  t: TFunction<["automation"]> = i18n.getFixedT(null, ["automation"]),
): string {
  if (!issue) return t("automation:validation.invalid");
  const schedule = describeAutomationScheduleIssue(issue, t);
  if (schedule) return schedule;
  switch (issue.path[0]) {
    case "name":
      return t("automation:validation.name");
    case "prompt":
      return t("automation:validation.instructions");
    case "environment":
      return t("automation:validation.repository");
    default:
      return t("automation:validation.invalidWithDetail", { detail: issue.message });
  }
}

export function formatAutomationTrustPolicy(policy: AutomationTrustPolicy): string {
  return i18n.t(getAutomationTrustPolicyLabelKey(policy));
}
