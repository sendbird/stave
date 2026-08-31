import { ArrowDownRight, ArrowUpRight, Zap } from "lucide-react";
import { useId } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { DelegatedExecutionUsage } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

type MessageUsage = NonNullable<ChatMessage["usage"]>;

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatCostUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

function formatReportedCost(amount: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === "USD") {
    return formatCostUsd(amount);
  }
  const digits = amount >= 1 ? 2 : 4;
  return `${normalizedCurrency} ${amount.toFixed(digits)}`;
}

function hasReportedDelegatedTokens(usage: DelegatedExecutionUsage) {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cacheReadTokens !== undefined ||
    usage.cacheCreationTokens !== undefined ||
    usage.thoughtTokens !== undefined ||
    usage.contextUsedTokens !== undefined ||
    usage.contextCostAmount !== undefined ||
    usage.totalCostUsd !== undefined
  );
}

function DelegatedUsageDetails(props: {
  entries: readonly DelegatedExecutionUsage[];
  includedInTurnTotal: boolean;
}) {
  if (props.entries.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 space-y-2 border-t border-background/20 pt-2">
      <p className="font-medium">Delegated breakdown</p>
      <p className="text-background/70">
        {props.includedInTurnTotal
          ? "Included in the turn total above."
          : "Reported by delegated executions."}
      </p>
      {props.entries.map((entry) => (
        <div key={entry.executionId} className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">
              {entry.role === "advisor" ? "Advisor" : "Worker"}
            </span>
            <span className="min-w-0 break-all text-right text-background/70">
              {getProviderLabel({ providerId: entry.providerId })} · {entry.model}
            </span>
          </div>
          {hasReportedDelegatedTokens(entry) ? (
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-background/70">Input</span>
              <span className="text-right font-mono">
                {(entry.inputTokens ?? 0).toLocaleString()} tokens
              </span>
              <span className="text-background/70">Output</span>
              <span className="text-right font-mono">
                {(entry.outputTokens ?? 0).toLocaleString()} tokens
              </span>
              {entry.cacheReadTokens !== undefined ? (
                <>
                  <span className="text-background/70">Cache read</span>
                  <span className="text-right font-mono">
                    {entry.cacheReadTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.cacheCreationTokens !== undefined ? (
                <>
                  <span className="text-background/70">Cache write</span>
                  <span className="text-right font-mono">
                    {entry.cacheCreationTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.thoughtTokens !== undefined ? (
                <>
                  <span className="text-background/70">Reasoning</span>
                  <span className="text-right font-mono">
                    {entry.thoughtTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.contextUsedTokens !== undefined &&
              entry.contextWindowTokens !== undefined ? (
                <>
                  <span className="text-background/70">Context</span>
                  <span className="text-right font-mono">
                    {entry.contextUsedTokens.toLocaleString()} / {entry.contextWindowTokens.toLocaleString()}
                  </span>
                </>
              ) : null}
              {entry.totalCostUsd !== undefined ? (
                <>
                  <span className="text-background/70">Cost</span>
                  <span className="text-right font-mono">
                    {formatCostUsd(entry.totalCostUsd)}
                  </span>
                </>
              ) : entry.contextCostAmount !== undefined &&
                entry.contextCostCurrency ? (
                <>
                  <span className="text-background/70">Session cost</span>
                  <span className="text-right font-mono">
                    {formatReportedCost(
                      entry.contextCostAmount,
                      entry.contextCostCurrency,
                    )}
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-background/70">
              This provider did not report delegated token usage.
            </p>
          )}
          {entry.sessionReused !== undefined ? (
            <p className="text-background/70">
              {entry.sessionReused ? "Session resumed" : "New role session"}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TurnUsageDetails(props: {
  usage: MessageUsage;
  providerId?: ChatMessage["providerId"];
  model?: string;
}) {
  const { usage } = props;
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Turn total</p>
        {props.providerId && props.providerId !== "user" && props.model ? (
          <span className="min-w-0 break-all text-right text-background/70">
            {getProviderLabel({ providerId: props.providerId })} · {props.model}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-background/70">Input</span>
        <span className="text-right font-mono">
          {usage.inputTokens.toLocaleString()} tokens
        </span>
        <span className="text-background/70">Output</span>
        <span className="text-right font-mono">
          {usage.outputTokens.toLocaleString()} tokens
        </span>
        {usage.cacheReadTokens ? (
          <>
            <span className="text-background/70">Cache read</span>
            <span className="text-right font-mono">
              {usage.cacheReadTokens.toLocaleString()} tokens
            </span>
          </>
        ) : null}
        {usage.cacheCreationTokens ? (
          <>
            <span className="text-background/70">Cache write</span>
            <span className="text-right font-mono">
              {usage.cacheCreationTokens.toLocaleString()} tokens
            </span>
          </>
        ) : null}
        {usage.thoughtTokens ? (
          <>
            <span className="text-background/70">Reasoning</span>
            <span className="text-right font-mono">
              {usage.thoughtTokens.toLocaleString()} tokens
            </span>
          </>
        ) : null}
        {usage.contextUsedTokens !== undefined &&
        usage.contextWindowTokens !== undefined ? (
          <>
            <span className="text-background/70">Context</span>
            <span className="text-right font-mono">
              {usage.contextUsedTokens.toLocaleString()} / {usage.contextWindowTokens.toLocaleString()}
            </span>
          </>
        ) : null}
        {usage.totalCostUsd != null ? (
          <>
            <span className="text-background/70">Cost</span>
            <span className="text-right font-mono">
              {formatCostUsd(usage.totalCostUsd)}
            </span>
          </>
        ) : usage.contextCostAmount !== undefined &&
          usage.contextCostCurrency ? (
          <>
            <span className="text-background/70">Session cost</span>
            <span className="text-right font-mono">
              {formatReportedCost(
                usage.contextCostAmount,
                usage.contextCostCurrency,
              )}
            </span>
          </>
        ) : null}
        {usage.ttftMs != null ? (
          <>
            <span className="text-background/70">TTFT</span>
            <span className="text-right font-mono">
              {usage.ttftMs >= 1000
                ? `${(usage.ttftMs / 1000).toFixed(1)}s`
                : `${Math.round(usage.ttftMs)}ms`}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function MessageUsageSummary(props: {
  usage?: MessageUsage;
  delegatedUsage?: readonly DelegatedExecutionUsage[];
  providerId?: ChatMessage["providerId"];
  model?: string;
}) {
  const tooltipId = useId();
  const delegatedUsage = (props.delegatedUsage ?? []).filter(
    (entry) =>
      hasReportedDelegatedTokens(entry) || entry.sessionReused !== undefined,
  );
  if (!props.usage && delegatedUsage.length === 0) {
    return null;
  }
  const delegatedLabel = `${delegatedUsage.length} delegated ${delegatedUsage.length === 1 ? "execution" : "executions"}`;
  const providerLabel =
    props.providerId && props.providerId !== "user" && props.model
      ? ` for ${getProviderLabel({ providerId: props.providerId })} · ${props.model}`
      : "";
  const accessibleLabel = props.usage
    ? `Turn usage details${providerLabel}: ${props.usage.inputTokens.toLocaleString()} input tokens, ${props.usage.outputTokens.toLocaleString()} output tokens${delegatedUsage.length ? `, ${delegatedLabel}` : ""}`
    : `Turn usage details${providerLabel}: ${delegatedLabel}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={accessibleLabel}
              aria-describedby={tooltipId}
              className="flex cursor-default items-center gap-1.5 rounded-sm pl-1 text-[11px] leading-none text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          }
        >
          {props.usage ? (
            <>
              <span className="inline-flex items-center gap-0.5">
                <ArrowUpRight aria-hidden="true" className="size-2.5" />
                {formatTokenCount(props.usage.inputTokens)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <ArrowDownRight aria-hidden="true" className="size-2.5" />
                {formatTokenCount(props.usage.outputTokens)}
              </span>
            </>
          ) : null}
          {props.usage?.cacheReadTokens ? (
            <span className="inline-flex items-center gap-0.5">
              <Zap aria-hidden="true" className="size-2.5" />
              {formatTokenCount(props.usage.cacheReadTokens)}
            </span>
          ) : null}
          {props.usage?.totalCostUsd != null ? (
            <span>{formatCostUsd(props.usage.totalCostUsd)}</span>
          ) : props.usage?.contextCostAmount !== undefined &&
            props.usage.contextCostCurrency ? (
            <span>
              {formatReportedCost(
                props.usage.contextCostAmount,
                props.usage.contextCostCurrency,
              )}
            </span>
          ) : null}
          {delegatedUsage.length ? (
            <span>{delegatedUsage.length} delegated</span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent
          id={tooltipId}
          role="tooltip"
          side="top"
          className="max-h-80 w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-y-auto text-xs"
        >
          {props.usage ? (
            <TurnUsageDetails
              usage={props.usage}
              providerId={props.providerId}
              model={props.model}
            />
          ) : null}
          <DelegatedUsageDetails
            entries={delegatedUsage}
            includedInTurnTotal={Boolean(props.usage)}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
