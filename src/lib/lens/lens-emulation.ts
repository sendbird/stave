/**
 * Appearance emulation for a Lens page.
 *
 * Lets an agent check a dark theme, or a reduced-motion layout, without the
 * user changing their machine's settings — which is the only other way to
 * produce those states and is obviously not something a tool should do.
 *
 * ## Why there is no viewport emulation here
 *
 * There was, and it did not work. `Emulation.setDeviceMetricsOverride` resolves
 * successfully against a Lens guest and then has no effect: a Lens page is an
 * Electron `<webview>`, Electron sizes the guest's widget from the element, and
 * it re-asserts that size over the override. Measured twice against the real
 * product — plain, and with `dontSetVisibleSize: true`, which is the documented
 * way to override layout without touching the widget — and the page reported
 * its element width both times.
 *
 * Emulating the media features below is unaffected, because
 * `Emulation.setEmulatedMedia` does not touch the widget at all. The honest
 * split is therefore to ship what works rather than a viewport parameter that
 * reports success and changes nothing; sizing a DOM-hosted guest is a renderer
 * concern — its element's width — and belongs with the placement code, not here.
 *
 * The policy is pure so the CDP sequence can be tested without a browser, and
 * so the one property that trips people up is stated once: **emulation lives on
 * the CDP session, not on the page.** It survives a navigation and a reload,
 * and it dies with the guest. Lens reports what is in force rather than
 * re-applying it behind the agent's back — a silent re-apply would need CDP
 * approval at a moment nobody asked for anything, and reporting an override the
 * page no longer has is worse than reporting none.
 */

export type LensColorSchemeEmulation = "light" | "dark" | "no-preference";
export type LensReducedMotionEmulation = "reduce" | "no-preference";

export interface LensAppearanceRequest {
  colorScheme?: LensColorSchemeEmulation;
  reducedMotion?: LensReducedMotionEmulation;
  /** Drop every override and return the page to the machine's own settings. */
  reset?: boolean;
}

export interface LensAppearanceState {
  colorScheme: LensColorSchemeEmulation | null;
  reducedMotion: LensReducedMotionEmulation | null;
}

export const EMPTY_LENS_APPEARANCE: LensAppearanceState = {
  colorScheme: null,
  reducedMotion: null,
};

/**
 * Fold a request onto the state a session already has.
 *
 * Incremental on purpose: asking for reduced motion must not silently drop a
 * colour scheme set two calls ago, because the page the agent would then be
 * reading is one no request ever described.
 */
export function resolveLensAppearanceState(
  current: LensAppearanceState,
  request: LensAppearanceRequest,
): LensAppearanceState {
  if (request.reset) {
    return { ...EMPTY_LENS_APPEARANCE };
  }
  return {
    colorScheme: request.colorScheme ?? current.colorScheme,
    reducedMotion: request.reducedMotion ?? current.reducedMotion,
  };
}

export function isLensAppearanceEmpty(state: LensAppearanceState): boolean {
  return state.colorScheme === null && state.reducedMotion === null;
}

/**
 * The CDP call that puts a page into a given appearance state.
 *
 * One command, and it is always sent — including when the state is empty.
 * `Emulation.setEmulatedMedia` has no separate clear: an empty feature list is
 * the reset, and omitting the call would leave the previous override in place
 * for the life of the session.
 */
export function planLensAppearanceCommands(
  state: LensAppearanceState,
): Array<{ method: string; params: Record<string, unknown> }> {
  const features: Array<{ name: string; value: string }> = [];
  if (state.colorScheme) {
    features.push({ name: "prefers-color-scheme", value: state.colorScheme });
  }
  if (state.reducedMotion) {
    features.push({
      name: "prefers-reduced-motion",
      value: state.reducedMotion,
    });
  }
  return [{ method: "Emulation.setEmulatedMedia", params: { features } }];
}
