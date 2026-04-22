import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type ThinkingPhraseAnimationStyle,
  useRotatingThinkingPhrase,
} from "@/lib/thinking-phrases";
import { useAppStore } from "@/store/app.store";
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

const SCRAMBLE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SCRAMBLE_FRAME_MS = 34;
const SCRAMBLE_TOTAL_FRAMES = 10;
const ACTIVE_REPLAY_INTERVAL_MS = 2200;
const SETTLE_DURATION_MS = 220;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function buildScrambleFrame(args: {
  phrase: string;
  revealCount: number;
}) {
  return args.phrase
    .split("")
    .map((char, index) => {
      if (index < args.revealCount || !/[A-Za-z0-9]/.test(char)) {
        return char;
      }
      return SCRAMBLE_ALPHABET[Math.floor(Math.random() * SCRAMBLE_ALPHABET.length)] ?? char;
    })
    .join("");
}

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

function useScrambledPhrase(args: {
  phrase: string;
  enabled: boolean;
}) {
  const { phrase, enabled } = args;
  const [displayPhrase, setDisplayPhrase] = useState(phrase);

  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setDisplayPhrase(phrase);
      return;
    }

    let frame = 0;
    setDisplayPhrase(buildScrambleFrame({ phrase, revealCount: 0 }));

    const intervalId = window.setInterval(() => {
      frame += 1;
      setDisplayPhrase(buildScrambleFrame({
        phrase,
        revealCount: Math.floor((phrase.length * frame) / SCRAMBLE_TOTAL_FRAMES),
      }));

      if (frame >= SCRAMBLE_TOTAL_FRAMES) {
        window.clearInterval(intervalId);
        setDisplayPhrase(phrase);
      }
    }, SCRAMBLE_FRAME_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, phrase]);

  return displayPhrase;
}

function getAnimationClassName(args: {
  animationStyle: ThinkingPhraseAnimationStyle;
  prefersReducedMotion: boolean;
}) {
  if (args.prefersReducedMotion) {
    return "";
  }

  switch (args.animationStyle) {
    case "typewriter":
      return "overflow-hidden whitespace-nowrap motion-safe:animate-thinking-phrase-typewriter";
    case "scramble":
      return "motion-safe:animate-thinking-phrase-soft";
    case "slot":
      return "motion-safe:animate-thinking-phrase-slot";
    case "bounce":
      return "motion-safe:animate-thinking-phrase-bounce";
    case "soft":
    default:
      return "motion-safe:animate-thinking-phrase-soft";
  }
}

function ThinkingAnimatedTextComponent({
  text,
  className,
  shimmer = false,
  active = false,
  replayWhileActive = false,
  settleOnStop = false,
}: ThinkingAnimatedTextProps) {
  const animationStyle = useAppStore((state) => state.settings.thinkingPhraseAnimationStyle);
  const prefersReducedMotion = usePrefersReducedMotion();
  const wasActiveRef = useRef(active);
  const [replayTick, setReplayTick] = useState(0);
  const [isSettling, setIsSettling] = useState(false);
  const displayPhrase = useScrambledPhrase({
    phrase: text,
    enabled: active && animationStyle === "scramble" && !prefersReducedMotion,
  });

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
      {displayPhrase}
    </Shimmer>
  ) : displayPhrase;

  return (
    <span
      key={`${animationStyle}:${text}:${active && replayWhileActive ? replayTick : "static"}`}
      className={cn(
        "inline-flex",
        getAnimationClassName({ animationStyle, prefersReducedMotion }),
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
