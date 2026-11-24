import * as React from "react";

import {
  LIVE_BREATH_KEYFRAMES,
  LIVE_BREATH_TEXT_KEYFRAMES,
} from "../recipes/live-breath-keyframes";

/**
 * Runtime half of the placeholder recipe in `skeleton-motion.css`.
 *
 * A CSS animation starts when its element is styled, so two skeletons mounted
 * 300ms apart pulse 300ms apart, and a page that streams its regions in ends
 * up with every placeholder at a different point of the breath — the
 * shimmering-confetti look the 2026-11 audit measured (an 800ms phase split
 * inside one chart card). The cure is to share one clock: every pulse gets the
 * document timeline's zero as its start time, so all of them sit at the same
 * phase whenever they mount. The show delay (`atelier-skeleton-show`) is a
 * separate animation and keeps its own start, so a fresh placeholder still
 * waits 120ms and fades in.
 *
 * The live breath (`recipes/live-breath.ts`, 2026-11-15) shares the same
 * clock for the same reason: a live track and a live point in one card, or
 * five running rows in one list, breathe as one.
 */

/** Keyframes every placeholder pulse runs. Kept in step with the stylesheet. */
export const SKELETON_PULSE_KEYFRAMES = "atelier-skeleton-pulse";

/** Every looping keyframe pinned to the document timeline's zero. */
const PHASE_LOCKED_KEYFRAMES = new Set<string>([
  SKELETON_PULSE_KEYFRAMES,
  LIVE_BREATH_KEYFRAMES,
  LIVE_BREATH_TEXT_KEYFRAMES,
]);

/** Class that paints a placeholder (`::after`, `skeleton-motion.css`). */
export const SKELETON_CLASS = "atelier-motion-skeleton";

/** Class that fades content in once when it replaces a placeholder. */
export const SKELETON_ARRIVE_CLASS = "atelier-motion-arrive";

/** Class that holds an indicator back for the same 120ms show delay. */
export const SKELETON_SHOW_DELAYED_CLASS = "atelier-motion-show-delayed";

type NamedAnimation = Animation & { animationName?: string };

/**
 * Pin one pulse or live breath to the shared clock. Idempotent; ignores
 * everything else.
 */
export function lockSkeletonAnimation(animation: NamedAnimation): boolean {
  if (!PHASE_LOCKED_KEYFRAMES.has(animation.animationName ?? "")) return false;
  if (animation.startTime === 0) return false;
  animation.startTime = 0;
  return true;
}

const lockedDocuments = new WeakSet<Document>();

/**
 * Phase-lock every skeleton pulse in `doc`, now and as new ones start. One
 * capture listener per document, installed on first use and never removed —
 * it costs one string comparison per `animationstart`.
 */
export function lockSkeletonPhase(doc: Document) {
  if (lockedDocuments.has(doc)) return;
  lockedDocuments.add(doc);
  doc.addEventListener(
    "animationstart",
    (event) => {
      if (!PHASE_LOCKED_KEYFRAMES.has(event.animationName)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      for (const animation of target.getAnimations({ subtree: true })) {
        const effect = animation.effect as KeyframeEffect | null;
        if (effect?.target === target) lockSkeletonAnimation(animation);
      }
    },
    true,
  );
  // Pulses that started before the listener existed.
  for (const animation of doc.getAnimations()) lockSkeletonAnimation(animation);
}

/** Install the phase lock from any component that paints a placeholder. */
export function useSkeletonPhaseLock(active = true) {
  React.useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (typeof document.getAnimations !== "function") return;
    lockSkeletonPhase(document);
  }, [active]);
}

/**
 * Install the same lock from any component that composes `liveBreath`, so
 * every live part on the page breathes on one clock.
 */
export function useLivePhaseLock(active = true) {
  useSkeletonPhaseLock(active);
}

/**
 * True from the first render after `loading` falls back to false, once it has
 * been true at least once — the moment content replaces a placeholder and
 * should fade in (`SKELETON_ARRIVE_CLASS`). Content that was ready from the
 * first render never fades: there was nothing on screen to cross from.
 *
 * Derived during render (the "store information from previous renders"
 * pattern), so the class is on the content's first commit and the fade starts
 * with it — an effect would land one frame late, after the content painted.
 */
export function useSkeletonArrival(loading: boolean): boolean {
  const [seenLoading, setSeenLoading] = React.useState(loading);
  if (loading && !seenLoading) setSeenLoading(true);
  return !loading && seenLoading;
}
