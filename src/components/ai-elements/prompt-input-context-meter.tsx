import { Gauge } from "lucide-react";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui";
import { sx } from "../ads/utils/stylex";
import { contextMeterStyles } from "./prompt-input-context-meter.styles";
import {
  conversationContextUsageTone,
  formatConversationContextCounts,
  formatConversationContextPercent,
  type ConversationContextUsage,
} from "@/components/ai-elements/prompt-input.utils";

function usageToneStyle(tone: ReturnType<typeof conversationContextUsageTone>) {
  if (tone === "ok") {
    return contextMeterStyles.fillOk;
  }
  if (tone === "warn") {
    return contextMeterStyles.fillWarn;
  }
  return contextMeterStyles.fillDanger;
}

export function PromptInputContextMeter(args: {
  usage: ConversationContextUsage;
  compactAvailable: boolean;
  compactDisabled: boolean;
  compactPending?: boolean;
  compactDisabledReason?: string;
  onCompact?: () => void;
}) {
  const tone = conversationContextUsageTone(args.usage.usedPercent);
  const percentLabel = formatConversationContextPercent(args.usage.usedPercent);
  const countLabel = formatConversationContextCounts(args.usage);
  const fillPercent = Math.min(100, Math.max(0, args.usage.usedPercent));

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={sx(contextMeterStyles.trigger)}
            aria-label={`Conversation context ${percentLabel} used`}
          />
        }
      >
        <span
          aria-hidden="true"
          className={sx(contextMeterStyles.track)}
        >
          <span
            className={sx(contextMeterStyles.fill, usageToneStyle(tone))}
            style={{ width: `${fillPercent}%` }}
          />
        </span>
        <span className={sx(contextMeterStyles.percent)}>
          {percentLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className={sx(contextMeterStyles.popover)}>
        <PopoverTitle className={sx(contextMeterStyles.popoverTitle)}>
          <Gauge className={sx(contextMeterStyles.titleIcon)} />
          Conversation context
        </PopoverTitle>
        <PopoverDescription className={sx(contextMeterStyles.popoverDescription)}>
          Latest context usage for the selected provider. Compact summarizes this
          provider's session.
        </PopoverDescription>
        <dl className={sx(contextMeterStyles.metricsList)}>
          <dt className={sx(contextMeterStyles.metricTerm)}>Used</dt>
          <dd className={sx(contextMeterStyles.metricValue)}>{percentLabel}</dd>
          {countLabel ? (
            <>
              <dt className={sx(contextMeterStyles.metricTerm)}>Tokens</dt>
              <dd className={sx(contextMeterStyles.metricValue)}>{countLabel}</dd>
            </>
          ) : null}
        </dl>
        {args.compactAvailable && args.onCompact ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={sx(contextMeterStyles.compactButton)}
            disabled={args.compactDisabled || args.compactPending}
            title={
              args.compactDisabled ? args.compactDisabledReason : undefined
            }
            onClick={args.onCompact}
          >
            {args.compactPending ? "Compacting…" : "Compact context"}
          </Button>
        ) : (
          <p className={sx(contextMeterStyles.emptyNote)}>
            This provider has no compact command.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
