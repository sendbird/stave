import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useRotatingThinkingPhrase } from "@/lib/thinking-phrases";
import { Shimmer } from "./shimmer";

interface ThinkingPhraseLabelProps {
  active: boolean;
  className?: string;
}

interface ThinkingAnimatedTextProps {
  text: string;
  className?: string;
  shimmer?: boolean;
  active?: boolean;
  replayWhileActive?: boolean;
  settleOnStop?: boolean;
}

const ACTIVE_REPLAY_INTERVAL_MS = 2200;
const SETTLE_DURATION_MS = 220;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncPreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }

    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, []);

  return prefersReducedMotion;
}

function ThinkingAnimatedTextComponent({
  text,
  className,
  shimmer = false,
  active = false,
  replayWhileActive = false,
  settleOnStop = false,
}: ThinkingAnimatedTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
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

  const content = shimmer ? (
    <Shimmer
      as="span"
      className="leading-none [--shimmer-base-color:var(--color-muted-foreground)]"
    >
      {text}
    </Shimmer>
  ) : text;

  return (
    <span
      key={`${text}:${active && replayWhileActive ? replayTick : "static"}`}
      className={cn(
        "inline-flex",
        !prefersReducedMotion && "motion-safe:animate-thinking-phrase-soft",
        isSettling && "motion-safe:animate-thinking-label-settle",
        className,
      )}
    >
      {content}
    </span>
  );
}

function ThinkingPhraseLabelComponent({
  active,
  className,
}: ThinkingPhraseLabelProps) {
  const phrase = useRotatingThinkingPhrase(active);
  return <ThinkingAnimatedText text={phrase} shimmer active={active} className={className} />;
}

export const ThinkingAnimatedText = memo(ThinkingAnimatedTextComponent);
export const ThinkingPhraseLabel = memo(ThinkingPhraseLabelComponent);
