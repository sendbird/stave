import { layers, elevations } from "./ui-layers.stylex";
import { sx } from "../components/ads/utils/stylex";

export const UI_LAYER_VALUE = {
  /** The Lens guest page. A real DOM element, so everything above wins. */
  lensSurface: 10,
  /**
   * Pane-local Lens chrome that overlaps the guest's rectangle — the loading
   * badge, the load-error strip.
   *
   * Its own band because these used to paint over an empty placeholder and now
   * share a rectangle with an actual page. Still below `resizer`: this is pane
   * content, and a split sash dragged across it stays on top.
   */
  lensPaneChrome: 15,
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
  lensSurface: sx(layers.lensSurface),
  lensPaneChrome: sx(layers.lensPaneChrome),
  resizer: sx(layers.resizer),
  chrome: sx(layers.chrome),
  sessionFloater: sx(layers.sessionFloater),
  floatingChrome: sx(layers.floatingChrome),
  muse: sx(layers.muse),
  dialog: sx(layers.dialog),
  popover: sx(layers.popover),
  appMenu: sx(layers.appMenu),
  lightbox: sx(layers.lightbox),
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
 * Convert a generated layer class into a selector. Escaping remains compatible
 * with older class names held by an already-mounted surface.
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
  surface: sx(elevations.surface),
  raised: sx(elevations.raised),
  floating: sx(elevations.floating),
  modal: sx(elevations.modal),
} as const;
