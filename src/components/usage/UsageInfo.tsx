import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui";
import { i18n } from "@/i18n";
import { usageStyles as styles } from "./usage.styles";

/**
 * Background a reader needs once, not on every visit: how totals are counted,
 * what a report covers. Opens on click or keyboard so it also works on touch.
 */
export function UsageInfo(props: { title: string; children: ReactNode }) {
  return <Popover>
    <PopoverTrigger render={<Button type="button" variant="quiet" size="xs" iconOnly xstyle={styles.infoTrigger}
      aria-label={props.title} />}>
      <Info aria-hidden="true" className={sx(styles.infoIcon)} />
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" xstyle={styles.infoPopover}>
      <PopoverHeader><PopoverTitle className={sx(styles.infoTitle)}>{props.title}</PopoverTitle></PopoverHeader>
      {props.children}
    </PopoverContent>
  </Popover>;
}

/**
 * A measurement the provider did not report, in a table cell: a dash keeps the
 * column scannable, the words stay available to hover and to screen readers.
 * Missing is never zero, so it never reads as `0`.
 */
export function NotReported() {
  const label = i18n.t("usage:usageParts.notReported");
  return <span title={label}><span aria-hidden="true" className={sx(styles.missing)}>–</span><VisuallyHidden>{label}</VisuallyHidden></span>;
}
