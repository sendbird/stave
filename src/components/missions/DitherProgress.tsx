import { useEffect, useLayoutEffect, useRef } from "react";
import { Check, Hand, X, type LucideIcon } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import type { StageTone } from "@/lib/missions/mission-view";
import { clampHeadLabel } from "@/lib/missions/stage-progress";
import { subscribeToThemeChanges } from "@/lib/themes/theme-change";
import {
  easeStandard,
  paintDitherProgress,
  PROGRESS_EASE_MS,
  SHIMMER_FRAME_MS,
} from "./dither-progress.paint";
import { ditherProgressStyles as styles, HEAD_TONES, MARK_TONES } from "./dither-progress.styles";

/** `vars[…]` is the string `var(--name)`; the canvas reads the custom property itself. */
const cssVar = (reference: string) => reference.slice(4, -1);

const FILL_TOKENS: Record<StageTone, string> = {
  active: cssVar(vars["--ads-color-accent"]),
  waiting: cssVar(vars["--ads-color-warning"]),
  attention: cssVar(vars["--ads-color-danger"]),
  done: cssVar(vars["--ads-color-success"]),
  idle: cssVar(vars["--ads-color-border-strong"]),
  skipped: cssVar(vars["--ads-color-border-strong"]),
};
const TICK_TOKEN = cssVar(vars["--ads-color-border-strong"]);
const PASSED_TICK_TOKEN = cssVar(vars["--ads-color-text"]);

/** The head's mark: the tone is never carried by color alone. */
const MARKS: Partial<Record<StageTone, { icon: LucideIcon; tone: StyleXValue }>> = {
  waiting: { icon: Hand, tone: MARK_TONES.waiting },
  attention: { icon: X, tone: MARK_TONES.attention },
  done: { icon: Check, tone: MARK_TONES.done },
};

const NO_TICKS: readonly number[] = [];

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A progress track drawn as an ordered-dither fill: sparse where the work
 * started, dense at its head, with a tick at each boundary and a label chip
 * at the head naming what is in progress. The percent follows the track.
 *
 * The canvas is decoration. The element is a `progressbar` with the value and
 * its words, so a caller adds only what the bar cannot say (a list of stages).
 * Motion is opt-in with `live`, and none plays under reduced motion: a value
 * change eases the fill over 250ms, and the newest cells shimmer faintly.
 */
export function DitherProgress(props: {
  /** 0..1. */
  value: number;
  /** Boundaries to mark, 0..1. */
  ticks?: readonly number[];
  tone: StageTone;
  /** What the head names: the stage in progress. */
  label: string;
  /** "3/5", beside the label. */
  count?: string;
  /** "Stage 3 of 5, Verify, running". */
  valueText: string;
  title?: string;
  live?: boolean;
  size?: "sm" | "md";
  showPercent?: boolean;
  "aria-label"?: string;
}) {
  const { value, ticks = NO_TICKS, tone, live = false, size = "sm", showPercent = true } = props;
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<DitherEngine | null>(null);

  useBrowserLayoutEffect(() => {
    const engine = createDitherEngine(canvasRef.current!, headRef.current!);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useBrowserLayoutEffect(() => {
    engineRef.current?.update({ value, ticks, tone, live });
  }, [value, ticks, tone, live]);

  const mark = MARKS[tone];
  return (
    <div className={sx(styles.root)}>
      <div
        role="progressbar"
        aria-label={props["aria-label"] ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={props.valueText}
        title={props.title}
        className={sx(styles.track, size === "md" && styles.trackMd)}
      >
        <canvas ref={canvasRef} aria-hidden className={sx(styles.canvas)} />
        <span ref={headRef} aria-hidden className={sx(styles.head, size === "md" && styles.headMd, HEAD_TONES[tone])}>
          {mark ? (
            <mark.icon aria-hidden strokeWidth={2.5} className={sx(styles.mark, size === "md" && styles.markMd, mark.tone)} />
          ) : null}
          <span className={sx(styles.label)}>{props.label}</span>
          {props.count ? <span className={sx(styles.count)}>{props.count}</span> : null}
        </span>
      </div>
      {showPercent ? (
        <span aria-hidden className={sx(styles.percent)}>
          {percent}%
        </span>
      ) : null}
    </div>
  );
}

interface DitherInput {
  value: number;
  ticks: readonly number[];
  tone: StageTone;
  live: boolean;
}

interface DitherEngine {
  update(input: DitherInput): void;
  dispose(): void;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Owns the canvas outside React: its size (ResizeObserver, device pixels),
 * its colors (read from the custom properties at draw time, re-read on a
 * theme change), the eased head and the shimmer clock. The head label moves
 * with the fill on the same frame, so the two never drift apart.
 */
function createDitherEngine(canvas: HTMLCanvasElement, head: HTMLElement): DitherEngine {
  let input: DitherInput = { value: 0, ticks: NO_TICKS, tone: "active", live: false };
  let shown = Number.NaN;
  let tween: { from: number; to: number; start: number } | null = null;
  let size = { width: 0, height: 0, dpr: 1 };
  let headWidth = head.offsetWidth;
  let colors: { fill: string; tick: string; passedTick: string } | null = null;
  let frame = 0;
  let timer = 0;

  const moving = () => input.live && !prefersReducedMotion();
  const shimmering = () => moving() && input.tone === "active" && shown > 0 && size.width > 0;

  const resolveColors = (context: CanvasRenderingContext2D) => {
    const computed = getComputedStyle(canvas);
    // A value the canvas cannot parse leaves the previous fill; fall back to the text color.
    const read = (token: string) => {
      context.fillStyle = computed.color;
      context.fillStyle = computed.getPropertyValue(token).trim() || computed.color;
      return String(context.fillStyle);
    };
    return { fill: read(FILL_TOKENS[input.tone]), tick: read(TICK_TOKEN), passedTick: read(PASSED_TICK_TOKEN) };
  };

  const draw = (now: number) => {
    if (!size.width || !size.height || Number.isNaN(shown)) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    colors ??= resolveColors(context);
    const width = size.width / size.dpr;
    // Snapped to a device pixel, so the label's text stays crisp while it moves.
    const offset = Math.round(clampHeadLabel(shown * width, headWidth, width) * size.dpr) / size.dpr;
    head.style.transform = `translateX(${offset}px)`;
    paintDitherProgress(context, {
      ...size,
      head: shown,
      ticks: input.ticks,
      label: headWidth > 0 ? [offset * size.dpr, (offset + headWidth) * size.dpr] : null,
      ...colors,
      time: shimmering() ? now : null,
    });
  };

  const render = (now: number) => {
    frame = 0;
    if (tween) {
      const progress = (now - tween.start) / PROGRESS_EASE_MS;
      shown = tween.from + (tween.to - tween.from) * easeStandard(progress);
      if (progress >= 1) {
        shown = tween.to;
        tween = null;
      }
    }
    draw(now);
    loop();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const loop = () => {
    window.clearTimeout(timer);
    if (tween) schedule();
    else if (shimmering()) timer = window.setTimeout(schedule, SHIMMER_FRAME_MS);
  };

  const setSize = (cssWidth: number, cssHeight: number, device?: ResizeObserverSize) => {
    const dpr = window.devicePixelRatio || 1;
    // The device-pixel box is exact where the browser reports it at this ratio
    // (it also fires when the window moves to another display); otherwise round.
    const exact = device && Math.abs(device.inlineSize - cssWidth * dpr) < 2 ? device : null;
    const width = exact?.inlineSize ?? Math.round(cssWidth * dpr);
    const height = exact?.blockSize ?? Math.round(cssHeight * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    size = { width, height, dpr };
  };
  const measure = (entries: readonly ResizeObserverEntry[]) => {
    for (const entry of entries) {
      if (entry.target === head) headWidth = entry.borderBoxSize?.[0]?.inlineSize ?? head.offsetWidth;
      else setSize(entry.contentRect.width, entry.contentRect.height, entry.devicePixelContentBoxSize?.[0]);
    }
    draw(performance.now());
    loop();
  };
  // Sized now, not on the observer's first delivery: the first frame is already right,
  // and a surface mounted while the page renders no frames still has a canvas.
  const box = canvas.getBoundingClientRect();
  setSize(box.width, box.height);
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  try {
    resize?.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    resize?.observe(canvas);
  }
  resize?.observe(head);

  const unsubscribe = subscribeToThemeChanges(() => {
    colors = null;
    schedule();
  });

  return {
    update(next) {
      if (next.tone !== input.tone) colors = null;
      input = next;
      const target = Math.min(1, Math.max(0, next.value));
      if (Number.isNaN(shown)) {
        // The first value appears in place: nothing eases in on mount.
        shown = target;
      } else if (target !== (tween?.to ?? shown)) {
        tween = moving() ? { from: shown, to: target, start: performance.now() } : null;
        if (!tween) shown = target;
      } else if (tween && !moving()) {
        shown = tween.to;
        tween = null;
      }
      draw(performance.now());
      loop();
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      resize?.disconnect();
      unsubscribe();
    },
  };
}
