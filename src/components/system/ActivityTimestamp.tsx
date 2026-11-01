import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { formatAgeCompact, formatDateTime } from "@/i18n/format";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

export function ActivityTimestamp(props: {
  value?: string;
  kind: "updated" | "sent" | "started" | "completed";
  /**
   * Only the age (`6m`, `2h`), for dense cards and rows; the full date and
   * time stay in the tooltip, and the accessible name keeps the label.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation("common");
  if (!props.value || !Number.isFinite(Date.parse(props.value))) return null;
  const label = t(`activityTimestamp.${props.kind}`, {
    time: props.compact ? formatAgeCompact(props.value) : formatDateTime(props.value),
  });
  return (
    <time
      dateTime={props.value}
      className={sx(styles.time)}
      aria-label={props.compact ? label : undefined}
      title={formatDateTime(props.value, {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit",
        timeZoneName: "short",
      })}
    >
      {props.compact ? formatAgeCompact(props.value) : label}
    </time>
  );
}

const styles = stylex.create({
  time: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
});
