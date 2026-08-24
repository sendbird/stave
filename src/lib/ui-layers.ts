export const UI_LAYER_VALUE = {
  lensSurface: 10,
  resizer: 20,
  chrome: 30,
  sessionFloater: 35,
  floatingChrome: 40,
  muse: 60,
  dialog: 80,
  popover: 90,
  appMenu: 100,
  lightbox: 110,
} as const;

export const UI_LAYER_CLASS = {
  lensSurface: "z-10",
  resizer: "z-20",
  chrome: "z-30",
  sessionFloater: "z-[35]",
  floatingChrome: "z-40",
  muse: "z-[60]",
  dialog: "z-[80]",
  popover: "z-[90]",
  appMenu: "z-[100]",
  lightbox: "z-[110]",
} as const;

export type UiLayerName = keyof typeof UI_LAYER_VALUE;

/**
 * The lowest layer that floats above pane content rather than being part of it.
 * Layers at or above this value can overlap an arbitrary pane, so anything that
 * has to yield to them (today: the native Lens view, which the compositor keeps
 * above the whole renderer) must treat the whole band as occluding.
 */
export const UI_LAYER_FLOATING_MIN_VALUE = UI_LAYER_VALUE.sessionFloater;

/**
 * Convert a Tailwind z-index utility class into a CSS class selector.
 * Arbitrary-value utilities (`z-[80]`) carry brackets that have to be escaped
 * before the class can be handed to `querySelector`.
 */
export function uiLayerClassSelector(layerClass: string): string {
  return `.${layerClass.replace(/[[\]]/g, "\\$&")}`;
}

/**
 * Every layer class at or above `minValue`, ordered low to high. Derived from
 * the scale itself so a newly added floating layer is covered by construction
 * instead of by remembering to update a second hand-written list.
 */
export function uiLayerClassesAtOrAbove(
  minValue: number = UI_LAYER_FLOATING_MIN_VALUE,
): string[] {
  return (Object.keys(UI_LAYER_VALUE) as UiLayerName[])
    .filter((name) => UI_LAYER_VALUE[name] >= minValue)
    .sort((left, right) => UI_LAYER_VALUE[left] - UI_LAYER_VALUE[right])
    .map((name) => UI_LAYER_CLASS[name]);
}

/**
 * Elevation is reserved for content that physically floats above the app.
 * Keep the scale intentionally small: anchored controls and blocking surfaces.
 */
export const UI_ELEVATION_CLASS = {
  surface: "shadow-[0_1px_2px_oklch(0_0_0/0.07)]",
  raised:
    "shadow-[0_12px_32px_-16px_oklch(0_0_0/0.22),0_2px_8px_-3px_oklch(0_0_0/0.12)]",
  floating:
    "shadow-[0_18px_48px_-18px_oklch(0_0_0/0.28),0_4px_12px_-5px_oklch(0_0_0/0.16)]",
  modal:
    "shadow-[0_32px_80px_-24px_oklch(0_0_0/0.38),0_8px_24px_-8px_oklch(0_0_0/0.22)]",
} as const;
