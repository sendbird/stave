import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";
import {
  type DateRangePreset,
  type DateRangeValue,
  parseDateKey,
  toDateKey,
} from "./date-range";
import { handleCalendarDayKeyDown } from "./Calendar.keyboard";
import { dayDensityStyles, densityStyles, styles } from "./Calendar.styles";

export type CalendarDensity = "compact" | "regular";

export type CalendarRangeValue = DateRangeValue;

/**
 * Per-day event marks. `marks` is decorative and hidden from assistive tech, so
 * `description` must carry the same information as text: it is appended to the
 * day's accessible name, because a colored dot alone never describes a day.
 */
export type CalendarDayAnnotation = {
  description?: string;
  marks?: React.ReactNode;
};

export type CalendarProps = Omit<React.ComponentProps<"div">, "onSelect"> & {
  /**
   * Event marks per day, keyed by `YYYY-MM-DD`. Passing the map switches every
   * day cell to the stacked number-over-marks layout, so rows keep one height.
   */
  dayAnnotations?: Record<string, CalendarDayAnnotation>;
  density?: CalendarDensity;
  disabledDates?: string[];
  isDateDisabled?: (date: Date) => boolean;
  label?: React.ReactNode;
  /** Inclusive lower selection and navigation boundary (`YYYY-MM-DD`). */
  minDate?: string;
  month?: Date;
  /** Number of adjacent month panels. @default 1 */
  months?: 1 | 2;
  /** Inclusive upper selection and navigation boundary (`YYYY-MM-DD`). */
  maxDate?: string;
  onDateSelect?: (date: string) => void;
  /** Receives the range chosen by a named preset. */
  onRangeSelect?: (range: CalendarRangeValue, preset: DateRangePreset) => void;
  /** Named ranges shared with DatePicker and FilterBar.DateRange. */
  presets?: readonly DateRangePreset[];
  rangeValue?: CalendarRangeValue;
  value?: string;
} & XstyleProp;

type CalendarCell = {
  date: Date;
  disabled: boolean;
  inMonth: boolean;
  key: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Calendar({
  className,
  dayAnnotations,
  density = "regular",
  disabledDates = [],
  isDateDisabled,
  label,
  maxDate,
  minDate,
  month,
  months = 1,
  onDateSelect,
  onRangeSelect,
  presets = [],
  rangeValue,
  value,
  xstyle,
  ...props
}: CalendarProps) {
  const titleId = useId();
  // The visible month is navigable (prev/next). Initialized from `month` (or the
  // selected value, else today); a controlled `month` prop keeps it in sync.
  const [viewMonth, setViewMonth] = useState(() =>
    clampViewMonth(
      month ??
        (value
          ? parseDateKey(value)
          : rangeValue?.start
            ? parseDateKey(rangeValue.start)
            : new Date()),
      minDate,
      maxDate,
      months,
    ),
  );
  // Sync on year+month value (not Date identity) so a parent passing an
  // inline `new Date(...)` does not reset the user's navigation on re-render.
  const monthYear = month?.getFullYear();
  const monthIndex = month?.getMonth();
  useEffect(() => {
    if (monthYear !== undefined && monthIndex !== undefined) {
      setViewMonth(
        clampViewMonth(
          new Date(monthYear, monthIndex, 1),
          minDate,
          maxDate,
          months,
        ),
      );
    }
  }, [maxDate, minDate, monthIndex, months, monthYear]);
  useEffect(() => {
    if (monthYear !== undefined && monthIndex !== undefined) return;
    setViewMonth((current) => {
      const next = clampViewMonth(current, minDate, maxDate, months);
      return next.getTime() === current.getTime() ? current : next;
    });
  }, [maxDate, minDate, monthIndex, months, monthYear]);
  const monthStart = startOfMonth(viewMonth);
  const monthStarts = useMemo(
    () =>
      Array.from({ length: months }, (_, index) =>
        addMonths(monthStart, index),
      ),
    [monthStart, months],
  );
  const title = formatMonthRange(monthStarts);
  const minKey = minDate ? toDateKey(parseDateKey(minDate)) : undefined;
  const maxKey = maxDate ? toDateKey(parseDateKey(maxDate)) : undefined;
  const minMonth = minDate ? startOfMonth(parseDateKey(minDate)) : undefined;
  const maxMonth = maxDate ? startOfMonth(parseDateKey(maxDate)) : undefined;
  const canNavigatePrevious =
    minMonth === undefined || monthStart.getTime() > minMonth.getTime();
  const lastVisibleMonth = monthStarts[monthStarts.length - 1] ?? monthStart;
  const canNavigateNext =
    maxMonth === undefined || lastVisibleMonth.getTime() < maxMonth.getTime();
  const disabledDateSet = useMemo(
    () => new Set(disabledDates),
    [disabledDates],
  );
  const monthCells = useMemo(
    () =>
      monthStarts.map((visibleMonth) =>
        getCalendarCells(visibleMonth).map((cell) => {
          const key = toDateKey(cell.date);
          const outsideDualPanel = months === 2 && !cell.inMonth;
          return {
            ...cell,
            disabled:
              outsideDualPanel ||
              (minKey !== undefined && key < minKey) ||
              (maxKey !== undefined && key > maxKey) ||
              disabledDateSet.has(key) ||
              Boolean(isDateDisabled?.(cell.date)),
          };
        }),
      ),
    [disabledDateSet, isDateDisabled, maxKey, minKey, monthStarts, months],
  );
  const cells = monthCells.flat();

  // Roving tabindex: exactly one day is in the tab order; arrows move focus.
  // Once the user moves focus with the keyboard, the tab stop follows it.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const defaultTabbableKey = useMemo(() => {
    const enabled = cells.filter((cell) => !cell.disabled);
    if (enabled.length === 0) return null;
    const selected = enabled.find((cell) => {
      const key = toDateKey(cell.date);
      return (
        key === value || key === rangeValue?.start || key === rangeValue?.end
      );
    });
    const today = enabled.find((cell) => cell.inMonth && isToday(cell.date));
    const firstInMonth = enabled.find((cell) => cell.inMonth);
    return toDateKey((selected ?? today ?? firstInMonth ?? enabled[0]!).date);
  }, [cells, rangeValue, value]);
  const tabbableKey =
    focusedKey &&
    cells.some((cell) => !cell.disabled && cell.key === focusedKey)
      ? focusedKey
      : defaultTabbableKey;

  return (
    <div
      {...props}
      {...themeProps("calendar", { density })}
      aria-labelledby={titleId}
      className={cx(
        sx(
          styles.root,
          months === 2 && styles.rootDual,
          densityStyles[density],
          xstyle,
        ),
        themeTargetClassName("calendar"),
        className,
      )}
      data-calendar-root
      role="group"
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.nav)}>
          <button
            aria-label="Previous month"
            className={cx(
              sx(styles.navButton, focusRing.ring),
              themeTargetClassName("calendar-nav"),
            )}
            disabled={!canNavigatePrevious}
            onClick={() => setViewMonth(addMonths(monthStart, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={16} />
          </button>
          <div
            className={sx(styles.title)}
            id={titleId}
            {...themeSlotProps("calendar", "title")}
          >
            {label ?? title}
          </div>
          <button
            aria-label="Next month"
            className={cx(
              sx(styles.navButton, focusRing.ring),
              themeTargetClassName("calendar-nav"),
            )}
            disabled={!canNavigateNext}
            onClick={() => setViewMonth(addMonths(monthStart, 1))}
            type="button"
          >
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
        {rangeValue ? (
          <div
            className={sx(styles.rangeMeta)}
            {...themeSlotProps("calendar", "range-meta")}
          >
            {rangeValue.start ?? "Start"} - {rangeValue.end ?? "End"}
          </div>
        ) : null}
      </div>
      {presets.length ? (
        <div
          aria-label="Date range presets"
          className={sx(styles.presets)}
          {...themeSlotProps("calendar", "presets")}
        >
          {presets.map((preset) => (
            <Button
              key={preset.value}
              onClick={() => onRangeSelect?.(preset.range, preset)}
              size="xs"
              type="button"
              variant="secondary"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className={months === 2 ? sx(styles.panels) : undefined}>
        {monthStarts.map((visibleMonth, panelIndex) => (
          <div className={sx(styles.panel)} key={toDateKey(visibleMonth)}>
            {months === 2 ? (
              <div
                className={sx(styles.panelTitle)}
                {...themeSlotProps("calendar", "panel-title")}
              >
                {formatMonth(visibleMonth)}
              </div>
            ) : null}
            <CalendarGrid
              cells={monthCells[panelIndex] ?? []}
              dayAnnotations={dayAnnotations}
              density={density}
              focusedKey={tabbableKey}
              hideOutsideDays={months === 2}
              onDateSelect={onDateSelect}
              onFocusChange={setFocusedKey}
              rangeValue={rangeValue}
              value={value}
              visibleMonth={visibleMonth}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarGrid({
  cells,
  dayAnnotations,
  density,
  focusedKey,
  hideOutsideDays,
  onDateSelect,
  onFocusChange,
  rangeValue,
  value,
  visibleMonth,
}: {
  cells: CalendarCell[];
  dayAnnotations?: Record<string, CalendarDayAnnotation>;
  density: CalendarDensity;
  focusedKey: string | null;
  hideOutsideDays: boolean;
  onDateSelect?: (date: string) => void;
  onFocusChange: (date: string) => void;
  rangeValue?: CalendarRangeValue;
  value?: string;
  visibleMonth: Date;
}) {
  return (
    <div
      aria-label={formatMonth(visibleMonth)}
      className={sx(styles.grid)}
      data-calendar-grid
    >
      {weekdayLabels.map((weekday) => (
        <div
          className={sx(styles.weekday)}
          key={weekday}
          {...themeSlotProps("calendar", "weekday")}
        >
          {weekday}
        </div>
      ))}
      {cells.map((cell) => {
        const dateKey = toDateKey(cell.date);
        const annotation = dayAnnotations?.[dateKey];
        const selected = value === dateKey;
        const rangeStart = rangeValue?.start === dateKey;
        const rangeEnd = rangeValue?.end === dateKey;
        const inRange = isWithinRange(dateKey, rangeValue);
        const today = isToday(cell.date);

        return (
          <button
            {...themeProps("calendar-day", { density })}
            aria-current={today ? "date" : undefined}
            // The day's events are named here, not left to the marks alone.
            aria-label={`${cell.date.toLocaleDateString("en-US", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}${annotation?.description ? `, ${annotation.description}` : ""}`}
            aria-pressed={selected || rangeStart || rangeEnd || undefined}
            className={cx(
              sx(
                styles.day,
                focusRing.ring,
                dayDensityStyles[density],
                dayAnnotations != null && styles.dayStacked,
                !cell.inMonth && styles.dayMuted,
                hideOutsideDays && !cell.inMonth && styles.dayOutsideDual,
                inRange && styles.dayInRange,
                cell.inMonth && today && styles.dayToday,
                (selected || rangeStart || rangeEnd) && styles.daySelected,
              ),
              themeTargetClassName("calendar-day"),
            )}
            data-calendar-day={dateKey}
            disabled={cell.disabled}
            key={dateKey}
            onClick={() => onDateSelect?.(dateKey)}
            onKeyDown={(event) => {
              const movedKey = handleCalendarDayKeyDown(event);
              if (movedKey) {
                onFocusChange(movedKey);
              }
            }}
            tabIndex={dateKey === focusedKey ? 0 : -1}
            type="button"
          >
            {cell.date.getDate()}
            {dayAnnotations != null ? (
              <span aria-hidden className={sx(styles.dayMarks)}>
                {annotation?.marks}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function getCalendarCells(monthStart: Date): CalendarCell[] {
  const start = new Date(monthStart);
  start.setDate(1 - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      date,
      disabled: false,
      inMonth: date.getMonth() === monthStart.getMonth(),
      key: toDateKey(date),
    };
  });
}

function isToday(date: Date) {
  return toDateKey(date) === toDateKey(new Date());
}

function isWithinRange(dateKey: string, range?: CalendarRangeValue) {
  if (!range?.start || !range.end) {
    return false;
  }

  return dateKey >= range.start && dateKey <= range.end;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthRange(months: Date[]) {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last || first.getTime() === last.getTime()) {
    return first ? formatMonth(first) : "Calendar";
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.toLocaleDateString("en-US", { month: "long" })} – ${formatMonth(last)}`;
  }
  return `${formatMonth(first)} – ${formatMonth(last)}`;
}

function clampViewMonth(
  date: Date,
  minDate: string | undefined,
  maxDate: string | undefined,
  months: 1 | 2,
) {
  const requested = startOfMonth(date);
  const minimum = minDate ? startOfMonth(parseDateKey(minDate)) : undefined;
  const maximum = maxDate
    ? addMonths(startOfMonth(parseDateKey(maxDate)), 1 - months)
    : undefined;
  if (minimum && requested.getTime() < minimum.getTime()) return minimum;
  if (maximum && requested.getTime() > maximum.getTime()) {
    return minimum && maximum.getTime() < minimum.getTime() ? minimum : maximum;
  }
  return requested;
}
