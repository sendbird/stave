import { getIntlLocale, i18n, useTranslation } from "@/i18n";
import { formatRelativeTimeShort } from "@/i18n/format";
import {
  RelativeTime as AdsRelativeTime,
  type RelativeTimeProps,
} from "@/components/ads/components/RelativeTime";

type HostWords = "formatRelative" | "utcLabel" | "locale";

/**
 * ADS `RelativeTime` in Stave's words: the short relative phrase ("2m ago",
 * "2분 전") from the shared formatter, and the card's absolute UTC and local
 * times in the display language's locale on hover or focus. It does not tick
 * on its own; a live surface passes `now` from the clock it already keeps.
 */
export function RelativeTime(props: Omit<RelativeTimeProps, HostWords>) {
  useTranslation();
  return (
    <AdsRelativeTime
      {...props}
      locale={getIntlLocale()}
      formatRelative={formatRelativeTimeShort}
      utcLabel={i18n.t("common:time.utc")}
    />
  );
}
