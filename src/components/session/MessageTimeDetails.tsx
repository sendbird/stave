import * as stylex from "@stylexjs/stylex";
import { Clock3 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { MessageAction } from "@/components/ai-elements";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { getMessageTimeEntries } from "./conversation-time";

export function MessageTimeDetails(props: {
  message: Parameters<typeof getMessageTimeEntries>[0];
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const { t } = useTranslation("session");
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const entries = getMessageTimeEntries(props.message);
  if (!entries.length) return null;
  const details = <TimeEntries entries={entries} />;
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        props.onOpenChange(nextOpen);
      }}
    >
      <TooltipProvider delay={0}>
        <Tooltip disabled={open}>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <MessageAction
                    aria-label={t("conversationTime.details")}
                    aria-describedby={open ? undefined : tooltipId}
                    className={props.className}
                  >
                    <Clock3 aria-hidden className={sx(styles.icon)} />
                  </MessageAction>
                }
              />
            }
          />
          <TooltipContent id={tooltipId} role="tooltip" align="end">
            <TimeEntries entries={entries} inverted />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" side="top" xstyle={styles.popup}>
        <PopoverTitle>{t("conversationTime.details")}</PopoverTitle>
        {details}
      </PopoverContent>
    </Popover>
  );
}

function TimeEntries({
  entries,
  inverted = false,
}: {
  entries: ReturnType<typeof getMessageTimeEntries>;
  inverted?: boolean;
}) {
  const { t } = useTranslation("session");
  return (
    <dl className={sx(styles.list)}>
      {entries.map(({ kind, value }) => (
        <div key={kind} className={sx(styles.entry)}>
          <dt className={sx(styles.label, inverted && styles.invertedLabel)}>
            {t(`conversationTime.${kind}`)}
          </dt>
          <dd className={sx(styles.value)}>
            <time dateTime={value}>
              {formatDateTime(value, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
              })}
            </time>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const styles = stylex.create({
  icon: { width: 14, height: 14 },
  popup: { width: "max-content", maxWidth: "min(24rem, calc(100vw - 2rem))" },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    margin: 0,
  },
  entry: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  invertedLabel: { color: "inherit" },
  value: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    overflowWrap: "anywhere",
  },
});
