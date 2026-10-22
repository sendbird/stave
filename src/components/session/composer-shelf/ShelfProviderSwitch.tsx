import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { memo, useId, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderSwitchPreview } from "@/lib/providers/provider-switch-preview";
import { shelfStyles as styles } from "./composer-shelf.styles";
import { providerSwitchStyles } from "./shelf-provider-switch.styles";

/** The sentences under the notice, in the order a reader needs them. */
export function describeProviderSwitch(preview: ProviderSwitchPreview): string[] {
  const chars = formatNumber(preview.chars);
  const lines = [
    preview.session === "fresh"
      ? i18n.t("composer:providerSwitch.sessionFresh")
      : i18n.t("composer:providerSwitch.sessionResume"),
  ];
  if (preview.totalMessages === 0) {
    lines.push(i18n.t("composer:providerSwitch.receivesNothing"));
    return lines;
  }
  lines.push(
    preview.session === "fresh"
      ? i18n.t("composer:providerSwitch.receivesFresh", { count: preview.totalMessages, kept: preview.keptMessages, chars })
      : i18n.t("composer:providerSwitch.receivesResume", { count: preview.totalMessages, chars }),
  );
  if (preview.omittedMessages > 0) {
    lines.push(i18n.t("composer:providerSwitch.leftOut", {
      count: preview.omittedMessages,
      max: formatNumber(preview.maxChars),
    }));
  }
  if (preview.shortenedMessages > 0) {
    lines.push(i18n.t("composer:providerSwitch.shortened", { count: preview.shortenedMessages }));
  }
  if (preview.omittedMessages === 0 && preview.shortenedMessages === 0) {
    lines.push(i18n.t("composer:providerSwitch.nothingLeftOut"));
  }
  lines.push(i18n.t("composer:providerSwitch.textOnly"));
  return lines;
}

/**
 * The shelf line before a message that changes provider: who takes over and
 * what it will be given, so nothing about the switch is a surprise after the
 * send. A notice, not a control: it changes nothing about the message.
 */
export const ShelfProviderSwitch = memo(function ShelfProviderSwitch(props: { preview: ProviderSwitchPreview }) {
  useTranslation();
  const { preview } = props;
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const to = getProviderLabel({ providerId: preview.toProviderId });
  const summary = preview.session === "fresh"
    ? i18n.t("composer:providerSwitch.summaryFresh", { chars: formatNumber(preview.chars) })
    : i18n.t("composer:providerSwitch.summaryResume", { count: preview.totalMessages });
  return (
    <div data-testid="composer-shelf-provider-switch" data-session={preview.session}>
      <div className={sx(styles.line)} role="group" aria-label={i18n.t("composer:providerSwitch.ariaLabel")}>
        <span className={sx(styles.mark)}>
          <ArrowRightLeft aria-hidden className={sx(styles.markIcon, styles.quiet)} />
        </span>
        <p className={sx(styles.text)} title={`${i18n.t("composer:providerSwitch.title", { to })} · ${summary}`}>
          <span className={sx(styles.label)}>{i18n.t("composer:providerSwitch.title", { to })}</span>
          {" · "}
          {summary}
        </p>
        <span className={sx(styles.actions)}>
          <Button
            variant="quiet"
            size="xs"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((current) => !current)}
            xstyle={styles.quiet}
          >
            {open ? i18n.t("composer:providerSwitch.hideDetails") : i18n.t("composer:providerSwitch.showDetails")}
          </Button>
        </span>
      </div>
      {open ? (
        <ul id={detailsId} className={sx(providerSwitchStyles.details)}>
          {describeProviderSwitch(preview).map((line) => (
            <li key={line} className={sx(providerSwitchStyles.detail)}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
