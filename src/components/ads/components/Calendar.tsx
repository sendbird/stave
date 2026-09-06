import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { handleCalendarDayKeyDown } from "./Calendar.keyboard";

export type CalendarDensity = "compact" | "regular";

export type CalendarRangeValue = {
  end?: string;
  start?: string;
};

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
  month?: Date;
  onDateSelect?: (date: string) => void;
  rangeValue?: CalendarRangeValue;
  value?: string;
};

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
  month,
  onDateSelect,
  rangeValue,
  value,
  ...props
}: CalendarProps) {
  const titleId = useId();
  // The visible month is navigable (prev/next). Initialized from `month` (or the
  // selected value, else today); a controlled `month` prop keeps it in sync.
  const [viewMonth, setViewMonth] = useState(
    () =>
      month ??
      (value
        ? parseDateKey(value)
        : rangeValue?.start
          ? parseDateKey(rangeValue.start)
          : new Date()),
  );
  // Sync on year+month value (not Date identity) so a parent passing an
  // inline `new Date(...)` does not reset the user's navigation on re-render.
  const monthYear = month?.getFullYear();
  const monthIndex = month?.getMonth();
  useEffect(() => {
    if (monthYear !== undefined && monthIndex !== undefined) {
      setViewMonth(new Date(monthYear, monthIndex, 1));
    }
  }, [monthYear, monthIndex]);
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const title = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const disabledDateSet = useMemo(
    () => new Set(disabledDates),
    [disabledDates],
  );
  const cells = useMemo(
    () =>
      getCalendarCells(monthStart).map((cell) => {
        const key = toDateKey(cell.date);

        return {
          ...cell,
          disabled:
            disabledDateSet.has(key) || Boolean(isDateDisabled?.(cell.date)),
        };
      }),
    [disabledDateSet, isDateDisabled, monthStart],
  );

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
      aria-labelledby={titleId}
      className={cx(sx(styles.root, densityStyles[density]), className)}
      role="group"
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.nav)}>
          <button
            aria-label="Previous month"
            className={sx(styles.navButton, focusRing.ring)}
            onClick={() =>
              setViewMonth(
                new Date(
                  monthStart.getFullYear(),
                  monthStart.getMonth() - 1,
                  1,
                ),
              )
            }
            type="button"
          >
            <ChevronLeft aria-hidden size={16} />
          </button>
          <div className={sx(styles.title)} id={titleId}>
            {label ?? title}
          </div>
          <button
            aria-label="Next month"
            className={sx(styles.navButton, focusRing.ring)}
            onClick={() =>
              setViewMonth(
                new Date(
                  monthStart.getFullYear(),
                  monthStart.getMonth() + 1,
                  1,
                ),
              )
            }
            type="button"
          >
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
        {rangeValue ? (
          <div className={sx(styles.rangeMeta)}>
            {rangeValue.start ?? "Start"} - {rangeValue.end ?? "End"}
          </div>
        ) : null}
      </div>
      <div aria-label={title} className={sx(styles.grid)} data-calendar-grid>
        {weekdayLabels.map((weekday) => (
          <div className={sx(styles.weekday)} key={weekday}>
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
              aria-current={today ? "date" : undefined}
              // The day's events are named here, not left to the marks alone.
              aria-label={`${cell.date.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}${annotation?.description ? `, ${annotation.description}` : ""}`}
              aria-pressed={selected || rangeStart || rangeEnd || undefined}
              className={sx(
                styles.day,
                focusRing.ring,
                dayDensityStyles[density],
                dayAnnotations != null && styles.dayStacked,
                !cell.inMonth && styles.dayMuted,
                inRange && styles.dayInRange,
                cell.inMonth && today && styles.dayToday,
                (selected || rangeStart || rangeEnd) && styles.daySelected,
              )}
              data-calendar-day={dateKey}
              disabled={cell.disabled}
              key={dateKey}
              onClick={() => onDateSelect?.(dateKey)}
              onKeyDown={(event) => {
                const movedKey = handleCalendarDayKeyDown(event);
                if (movedKey) {
                  setFocusedKey(movedKey);
                }
              }}
              tabIndex={dateKey === tabbableKey ? 0 : -1}
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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year = NaN, month = NaN, day = NaN] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

const styles = stylex.create({
  root: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Static grouping stays flat; lift is reserved for interactive or docked UI.
    boxShadow: vars.elevationFlat,
    color: vars.colorText,
    display: "grid",
    gap: vars.space12,
    inlineSize: "min(320px, 100%)",
    minInlineSize: 0,
  },
  regular: {
    padding: vars.space16,
  },
  compact: {
    gap: vars.space8,
    padding: vars.space12,
  },
  header: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  nav: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  navButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover, ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars.iconButtonSize,
    justifyContent: "center",
    minBlockSize: vars.iconButtonSize,
    padding: 0,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    textAlign: "center",
  },
  rangeMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  grid: {
    display: "grid",
    gap: vars.space4,
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    minInlineSize: 0,
  },
  weekday: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    paddingBlock: vars.space4,
    textAlign: "center",
  },
  day: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover, ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    cursor: "pointer",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightTight,
    padding: 0,
    transitionDuration: vars.motionDurationFast,
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars.motionEaseStandard,
    ":disabled": {
      color: vars.colorTextSubtle,
      cursor: "not-allowed",
      opacity: vars.opacityDisabled,
    },
  },
  dayRegular: {
    minBlockSize: vars.controlHeightMd,
  },
  dayCompact: {
    minBlockSize: 30,
  },
  // Applied only with `dayAnnotations`; a date picker keeps its single-line cell.
  dayStacked: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    justifyContent: "center",
    paddingBlock: vars.space4,
  },
  // Present on every day, empty ones included, so the row reserves the same
  // height in each cell and the day numbers stay on one baseline.
  dayMarks: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
    // Reserved height: a free day and a busy day come out the same size, and a
    // mark that paints outside its box (a rotated square) is not clipped.
    minBlockSize: 10,
  },
  dayMuted: {
    color: vars.colorTextSubtle,
  },
  dayInRange: {
    backgroundColor: vars.colorSelectionFill,
  },
  dayToday: {
    borderColor: vars.colorAccent,
    color: vars.colorAccent,
    fontWeight: vars.fontWeightSemibold,
  },
  daySelected: {
    backgroundColor: vars.colorAccent,
    borderColor: vars.colorAccent,
    color: vars.colorAccentText,
  },
});

const densityStyles = {
  compact: styles.compact,
  regular: styles.regular,
} as const;

const dayDensityStyles = {
  compact: styles.dayCompact,
  regular: styles.dayRegular,
} as const;
