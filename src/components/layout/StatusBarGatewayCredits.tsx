import { useTranslation } from "@/i18n";
import { Loader } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import { usageStripStyles } from "@/components/layout/status-bar-usage-strip.styles";
import { describeApiConnectionCredits } from "@/components/layout/status-bar-usage-strip.utils";
import type { ApiConnectionCreditsView } from "@/lib/providers/use-api-connection-credits";

/**
 * A Vercel AI Gateway balance on the meter: the amounts once read, a spinner
 * for the first read, and the strip's dash when the balance is unknown. The
 * words for an unknown balance are in the details and the accessible name.
 */
export function GatewayCreditsItem({ credits }: { credits: ApiConnectionCreditsView | null }) {
  useTranslation();
  if (!credits) return null;
  if (credits.status === "loading") return <Loader aria-hidden size="xs" variant="spinner" />;
  const text = credits.status === "ok" ? describeApiConnectionCredits(credits) : null;
  return text ? (
    <span className={sx(usageStripStyles.item, usageStripStyles.context)}>{text}</span>
  ) : (
    <span className={sx(statusBarUsageStyles.triggerMono)}>—</span>
  );
}

/** The balance line in the meter's details; nothing until the first read answers. */
export function GatewayCreditsDetail({ credits }: { credits: ApiConnectionCreditsView | null }) {
  useTranslation();
  const text = describeApiConnectionCredits(credits);
  if (!credits || !text) return null;
  return (
    <p className={sx(credits.status === "ok" ? statusBarUsageStyles.bucketTitle : statusBarUsageStyles.note)}>
      {text}
    </p>
  );
}
