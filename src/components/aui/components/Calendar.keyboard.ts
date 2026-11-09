import type * as React from "react";

export function handleCalendarDayKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
): string | null {
  const offsets: Record<string, number> = {
    ArrowDown: 7,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
  };
  const currentDate = parseCalendarDay(event.currentTarget);
  if (!currentDate) return null;

  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const offset =
      event.key === "Home" ? -currentDate.getDay() : 6 - currentDate.getDay();
    return moveFocusByDate(
      event.currentTarget,
      addDays(currentDate, offset),
      event.key === "Home" ? 1 : -1,
    );
  }

  const offset = offsets[event.key];

  if (offset) {
    event.preventDefault();
    return moveFocusByDate(
      event.currentTarget,
      addDays(currentDate, offset),
      offset,
    );
  }

  return null;
}

// Move by calendar date rather than concatenated DOM index. One month happens
// to have 42 cells; two months have two overlapping 42-cell grids, so a DOM
// `index + 7` can land on the duplicate outside-day from the wrong panel.
function moveFocusByDate(
  button: HTMLButtonElement,
  nextDate: Date,
  step: number,
) {
  const buttons = getCalendarButtons(button);
  let candidate = nextDate;

  for (let attempts = 0; attempts < buttons.length; attempts += 1) {
    const key = toDateKey(candidate);
    const nextButton = buttons.find(
      (entry) => entry.dataset.calendarDay === key && !entry.disabled,
    );
    if (nextButton) {
      nextButton.focus();
      return key;
    }
    candidate = addDays(candidate, step);
  }
  return null;
}

function getCalendarButtons(button: HTMLButtonElement) {
  return Array.from(
    button
      .closest("[data-calendar-root]")
      ?.querySelectorAll<HTMLButtonElement>("[data-calendar-day]") ?? [],
  );
}

function parseCalendarDay(button: HTMLButtonElement) {
  const value = button.dataset.calendarDay;
  if (!value) return null;
  // Host adaptation: this repo compiles with `noUncheckedIndexedAccess`, which
  // upstream does not, so the destructured parts arrive as `number | undefined`.
  // Defaulting to `NaN` keeps the malformed-key path yielding an Invalid Date
  // exactly as before — same idiom `Calendar.tsx`'s `parseDateKey` already uses.
  const [year = NaN, month = NaN, day = NaN] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  return next;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
