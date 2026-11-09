import { formatDateRange } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { Calendar } from "@/components/aui/components/Calendar";
import { parseDateKey } from "@/components/aui/components/date-range";
import { controlChrome } from "@/components/aui/recipes/control-chrome";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { styles as selectStyles, triggerHeightsBySize, triggerStylesBySize } from "@/components/aui/recipes/select-styles";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dateInputValue,
  pickUsageRangeDay,
  USAGE_MAX_RANGE_DAYS,
  usagePeriodPresets,
  usageRangeDayCount,
  type UsageDateRange,
} from "./usage-view.utils";

const RANGE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const SUMMARY_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const describe = (range: UsageDateRange, options: Intl.DateTimeFormatOptions) =>
  range.start && range.end ? formatDateRange(parseDateKey(range.start), parseDateKey(range.end), options) : "";

/**
 * The usage view's custom period as one field. It opens two months with the
 * Period menu's fixed periods beside them; days and presets edit a draft,
 * Apply commits it, and Cancel, Escape or a press outside discard it. The
 * field keeps showing the committed range while the draft changes.
 */
export function UsageDateRangeField(props: {
  start: string;
  end: string;
  /** The report's zone: "today" and the summary are read in it. */
  timeZone: string;
  utc: boolean;
  now: number;
  onApply: (range: { start: string; end: string }) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const labelId = useId();
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UsageDateRange>({ start: props.start, end: props.end });
  const today = dateInputValue(new Date(props.now), props.utc);
  const presets = usagePeriodPresets(new Date(props.now), props.utc);
  const days = usageRangeDayCount(draft);
  const tooLong = days !== null && days > USAGE_MAX_RANGE_DAYS;
  const committed = describe({ start: props.start, end: props.end }, RANGE_FORMAT);
  const footer = !draft.end
    ? t("usage:dateRange.pickEnd")
    : tooLong
      ? t("usage:dateRange.tooLong", { count: USAGE_MAX_RANGE_DAYS })
      : t("usage:dateRange.summary", { range: describe(draft, SUMMARY_FORMAT), count: days ?? 0, zone: props.timeZone });
  return (
    <div className={sx(selectStyles.field)} data-usage-date-range="">
      <span id={labelId} className={sx(selectStyles.label)}>{t("usage:dateRange.label")}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Every opening starts from what is applied; closing without Apply drops the draft.
          if (next) setDraft({ start: props.start, end: props.end });
          setOpen(next);
        }}
      >
        <PopoverTrigger
          aria-labelledby={`${labelId} ${valueId}`}
          data-usage-date-range-trigger=""
          className={(state) => sx(
            selectStyles.trigger,
            triggerStylesBySize.sm,
            controlChrome.trigger,
            controlChrome.field,
            // Same ladder as the AUI Select trigger: keyboard-only focus border
            // and halo, and it owns the transition (no `transition.colors`).
            controlChrome.fieldTriggerBorder,
            focusRing.borderOnly,
            triggerHeightsBySize.sm,
            state.open && controlChrome.triggerOpen,
          )}
        >
          <span id={valueId} className={sx(selectStyles.value)} title={committed}>{committed}</span>
          <CalendarDays aria-hidden className={sx(selectStyles.icon, styles.icon)} />
        </PopoverTrigger>
        <PopoverContent align="end" density="flush" xstyle={styles.popup} aria-label={t("usage:dateRange.dialog")}>
          <div className={sx(styles.body)}>
            <div className={sx(styles.presets)} role="group" aria-label={t("usage:dateRange.presets")}>
              {presets.map((preset) => {
                const selected = draft.start === preset.start && draft.end === preset.end;
                return (
                  <Button key={preset.value} variant="quiet" size="sm" aria-pressed={selected}
                    xstyle={[styles.preset, selected && styles.presetSelected]}
                    data-usage-range-preset={preset.value}
                    onClick={() => setDraft({ start: preset.start, end: preset.end })}>
                    {preset.label}
                  </Button>
                );
              })}
            </div>
            <Calendar
              months={2}
              maxDate={today}
              rangeValue={draft}
              onValueChange={(day) => setDraft((current) => pickUsageRangeDay(current, day))}
              xstyle={styles.calendar}
            />
          </div>
          <div className={sx(styles.footer)}>
            <p className={sx(styles.summary, tooLong && styles.summaryError)} role={tooLong ? "alert" : undefined} data-usage-range-summary="">{footer}</p>
            <div className={sx(styles.actions)}>
              <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>{t("common:actions.cancel")}</Button>
              <Button variant="primary" size="sm" disabled={!draft.start || !draft.end || tooLong}
                onClick={() => {
                  if (!draft.start || !draft.end || tooLong) return;
                  props.onApply({ start: draft.start, end: draft.end });
                  setOpen(false);
                }}>
                {t("common:actions.apply")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const styles = stylex.create({
  icon: { inlineSize: vars["--aui-control-icon-size-sm"], blockSize: vars["--aui-control-icon-size-sm"] },
  popup: { inlineSize: "min(46rem, calc(100vw - 2rem))", maxInlineSize: "calc(100vw - 2rem)" },
  body: { display: "flex", flexWrap: "wrap", alignItems: "stretch", minInlineSize: 0 },
  presets: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    padding: vars["--aui-space-8"],
    flex: "0 0 9rem",
    borderInlineEndWidth: vars["--aui-border-width-hairline"],
    borderInlineEndStyle: "solid",
    borderInlineEndColor: vars["--aui-color-border"],
  },
  preset: { justifyContent: "flex-start" },
  presetSelected: { backgroundColor: vars["--aui-color-accent-soft"], color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"] },
  // The popover is the surface: the calendar drops its own frame so the two do not nest.
  calendar: { flex: "1 1 30rem", inlineSize: "auto", minInlineSize: 0, borderWidth: 0, backgroundColor: "transparent", boxShadow: "none" },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderBlockStartStyle: "solid",
    borderBlockStartColor: vars["--aui-color-border"],
  },
  summary: { margin: 0, minInlineSize: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontVariantNumeric: "tabular-nums" },
  summaryError: { color: vars["--aui-color-danger-text"] },
  actions: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"] },
});
