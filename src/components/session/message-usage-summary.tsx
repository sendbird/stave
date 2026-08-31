import { ArrowDownRight, ArrowUpRight, Gauge, Zap } from "lucide-react";
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

const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * `currency` is whatever the provider reported: an ISO code, or a plan-native
 * unit such as "credits". Units are suffixed in their own casing so a Kiro
 * turn reads "0.0541 credits" rather than "CREDITS 0.0541".
 */
function formatReportedCost(amount: number, currency: string): string {
  const trimmed = currency.trim();
  const normalizedCurrency = trimmed.toUpperCase();
  if (normalizedCurrency === "USD") {
    return formatCostUsd(amount);
  }
  const digits = amount >= 1 ? 2 : 4;
  if (ISO_CURRENCY_PATTERN.test(normalizedCurrency)) {
    return `${normalizedCurrency} ${amount.toFixed(digits)}`;
  }
  return `${amount.toFixed(digits)} ${trimmed}`;
}

function formatContextPercent(usedPercent: number): string {
  return `${usedPercent < 10 ? usedPercent.toFixed(1) : Math.round(usedPercent)}%`;
}

/**
 * ACP providers can finish a turn while reporting no usage at all (Cursor
 * never reports any) or only a percentage/cost. Only for those is an explicit
 * "not reported" badge informative; for the native runtimes a missing or
 * all-zero usage record keeps its original literal rendering.
 */
export function providerMayOmitTurnUsage(
  providerId?: ChatMessage["providerId"],
): boolean {
  return providerId === "cursor" || providerId === "kiro";
}

/**
 * Providers that only report a context percentage or a cost still land in
 * `usage`, where `inputTokens`/`outputTokens` are seeded to 0. Treat an
 * all-zero pair as "not reported" so the badge does not claim a 0-token turn.
 */
function hasTokenCounts(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  thoughtTokens?: number;
}): boolean {
  return Boolean(
    usage.inputTokens ||
      usage.outputTokens ||
      usage.cacheReadTokens ||
      usage.cacheCreationTokens ||
      usage.thoughtTokens,
  );
}

function hasReportedDelegatedTokens(usage: DelegatedExecutionUsage) {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cacheReadTokens !== undefined ||
    usage.cacheCreationTokens !== undefined ||
    usage.thoughtTokens !== undefined ||
    usage.contextUsedTokens !== undefined ||
    usage.contextUsedPercent !== undefined ||
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
              ) : entry.contextUsedPercent !== undefined ? (
                <>
                  <span className="text-background/70">Context</span>
                  <span className="text-right font-mono">
                    {formatContextPercent(entry.contextUsedPercent)} used
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
  usage?: MessageUsage;
  tokensReported: boolean;
  providerId?: ChatMessage["providerId"];
  model?: string;
}) {
  const usage = props.usage;
  const tokensReported = props.tokensReported;
  const providerName =
    props.providerId && props.providerId !== "user"
      ? getProviderLabel({ providerId: props.providerId })
      : "This provider";
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
      {tokensReported ? null : (
        <p className="text-background/70">
          {providerName} did not report token usage for this turn.
        </p>
      )}
      {usage ? (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {tokensReported ? (
            <>
              <span className="text-background/70">Input</span>
              <span className="text-right font-mono">
                {usage.inputTokens.toLocaleString()} tokens
              </span>
              <span className="text-background/70">Output</span>
              <span className="text-right font-mono">
                {usage.outputTokens.toLocaleString()} tokens
              </span>
            </>
          ) : null}
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
          ) : usage.contextUsedPercent !== undefined ? (
            <>
              <span className="text-background/70">Context</span>
              <span className="text-right font-mono">
                {formatContextPercent(usage.contextUsedPercent)} used
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
      ) : null}
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
  const usage = props.usage;
  const delegatedUsage = (props.delegatedUsage ?? []).filter(
    (entry) =>
      hasReportedDelegatedTokens(entry) || entry.sessionReused !== undefined,
  );
  // Scoped to ACP: elsewhere a usage record is trusted as-is, so a native
  // runtime that reports 0/0 still renders 0/0 the way it always has.
  const mayOmitUsage = providerMayOmitTurnUsage(props.providerId);
  const tokensReported = usage ? !mayOmitUsage || hasTokenCounts(usage) : false;
  // "Not reported" is a claim about a specific provider, so it needs
  // attribution. Without it there is nothing honest to show.
  const attributed = Boolean(props.providerId && props.providerId !== "user");
  if (!usage && delegatedUsage.length === 0 && !(mayOmitUsage && attributed)) {
    return null;
  }
  const delegatedLabel = `${delegatedUsage.length} delegated ${delegatedUsage.length === 1 ? "execution" : "executions"}`;
  const providerLabel =
    props.providerId && props.providerId !== "user" && props.model
      ? ` for ${getProviderLabel({ providerId: props.providerId })} · ${props.model}`
      : "";
  const accessibleLabel =
    usage && tokensReported
      ? `Turn usage details${providerLabel}: ${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens${delegatedUsage.length ? `, ${delegatedLabel}` : ""}`
      : delegatedUsage.length
        ? `Turn usage details${providerLabel}: ${delegatedLabel}`
        : `Turn usage details${providerLabel}: token usage not reported by the provider`;

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
          {tokensReported && usage ? (
            <>
              <span className="inline-flex items-center gap-0.5">
                <ArrowUpRight aria-hidden="true" className="size-2.5" />
                {formatTokenCount(usage.inputTokens)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <ArrowDownRight aria-hidden="true" className="size-2.5" />
                {formatTokenCount(usage.outputTokens)}
              </span>
            </>
          ) : null}
          {tokensReported && usage?.cacheReadTokens ? (
            <span className="inline-flex items-center gap-0.5">
              <Zap aria-hidden="true" className="size-2.5" />
              {formatTokenCount(usage.cacheReadTokens)}
            </span>
          ) : null}
          {usage?.contextUsedPercent !== undefined ? (
            <span className="inline-flex items-center gap-0.5">
              <Gauge aria-hidden="true" className="size-2.5" />
              {formatContextPercent(usage.contextUsedPercent)}
            </span>
          ) : null}
          {usage?.totalCostUsd != null ? (
            <span>{formatCostUsd(usage.totalCostUsd)}</span>
          ) : usage?.contextCostAmount !== undefined &&
            usage.contextCostCurrency ? (
            <span>
              {formatReportedCost(
                usage.contextCostAmount,
                usage.contextCostCurrency,
              )}
            </span>
          ) : null}
          {delegatedUsage.length ? (
            <span>{delegatedUsage.length} delegated</span>
          ) : null}
          {mayOmitUsage &&
          !tokensReported &&
          usage?.contextUsedPercent === undefined &&
          usage?.contextCostAmount === undefined &&
          delegatedUsage.length === 0 ? (
            <span>usage not reported</span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent
          id={tooltipId}
          role="tooltip"
          side="top"
          className="max-h-80 w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-y-auto text-xs"
        >
          {usage || delegatedUsage.length === 0 ? (
            <TurnUsageDetails
              usage={usage}
              tokensReported={tokensReported}
              providerId={props.providerId}
              model={props.model}
            />
          ) : null}
          <DelegatedUsageDetails
            entries={delegatedUsage}
            includedInTurnTotal={tokensReported}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
