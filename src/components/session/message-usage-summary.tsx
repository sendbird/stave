import { Button as AdsButton } from "@/components/ads/components/Button";
import { ArrowDownRight, ArrowUpRight, Gauge, Zap } from "lucide-react";
import { useId } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { sx } from "@/components/ads/utils/stylex";
import { messageUsageSummaryStyles as styles } from "./message-usage-summary.styles";
import {
  computePromptCacheStats,
  formatCacheHitLabel,
} from "@/lib/providers/usage-cache";
import type { DelegatedExecutionUsage } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

/**
 * An explicit "not reported" badge is only useful when a provider sometimes
 * reports usage and this turn did not. That applies to Kiro. Cursor never
 * reports usage over ACP, so the same badge on every Cursor turn is noise.
 * Native runtimes keep their original literal rendering.
 */
export function providerMayOmitTurnUsage(
  providerId?: ChatMessage["providerId"],
): boolean {
  return providerId === "kiro";
}

/**
 * ACP providers land in `usage` as soon as they report a context percentage or
 * a cost, with `inputTokens`/`outputTokens` seeded to 0. Neither reports token
 * counts, so an all-zero pair there is "not reported" rather than a 0-token
 * turn. Native runtimes keep their original literal rendering.
 */
function providerMaySeedZeroTokenUsage(
  providerId?: ChatMessage["providerId"],
): boolean {
  return providerId === "kiro" || providerId === "cursor";
}

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
    <div className={sx(styles.delegatedSection)}>
      <p className={sx(styles.sectionTitle)}>Delegated breakdown</p>
      <p className={sx(styles.mutedLine)}>
        {props.includedInTurnTotal
          ? "Included in the turn total above."
          : "Reported by delegated executions."}
      </p>
      {props.entries.map((entry) => (
        <div key={entry.executionId} className={sx(styles.entry)}>
          <div className={sx(styles.entryHeader)}>
            <span className={sx(styles.entryLabel)}>
              {entry.role === "advisor" ? "Advisor" : "Worker"}
            </span>
            <span className={sx(styles.entryMeta)}>
              {getProviderLabel({ providerId: entry.providerId })} ·{" "}
              {entry.model}
            </span>
          </div>
          {hasReportedDelegatedTokens(entry) ? (
            <div className={sx(styles.metricsGrid)}>
              <span className={sx(styles.metricLabel)}>Input</span>
              <span className={sx(styles.metricValue)}>
                {(entry.inputTokens ?? 0).toLocaleString()} tokens
              </span>
              <span className={sx(styles.metricLabel)}>Output</span>
              <span className={sx(styles.metricValue)}>
                {(entry.outputTokens ?? 0).toLocaleString()} tokens
              </span>
              {entry.cacheReadTokens !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Cache read</span>
                  <span className={sx(styles.metricValue)}>
                    {entry.cacheReadTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.cacheCreationTokens !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Cache write</span>
                  <span className={sx(styles.metricValue)}>
                    {entry.cacheCreationTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.thoughtTokens !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Reasoning</span>
                  <span className={sx(styles.metricValue)}>
                    {entry.thoughtTokens.toLocaleString()} tokens
                  </span>
                </>
              ) : null}
              {entry.contextUsedTokens !== undefined &&
              entry.contextWindowTokens !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Context</span>
                  <span className={sx(styles.metricValue)}>
                    {entry.contextUsedTokens.toLocaleString()} /{" "}
                    {entry.contextWindowTokens.toLocaleString()}
                  </span>
                </>
              ) : entry.contextUsedPercent !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Context</span>
                  <span className={sx(styles.metricValue)}>
                    {formatContextPercent(entry.contextUsedPercent)} used
                  </span>
                </>
              ) : null}
              {entry.totalCostUsd !== undefined ? (
                <>
                  <span className={sx(styles.metricLabel)}>Cost</span>
                  <span className={sx(styles.metricValue)}>
                    {formatCostUsd(entry.totalCostUsd)}
                  </span>
                </>
              ) : entry.contextCostAmount !== undefined &&
                entry.contextCostCurrency ? (
                <>
                  <span className={sx(styles.metricLabel)}>Session cost</span>
                  <span className={sx(styles.metricValue)}>
                    {formatReportedCost(
                      entry.contextCostAmount,
                      entry.contextCostCurrency,
                    )}
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className={sx(styles.mutedLine)}>
              This provider did not report delegated token usage.
            </p>
          )}
          {entry.sessionReused !== undefined ? (
            <p className={sx(styles.mutedLine)}>
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
  // Prompt size and cache hit rate are the two numbers that show whether
  // prompt caching is working; input + output alone hides cache reads entirely.
  const cacheStats = computePromptCacheStats({
    providerId:
      props.providerId && props.providerId !== "user" ? props.providerId : null,
    usage,
  });
  const cacheHitLabel = tokensReported ? formatCacheHitLabel(cacheStats) : null;
  const providerName =
    props.providerId && props.providerId !== "user"
      ? getProviderLabel({ providerId: props.providerId })
      : "This provider";
  return (
    <div className={sx(styles.turnTotal)}>
      <div className={sx(styles.turnTotalHeader)}>
        <p className={sx(styles.turnTotalTitle)}>Turn total</p>
        {props.providerId && props.providerId !== "user" && props.model ? (
          <span className={sx(styles.entryMeta)}>
            {getProviderLabel({ providerId: props.providerId })} · {props.model}
          </span>
        ) : null}
      </div>
      {tokensReported ? null : (
        <p className={sx(styles.mutedLine)}>
          {providerName} did not report token usage for this turn.
        </p>
      )}
      {usage ? (
        <div className={sx(styles.metricsGrid)}>
          {tokensReported ? (
            <>
              <span className={sx(styles.metricLabel)}>Prompt</span>
              <span className={sx(styles.metricValue)}>
                {cacheStats.promptTokens.toLocaleString()} tokens
              </span>
              <span className={sx(styles.metricLabel)}>Input</span>
              <span className={sx(styles.metricValue)}>
                {usage.inputTokens.toLocaleString()} tokens
              </span>
              <span className={sx(styles.metricLabel)}>Output</span>
              <span className={sx(styles.metricValue)}>
                {usage.outputTokens.toLocaleString()} tokens
              </span>
            </>
          ) : null}
          {cacheHitLabel ? (
            <>
              <span className={sx(styles.metricLabel)}>Cache hit</span>
              <span className={sx(styles.metricValue)}>{cacheHitLabel}</span>
            </>
          ) : null}
          {usage.cacheReadTokens ? (
            <>
              <span className={sx(styles.metricLabel)}>Cache read</span>
              <span className={sx(styles.metricValue)}>
                {usage.cacheReadTokens.toLocaleString()} tokens
              </span>
            </>
          ) : null}
          {usage.cacheCreationTokens ? (
            <>
              <span className={sx(styles.metricLabel)}>Cache write</span>
              <span className={sx(styles.metricValue)}>
                {usage.cacheCreationTokens.toLocaleString()} tokens
              </span>
            </>
          ) : null}
          {usage.thoughtTokens ? (
            <>
              <span className={sx(styles.metricLabel)}>Reasoning</span>
              <span className={sx(styles.metricValue)}>
                {usage.thoughtTokens.toLocaleString()} tokens
              </span>
            </>
          ) : null}
          {usage.contextUsedTokens !== undefined &&
          usage.contextWindowTokens !== undefined ? (
            <>
              <span className={sx(styles.metricLabel)}>Context</span>
              <span className={sx(styles.metricValue)}>
                {usage.contextUsedTokens.toLocaleString()} /{" "}
                {usage.contextWindowTokens.toLocaleString()}
              </span>
            </>
          ) : usage.contextUsedPercent !== undefined ? (
            <>
              <span className={sx(styles.metricLabel)}>Context</span>
              <span className={sx(styles.metricValue)}>
                {formatContextPercent(usage.contextUsedPercent)} used
              </span>
            </>
          ) : null}
          {usage.totalCostUsd != null ? (
            <>
              <span className={sx(styles.metricLabel)}>Cost</span>
              <span className={sx(styles.metricValue)}>
                {formatCostUsd(usage.totalCostUsd)}
              </span>
            </>
          ) : usage.contextCostAmount !== undefined &&
            usage.contextCostCurrency ? (
            <>
              <span className={sx(styles.metricLabel)}>Session cost</span>
              <span className={sx(styles.metricValue)}>
                {formatReportedCost(
                  usage.contextCostAmount,
                  usage.contextCostCurrency,
                )}
              </span>
            </>
          ) : null}
          {usage.ttftMs != null ? (
            <>
              <span className={sx(styles.metricLabel)}>TTFT</span>
              <span className={sx(styles.metricValue)}>
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
  // Kiro-only empty-state: elsewhere a usage record is trusted as-is, so a
  // native runtime that reports 0/0 still renders 0/0 the way it always has.
  const mayOmitUsage = providerMayOmitTurnUsage(props.providerId);
  const tokensReported = usage
    ? !providerMaySeedZeroTokenUsage(props.providerId) || hasTokenCounts(usage)
    : false;
  const contextOrCostReported = Boolean(
    usage &&
    (usage.contextUsedPercent !== undefined ||
      usage.totalCostUsd != null ||
      usage.contextCostAmount !== undefined),
  );
  // "Not reported" is a claim about a specific provider, so it needs
  // attribution. Without it there is nothing honest to show.
  const attributed = Boolean(props.providerId && props.providerId !== "user");
  if (
    !tokensReported &&
    !contextOrCostReported &&
    delegatedUsage.length === 0 &&
    !(mayOmitUsage && attributed)
  ) {
    return null;
  }
  const delegatedLabel = `${delegatedUsage.length} delegated ${delegatedUsage.length === 1 ? "execution" : "executions"}`;
  const providerLabel =
    props.providerId && props.providerId !== "user" && props.model
      ? ` for ${getProviderLabel({ providerId: props.providerId })} · ${props.model}`
      : "";
  // The cache hit rate is the number that says whether prompt caching is
  // working, so it belongs in the accessible label too, not only in the tooltip
  // a screen-reader user has to open.
  const summaryCacheHitLabel = formatCacheHitLabel(
    computePromptCacheStats({
      providerId:
        props.providerId && props.providerId !== "user"
          ? props.providerId
          : null,
      usage,
    }),
  );
  const accessibleLabel =
    usage && tokensReported
      ? `Turn usage details${providerLabel}: ${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens${summaryCacheHitLabel ? `, ${summaryCacheHitLabel}` : ""}${delegatedUsage.length ? `, ${delegatedLabel}` : ""}`
      : delegatedUsage.length
        ? `Turn usage details${providerLabel}: ${delegatedLabel}`
        : `Turn usage details${providerLabel}: token usage not reported by the provider`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <AdsButton
              layout="host"
              type="button"
              aria-label={accessibleLabel}
              aria-describedby={tooltipId}
              xstyle={styles.trigger}
            />
          }
        >
          {tokensReported && usage ? (
            <>
              <span className={sx(styles.triggerChip)}>
                <ArrowUpRight
                  aria-hidden="true"
                  className={sx(styles.triggerIcon)}
                />
                {formatTokenCount(usage.inputTokens)}
              </span>
              <span className={sx(styles.triggerChip)}>
                <ArrowDownRight
                  aria-hidden="true"
                  className={sx(styles.triggerIcon)}
                />
                {formatTokenCount(usage.outputTokens)}
              </span>
            </>
          ) : null}
          {tokensReported && usage?.cacheReadTokens ? (
            <span className={sx(styles.triggerChip)}>
              <Zap aria-hidden="true" className={sx(styles.triggerIcon)} />
              {formatTokenCount(usage.cacheReadTokens)}
            </span>
          ) : null}
          {usage?.contextUsedPercent !== undefined ? (
            <span className={sx(styles.triggerChip)}>
              <Gauge aria-hidden="true" className={sx(styles.triggerIcon)} />
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
          className={sx(styles.tooltipContent)}
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
