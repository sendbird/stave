import type { CSSProperties, ReactNode } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { StyleXValue } from "@/components/ads/utils/stylex";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Shimmer } from "./shimmer";
import { reasoningTextStyles as styles } from "./reasoning-text.styles";

export type ReasoningTextVariant = "cascade" | "swap" | "scramble";

export interface ReasoningTextProps {
  /**
   * Phrase pool. The component renders one phrase at a time, rotating while
   * `active`. Passing the whole pool (rather than a single pre-picked phrase)
   * also lets the width anchor reserve the widest phrase, so rotation never
   * changes the label's inline size.
   */
  phrases?: string[];
  /** Single-phrase shorthand — equivalent to `phrases={[text]}`. */
  text?: string;
  variant?: ReasoningTextVariant;
  /** Rotation interval in ms. Ignored when the pool holds a single phrase. */
  interval?: number;
  active?: boolean;
  /** Optional node rendered before the phrase (spinner, icon, …). */
  indicator?: ReactNode;
  /** Apply the themeable shimmer gradient across the phrase. */
  shimmer?: boolean;
  className?: string;
}

const DEFAULT_INTERVAL_MS = 3_000;
const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#";
const SCRAMBLE_FRAME_MS = 40;
const SCRAMBLE_FRAMES_PER_CHAR = 3;

function longestPhrase(phrases: string[]): string {
  return phrases.reduce(
    (longest, phrase) => (phrase.length > longest.length ? phrase : longest),
    "",
  );
}

/* ─── Phrase body wrapper ─────────────────────────────────────────────
 * When shimmering, the gradient lives on the wrapper so `background-clip: text`
 * clips across the entire phrase — a single highlight sweep — even when the
 * phrase is split into per-character nodes for the cascade.
 *
 * Every variant renders the surface as a block-level `flex` box, never
 * `inline-flex`. An inline surface participates in the parent's line box, and
 * `overflow: hidden` (which the cascade needs to clip its travel) moves an
 * inline box's baseline to its bottom margin edge — that is what pulled the
 * cascade phrase ~3px above the indicator while swap and scramble sat correctly.
 * Block-level flex items are laid out by the grid cell instead, so all three
 * variants land on the same centre line.
 * ─────────────────────────────────────────────────────────────────────── */

function PhraseSurface({
  shimmer,
  textLength,
  surfaceStyle,
  children,
}: {
  shimmer: boolean;
  textLength: number;
  surfaceStyle?: StyleXValue;
  children: ReactNode;
}) {
  if (shimmer) {
    return (
      <Shimmer as="span" textLength={textLength} className={sx(styles.surface, surfaceStyle)}>
        {children}
      </Shimmer>
    );
  }
  return <span className={sx(styles.surface, surfaceStyle)}>{children}</span>;
}

/* ─── Variants ────────────────────────────────────────────────────────── */

function CascadePhrase({ phrase, shimmer }: { phrase: string; shimmer: boolean }) {
  return (
    <PhraseSurface shimmer={shimmer} textLength={phrase.length} surfaceStyle={styles.surfaceClipped}>
      {Array.from(phrase).map((char, index) => (
        <span
          key={`${phrase}-${index}`}
          className={sx(styles.cascadeChar)}
          style={{ "--cascade-i": index } as CSSProperties}
        >
          {char}
        </span>
      ))}
    </PhraseSurface>
  );
}

function SwapPhrase({ phrase, shimmer }: { phrase: string; shimmer: boolean }) {
  /*
   * The entrance animation lives on a wrapper, not on the shimmer element:
   * both would set the `animation` shorthand, and the entrance (declared later)
   * would win and permanently suppress the shimmer sweep. The cascade variant
   * has no such conflict because its animation sits on the per-character spans.
   */
  return (
    <span className={sx(styles.swapPhrase)}>
      <PhraseSurface shimmer={shimmer} textLength={phrase.length}>
        {phrase}
      </PhraseSurface>
    </span>
  );
}

/**
 * Scrambles the phrase and settles it left to right. Driven by
 * `requestAnimationFrame`, so callers must gate it on reduced motion.
 */
function useScrambledPhrase(args: { phrase: string; enabled: boolean }): string {
  const { phrase, enabled } = args;
  const [rendered, setRendered] = useState(phrase);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setRendered(phrase);
      return;
    }

    let frameId = 0;
    let lastFrameAt = 0;
    let elapsedFrames = 0;

    const step = (timestamp: number) => {
      if (timestamp - lastFrameAt >= SCRAMBLE_FRAME_MS) {
        lastFrameAt = timestamp;
        elapsedFrames += 1;

        const settledCount = Math.floor(elapsedFrames / SCRAMBLE_FRAMES_PER_CHAR);
        if (settledCount >= phrase.length) {
          setRendered(phrase);
          return;
        }

        setRendered(
          Array.from(phrase)
            .map((char, index) => {
              if (index < settledCount || char === " ") {
                return char;
              }
              return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)] ?? char;
            })
            .join(""),
        );
      }
      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, phrase]);

  return rendered;
}

function ScramblePhrase({
  phrase,
  shimmer,
  enabled,
}: {
  phrase: string;
  shimmer: boolean;
  enabled: boolean;
}) {
  const rendered = useScrambledPhrase({ phrase, enabled });
  return (
    <PhraseSurface shimmer={shimmer} textLength={phrase.length} surfaceStyle={styles.surfacePre}>
      {rendered}
    </PhraseSurface>
  );
}

/* ─── Component ───────────────────────────────────────────────────────── */

function ReasoningTextComponent({
  phrases,
  text,
  variant = "cascade",
  interval = DEFAULT_INTERVAL_MS,
  active = false,
  indicator,
  shimmer = false,
  className,
}: ReasoningTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const resolvedPhrases = useMemo(() => {
    const source = phrases?.length ? phrases : text != null ? [text] : [];
    return source.length > 0 ? source : ["Thinking"];
  }, [phrases, text]);

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  /* Rotate through the pool while active. */
  useEffect(() => {
    if (!active || resolvedPhrases.length < 2 || typeof window === "undefined") {
      return;
    }
    const intervalId = window.setInterval(() => {
      setIndex((previous) => (previous + 1) % resolvedPhrases.length);
    }, interval);
    return () => window.clearInterval(intervalId);
  }, [active, interval, resolvedPhrases.length]);

  /* Keep the index in range when the pool shrinks. */
  useEffect(() => {
    if (indexRef.current >= resolvedPhrases.length) {
      setIndex(0);
    }
  }, [resolvedPhrases.length]);

  const phrase = resolvedPhrases[index % resolvedPhrases.length] ?? "";
  const widthAnchor = longestPhrase(resolvedPhrases);

  /*
   * Reduced motion collapses every variant to a static phrase: no cascade
   * stagger, no rAF scramble timer, no entrance transform.
   */
  const body = prefersReducedMotion ? (
    <PhraseSurface shimmer={shimmer} textLength={phrase.length}>{phrase}</PhraseSurface>
  ) : variant === "cascade" ? (
    <CascadePhrase key={phrase} phrase={phrase} shimmer={shimmer} />
  ) : variant === "scramble" ? (
    <ScramblePhrase key={phrase} phrase={phrase} shimmer={shimmer} enabled={active} />
  ) : (
    <SwapPhrase key={phrase} phrase={phrase} shimmer={shimmer} />
  );

  return (
    <span className={cx(sx(styles.root), className)}>
      {indicator}
      {/*
       * `lineHeight: 1.25` gives the clip box room for the full glyph box. The
       * previous `leading-none` made it exactly font-size tall, so the cascade's
       * `overflow-hidden` sheared the descenders off `g`, `y`, and `p`.
       */}
      <span className={sx(styles.anchorGrid)}>
        {/* Width anchor — reserves the widest phrase's inline size so rotation
            never resizes the label. Collapses to a no-op for single phrases. */}
        <span aria-hidden="true" className={sx(styles.widthAnchor)}>
          {widthAnchor}
        </span>
        <span className={sx(styles.bodyCell)}>{body}</span>
      </span>
    </span>
  );
}

export const ReasoningText = memo(ReasoningTextComponent);
