import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

export function ActivityTimestamp(props: {
  value?: string;
  kind: "updated" | "sent" | "started" | "completed";
}) {
  const { t } = useTranslation("common");
  if (!props.value || !Number.isFinite(Date.parse(props.value))) return null;
  const label = t(`activityTimestamp.${props.kind}`, {
    time: formatDateTime(props.value),
  });
  return (
    <time
      dateTime={props.value}
      className={sx(styles.time)}
      title={formatDateTime(props.value, {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit",
        timeZoneName: "short",
      })}
    >
      {label}
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
