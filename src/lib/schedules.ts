/**
 * Check-in schedules shared by projects and playbooks: when a scheduled
 * wake is due, in the host's local time.
 */
export const SCHEDULES = ["off", "daily", "weekdays", "weekly", "every-4h"] as const;
export type Schedule = (typeof SCHEDULES)[number];

const SCHEDULE_HOUR = 9;

/**
 * The latest scheduled check-in at or before `now`, in the host's local time,
 * or null when the schedule is off. `daily` and `weekdays` are 09:00, `weekly`
 * is Monday 09:00, `every-4h` is 00:00, 04:00 and so on.
 */
export function latestScheduleSlot(schedule: Schedule, now: Date): Date | null {
  if (schedule === "off") return null;
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  if (schedule === "every-4h") {
    slot.setMinutes(0);
    slot.setHours(Math.floor(slot.getHours() / 4) * 4);
    return slot;
  }
  slot.setHours(SCHEDULE_HOUR, 0);
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1);
  const fits = (day: number) => (schedule === "daily" ? true : schedule === "weekdays" ? day >= 1 && day <= 5 : day === 1);
  for (let guard = 0; guard < 7 && !fits(slot.getDay()); guard += 1) slot.setDate(slot.getDate() - 1);
  return slot;
}

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  off: "Off",
  daily: "Every day at 09:00",
  weekdays: "Weekdays at 09:00",
  weekly: "Mondays at 09:00",
  "every-4h": "Every 4 hours",
};
