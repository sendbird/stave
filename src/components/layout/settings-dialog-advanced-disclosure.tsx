import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { advancedDisclosureStyles as styles } from "./settings-dialog-advanced-disclosure.styles";

const DISCLOSURE_VALUE = "advanced";

/**
 * Collapsed group for expert settings. Every control inside stays functional
 * and keeps its saved value; the disclosure only changes how much is shown by
 * default. Starts closed on every mount.
 *
 * `compact` is for use inside a SettingsCard, between field rows; the default
 * size sits between cards in a section column. Pass `open` and `onOpenChange`
 * when the owner must keep or set the open state (a deep link opening it).
 */
export function SettingsAdvancedDisclosure(args: {
  title: string;
  description?: string;
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = args.open ?? localOpen;
  const setOpen = (next: boolean) => {
    if (args.open === undefined) setLocalOpen(next);
    args.onOpenChange?.(next);
  };

  return (
    // Controlled so the chevron can follow the open state from here. ADS's
    // shared rotation rule keys off `data-open` on the trigger, but Base UI
    // puts `data-open` on the header and gives the trigger `data-panel-open`,
    // so that rule never matches. Owning the state locally keeps the fix out
    // of the vendored ADS source.
    <Accordion
      value={open ? [DISCLOSURE_VALUE] : []}
      onValueChange={(value) =>
        setOpen((value as readonly unknown[]).includes(DISCLOSURE_VALUE))
      }
    >
      <AccordionItem value={DISCLOSURE_VALUE}>
        <AccordionTrigger
          className={sx(styles.trigger, args.compact && styles.triggerCompact)}
        >
          <span className={sx(styles.titleGroup)}>
            <span
              className={sx(styles.title, args.compact && styles.titleCompact)}
            >
              {args.title}
            </span>
            {args.description ? (
              <span className={sx(styles.description)}>{args.description}</span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden
            className={sx(
              styles.chevron,
              transition.transform,
              open && styles.chevronOpen,
            )}
          />
        </AccordionTrigger>
        <AccordionContent className={sx(styles.panel)}>
          <div className={sx(styles.panelStack)}>{args.children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
