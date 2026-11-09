import { domMax, LazyMotion, MotionConfig } from "motion/react";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether motion is being *force-played* — the docs/showcase mode that ignores
 * the OS "Reduce Motion" setting so every transition stays demoable. Defaults to
 * `false`; shipped product respects the user. (Decision D=b.)
 */
const ForcePlayContext = createContext(false);

export function useMotionForcePlay(): boolean {
  return useContext(ForcePlayContext);
}

export type AtelierMotionProviderProps = {
  children: ReactNode;
  /**
   * Force motion to play even when the user enabled OS "Reduce Motion".
   * Use ONLY in docs/showcase surfaces, never in shipped product. (Decision D=b.)
   * @default false
   */
  forcePlay?: boolean;
};

/**
 * Root provider for Atelier's JS motion layer (Motion / `motion`).
 *
 * - `LazyMotion` + `domMax`: tree-shakeable feature bundle that still includes
 *   layout (`layout` / `layoutId`) and drag/pan gestures. `strict` forbids the
 *   full `motion.*` components, so callers must use `m.*` — which keeps the
 *   shipped bundle small.
 * - `MotionConfig reducedMotion`: `"user"` respects the OS setting (shipped
 *   default); `"never"` force-plays for docs. This single switch implements
 *   reduced-motion policy D=b across the whole JS layer.
 *
 * Mount once near the app root. Components degrade gracefully without it: an
 * `m.*` element outside `LazyMotion` renders statically (motion just doesn't
 * play), which matches the reduced-motion fallback.
 */
export function AtelierMotionProvider({
  children,
  forcePlay = false,
}: AtelierMotionProviderProps) {
  return (
    <ForcePlayContext.Provider value={forcePlay}>
      <MotionConfig reducedMotion={forcePlay ? "never" : "user"}>
        <LazyMotion features={domMax} strict>
          {children}
        </LazyMotion>
      </MotionConfig>
    </ForcePlayContext.Provider>
  );
}
