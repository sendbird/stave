import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { Gauge } from "lucide-react";
import { useRef, useState } from "react";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { sx } from "../aui/utils/stylex";
import { contextTokenLabel } from "./context-token-label";
import { contextMeterStyles } from "./prompt-input-context-meter.styles";
import {
  PromptInputContextBreakdown,
  type ContextBreakdownState,
} from "./prompt-input-context-breakdown";
import {
  conversationContextUsageTone,
  formatConversationContextCounts,
  formatConversationContextPercent,
  type ConversationContextUsage,
  type ConversationContextUsageTone,
} from "@/components/ai-elements/prompt-input.utils";
import type {
  ClaudeContextUsageResponse,
  ProviderId,
} from "@/lib/providers/provider.types";

function usageToneStyle(tone: ConversationContextUsageTone) {
  if (tone === "success") {
    return contextMeterStyles.fillOk;
  }
  if (tone === "warning") {
    return contextMeterStyles.fillWarn;
  }
  return contextMeterStyles.fillDanger;
}

const TONE_RANK: Record<ConversationContextUsageTone, number> = {
  success: 0,
  warning: 1,
  danger: 2,
};

/** Tokens still free in the window, when the provider reported enough to say. */
export function resolveContextRemainingTokens(usage: ConversationContextUsage): number | undefined {
  if (usage.remainingTokens !== undefined && Number.isFinite(usage.remainingTokens)) {
    return Math.max(0, usage.remainingTokens);
  }
  if (usage.usedTokens !== undefined && usage.windowTokens !== undefined) {
    return Math.max(0, usage.windowTokens - usage.usedTokens);
  }
  return undefined;
}

/** The reported fill in tokens, or the percent of a known window. */
function resolveUsedTokens(usage: ConversationContextUsage): number | undefined {
  if (usage.usedTokens !== undefined) return usage.usedTokens;
  if (usage.windowTokens !== undefined && Number.isFinite(usage.usedPercent)) {
    return Math.round((usage.usedPercent / 100) * usage.windowTokens);
  }
  return undefined;
}

/**
 * One polite sentence the first time the meter climbs into warning, and one
 * the first time it reaches danger. A meter that mounts already past a
 * boundary did not cross it, so it says nothing; dropping back (after a
 * compact) and climbing again does not repeat a boundary already announced.
 * Mount the meter per conversation so a task switch is not a crossing.
 */
export interface BoundaryAnnouncementState {
  seenTone: ConversationContextUsageTone;
  announced: readonly ConversationContextUsageTone[];
  text: string;
}

export function startBoundaryAnnouncement(tone: ConversationContextUsageTone): BoundaryAnnouncementState {
  return { seenTone: tone, announced: [], text: "" };
}

/** The next announcement state for a new reading; the same object when nothing changes. */
export function advanceBoundaryAnnouncement(
  state: BoundaryAnnouncementState,
  tone: ConversationContextUsageTone,
  percentLabel: string,
): BoundaryAnnouncementState {
  if (tone === state.seenTone) return state;
  const crossed = TONE_RANK[tone] > TONE_RANK[state.seenTone] && tone !== "success";
  if (!crossed || state.announced.includes(tone)) {
    return { ...state, seenTone: tone };
  }
  return {
    seenTone: tone,
    announced: [...state.announced, tone],
    text: i18n.t(
      tone === "danger"
        ? "composer:promptInputContextMeter.announceDanger"
        : "composer:promptInputContextMeter.announceWarning",
      { percent: percentLabel },
    ),
  };
}

function useBoundaryAnnouncement(tone: ConversationContextUsageTone, percentLabel: string): string {
  const [state, setState] = useState(() => startBoundaryAnnouncement(tone));
  const next = advanceBoundaryAnnouncement(state, tone, percentLabel);
  if (next !== state) setState(next);
  return next.text;
}

export function PromptInputContextMeter(args: {
  usage: ConversationContextUsage;
  compactAvailable: boolean;
  compactDisabled: boolean;
  compactPending?: boolean;
  compactDisabledReason?: string;
  onCompact?: () => void;
  /** The provider the reading came from; enables the composition section. */
  providerId?: ProviderId;
  /**
   * Claude only: reads the fixed parts of the context. Called when the
   * popover opens, never on render; the caller caches it.
   */
  loadBreakdown?: () => Promise<ClaudeContextUsageResponse>;
}) {
  useTranslation();
  const tone = conversationContextUsageTone(args.usage.usedPercent);
  const percentLabel = formatConversationContextPercent(args.usage.usedPercent);
  const tokenLabel = contextTokenLabel(args.usage);
  const countLabel = formatConversationContextCounts(args.usage);
  const fillPercent = Math.min(100, Math.max(0, args.usage.usedPercent));
  const remainingTokens = resolveContextRemainingTokens(args.usage);
  const announcement = useBoundaryAnnouncement(tone, percentLabel);
  const [breakdown, setBreakdown] = useState<ContextBreakdownState>({ status: "idle" });
  const requestRef = useRef(0);

  const onOpenChange = (open: boolean) => {
    if (!open || args.providerId !== "claude-code") return;
    const load = args.loadBreakdown;
    if (!load) {
      setBreakdown({ status: "unavailable" });
      return;
    }
    const request = ++requestRef.current;
    setBreakdown((current) => (current.status === "ready" ? current : { status: "loading" }));
    void load().then(
      (result) => {
        if (request !== requestRef.current) return;
        setBreakdown(result.ok && result.usage ? { status: "ready", snapshot: result.usage } : { status: "unavailable" });
      },
      () => {
        if (request === requestRef.current) setBreakdown({ status: "unavailable" });
      },
    );
  };

  return (
    <>
      <Popover onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sx(contextMeterStyles.trigger)}
              aria-label={
                countLabel
                  ? i18n.t("composer:promptInputContextMeter.ariaLabelCounts", { percent: percentLabel, used: formatNumber(resolveUsedTokens(args.usage) ?? 0), limit: formatNumber(args.usage.windowTokens ?? 0), remaining: formatNumber(remainingTokens ?? 0) })
                  : remainingTokens !== undefined
                  ? i18n.t("composer:promptInputContextMeter.ariaLabelRemaining", {
                      percent: percentLabel,
                      remaining: formatNumber(remainingTokens),
                    })
                  : i18n.t("composer:promptInputContextMeter.ariaLabel", { value1: percentLabel })
              }
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
          {tokenLabel ? <span className={sx(contextMeterStyles.percent, contextMeterStyles.tokens)}>{tokenLabel}</span> : null}
          <span className={sx(contextMeterStyles.percent, Boolean(tokenLabel) && contextMeterStyles.narrowPercent)}>
            {percentLabel}
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" xstyle={contextMeterStyles.popover}>
          <PopoverTitle className={sx(contextMeterStyles.popoverTitle)}>
            <Gauge className={sx(contextMeterStyles.titleIcon)} />
            {i18n.t("composer:promptInputContextMeter.promptInputContextMeter")}</PopoverTitle>
          <PopoverDescription className={sx(contextMeterStyles.popoverDescription)}>
            {i18n.t("composer:promptInputContextMeter.promptInputContextMeter2")}</PopoverDescription>
          <dl className={sx(contextMeterStyles.metricsList)}>
            <dt className={sx(contextMeterStyles.metricTerm)}>{i18n.t("composer:promptInputContextMeter.promptInputContextMeter3")}</dt>
            <dd className={sx(contextMeterStyles.metricValue)}>{percentLabel}</dd>
            {countLabel ? (
              <>
                <dt className={sx(contextMeterStyles.metricTerm)}>{i18n.t("composer:promptInputContextMeter.promptInputContextMeter4")}</dt>
                <dd className={sx(contextMeterStyles.metricValue)}>{countLabel}</dd>
              </>
            ) : null}
          </dl>
          {args.providerId ? (
            <PromptInputContextBreakdown
              providerId={args.providerId}
              state={breakdown}
              usedTokens={resolveUsedTokens(args.usage)}
            />
          ) : null}
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
              {args.compactPending ? i18n.t("composer:promptInputContextMeter.promptInputContextMeter5") : i18n.t("composer:promptInputContextMeter.promptInputContextMeter6")}
            </Button>
          ) : (
            <p className={sx(contextMeterStyles.emptyNote)}>
              {i18n.t("composer:promptInputContextMeter.promptInputContextMeter7")}</p>
          )}
        </PopoverContent>
      </Popover>
      <VisuallyHidden aria-live="polite" role="status" data-context-meter-announcement="">
        {announcement}
      </VisuallyHidden>
    </>
  );
}
