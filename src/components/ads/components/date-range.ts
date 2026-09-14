import type * as React from "react";

export type DateRangeValue = {
  end?: string;
  start?: string;
};

/** One named range shared by Calendar, DatePicker, and FilterBar.DateRange. */
export type DateRangePreset = {
  label: React.ReactNode;
  range: DateRangeValue;
  value: string;
};

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string) {
  // Host adaptation for `noUncheckedIndexedAccess`: a malformed key resolves to
  // an invalid date rather than assuming the missing parts exist.
  const [year = NaN, month = NaN, day = NaN] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The system defaults are date math, not frozen values. Pass a reference date
 * from the product's timezone boundary; omitting it uses the local day.
 */
export function createDateRangePresets(
  referenceDate = new Date(),
): DateRangePreset[] {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return [
    {
      label: "Today",
      range: { end: toDateKey(today), start: toDateKey(today) },
      value: "today",
    },
    {
      label: "Last 7 days",
      range: { end: toDateKey(today), start: toDateKey(weekStart) },
      value: "last-7-days",
    },
    {
      label: "This month",
      range: { end: toDateKey(today), start: toDateKey(monthStart) },
      value: "this-month",
    },
  ];
}
