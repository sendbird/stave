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

  if (event.key === "Home" || event.key === "End") {
    const row = Math.floor(getButtonIndex(event.currentTarget) / 7);
    event.preventDefault();
    return moveFocus(
      event.currentTarget,
      row * 7 + (event.key === "Home" ? 0 : 6),
      event.key === "Home" ? 1 : -1,
    );
  }

  const offset = offsets[event.key];

  if (offset) {
    event.preventDefault();
    return moveFocus(
      event.currentTarget,
      getButtonIndex(event.currentTarget) + offset,
      offset,
    );
  }

  return null;
}

function getButtonIndex(button: HTMLButtonElement) {
  return getCalendarButtons(button).indexOf(button);
}

// Moves focus to the button at `nextIndex`, skipping disabled days by
// continuing in the `step` direction within the grid.
function moveFocus(button: HTMLButtonElement, nextIndex: number, step: number) {
  const buttons = getCalendarButtons(button);
  let index = nextIndex;

  while (index >= 0 && index < buttons.length && buttons[index]?.disabled) {
    index += step;
  }

  const nextButton = buttons[index];
  if (!nextButton) return null;

  nextButton.focus();
  return nextButton.dataset.calendarDay ?? null;
}

function getCalendarButtons(button: HTMLButtonElement) {
  return Array.from(
    button
      .closest("[data-calendar-grid]")
      ?.querySelectorAll<HTMLButtonElement>("[data-calendar-day]") ?? [],
  );
}
