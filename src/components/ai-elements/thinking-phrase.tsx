import { useTranslation } from "@/i18n";
import { memo, useEffect, useRef, useState } from "react";
import { coreStyles } from "./ai-element-core.styles";
import { cx, sx } from "../ads/utils/stylex";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useRotatingThinkingPhrase } from "@/lib/thinking-phrases";
import { ReasoningText, type ReasoningTextVariant } from "./reasoning-text";

interface ThinkingPhraseLabelProps {
  active: boolean;
  className?: string;
  /** Overrides the default `cascade` variant. */
  variant?: ReasoningTextVariant;
}

interface ThinkingAnimatedTextProps {
  text: string;
  className?: string;
  shimmer?: boolean;
  active?: boolean;
  replayWhileActive?: boolean;
  settleOnStop?: boolean;
  variant?: ReasoningTextVariant;
}

const ACTIVE_REPLAY_INTERVAL_MS = 2200;
const SETTLE_DURATION_MS = 220;

/** Thinking phrases cascade per character unless a caller picks a variant. */
const DEFAULT_VARIANT: ReasoningTextVariant = "cascade";

function ThinkingAnimatedTextComponent({
  text,
  className,
  shimmer = false,
  active = false,
  replayWhileActive = false,
  settleOnStop = false,
  variant,
}: ThinkingAnimatedTextProps) {
  useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const resolvedVariant = variant ?? DEFAULT_VARIANT;
  const wasActiveRef = useRef(active);
  const [replayTick, setReplayTick] = useState(0);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    if (!active || !replayWhileActive || prefersReducedMotion || typeof window === "undefined") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setReplayTick((value) => value + 1);
    }, ACTIVE_REPLAY_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [active, prefersReducedMotion, replayWhileActive]);

  useEffect(() => {
    if (prefersReducedMotion || typeof window === "undefined") {
      wasActiveRef.current = active;
      return;
    }

    if (settleOnStop && wasActiveRef.current && !active) {
      setIsSettling(true);
      const timeoutId = window.setTimeout(() => setIsSettling(false), SETTLE_DURATION_MS);
      wasActiveRef.current = active;
      return () => window.clearTimeout(timeoutId);
    }

    wasActiveRef.current = active;
  }, [active, prefersReducedMotion, settleOnStop]);

  return (
    <ReasoningText
      key={`${text}:${active && replayWhileActive ? replayTick : "static"}`}
      text={text}
      variant={resolvedVariant}
      active={active}
      shimmer={shimmer}
      className={cx(isSettling ? sx(coreStyles.settle) : undefined, className)}
    />
  );
}

function ThinkingPhraseLabelComponent({
  active,
  className,
  variant,
}: ThinkingPhraseLabelProps) {
  useTranslation();
  const phrase = useRotatingThinkingPhrase(active);
  const resolvedVariant = variant ?? DEFAULT_VARIANT;
  return (
    <ReasoningText
      key={phrase}
      text={phrase}
      variant={resolvedVariant}
      active={active}
      shimmer
      className={className}
    />
  );
}

export const ThinkingAnimatedText = memo(ThinkingAnimatedTextComponent);
export const ThinkingPhraseLabel = memo(ThinkingPhraseLabelComponent);
