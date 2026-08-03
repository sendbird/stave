import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useRotatingThinkingPhrase } from "@/lib/thinking-phrases";
import { useAgentPhraseVariant, useAgentStyle } from "./agent-style-context";
import { ReasoningText, type ReasoningTextVariant } from "./reasoning-text";

interface ThinkingPhraseLabelProps {
  active: boolean;
  className?: string;
  /** Overrides the style-derived variant (used by the dev preview controls). */
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

/** `legacy` keeps the previous single-span fade; `beui` cascades per character. */
function useStyleVariant(explicit?: ReasoningTextVariant): ReasoningTextVariant {
  const style = useAgentStyle();
  const previewVariant = useAgentPhraseVariant();
  if (explicit) {
    return explicit;
  }
  /* TODO(agent-style-legacy): drop once the new trace visual is signed off. */
  if (style === "legacy") {
    return "swap";
  }
  return previewVariant ?? "cascade";
}

function ThinkingAnimatedTextComponent({
  text,
  className,
  shimmer = false,
  active = false,
  replayWhileActive = false,
  settleOnStop = false,
  variant,
}: ThinkingAnimatedTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const resolvedVariant = useStyleVariant(variant);
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
      className={cn(
        isSettling && "motion-safe:animate-thinking-label-settle",
        className,
      )}
    />
  );
}

function ThinkingPhraseLabelComponent({
  active,
  className,
  variant,
}: ThinkingPhraseLabelProps) {
  const phrase = useRotatingThinkingPhrase(active);
  const resolvedVariant = useStyleVariant(variant);
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
