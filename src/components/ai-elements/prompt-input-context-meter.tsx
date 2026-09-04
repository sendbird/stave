import { Gauge } from "lucide-react";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  conversationContextUsageTone,
  formatConversationContextCounts,
  formatConversationContextPercent,
  type ConversationContextUsage,
} from "@/components/ai-elements/prompt-input.utils";

function usageToneClass(
  tone: ReturnType<typeof conversationContextUsageTone>,
): string {
  if (tone === "ok") {
    return "bg-success";
  }
  if (tone === "warn") {
    return "bg-warning";
  }
  return "bg-destructive";
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
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            aria-label={`Conversation context ${percentLabel} used`}
          />
        }
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-8 overflow-hidden rounded-full bg-muted-foreground/15"
        >
          <span
            className={cn("block h-full rounded-full", usageToneClass(tone))}
            style={{ width: `${fillPercent}%` }}
          />
        </span>
        <span className="font-mono text-[11px] tabular-nums">
          {percentLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-64 gap-0 p-3">
        <PopoverTitle className="flex items-center gap-1.5 text-sm">
          <Gauge className="size-3.5" />
          Conversation context
        </PopoverTitle>
        <PopoverDescription className="mt-1 text-xs">
          How full this task's context window is, from the latest reported turn.
        </PopoverDescription>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Used</dt>
          <dd className="text-right font-mono">{percentLabel}</dd>
          {countLabel ? (
            <>
              <dt className="text-muted-foreground">Tokens</dt>
              <dd className="text-right font-mono">{countLabel}</dd>
            </>
          ) : null}
        </dl>
        {args.compactAvailable && args.onCompact ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            disabled={args.compactDisabled || args.compactPending}
            title={
              args.compactDisabled ? args.compactDisabledReason : undefined
            }
            onClick={args.onCompact}
          >
            {args.compactPending ? "Compacting…" : "Compact context"}
          </Button>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            This provider has no compact command.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
