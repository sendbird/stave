/**
 * How a Lens panel presents the guest page for its session.
 *
 * Deliberately none of these members describe *how* the guest is hosted. The
 * panel says where the page goes (`placeholderRef`), when a guest exists
 * (`attachGuest` / `detachGuest`), where chrome that must paint over the page
 * goes (`chromeLayer`), and when its own chrome needs the space
 * (`setFloatingSurfaceOpen`). Everything else — whether presenting means an IPC
 * round trip or a style write, whether "chrome is up" means anything at all —
 * is the implementation's business.
 *
 * This is what makes the rendering-model change a second implementation of one
 * interface rather than another edit to the panel. The interface lives on its
 * own so neither implementation owns it.
 */
export type LensSurfaceHostHandle = {
  /**
   * Rectangle the panel renders for the guest page to occupy.
   *
   * A ref *callback*, not a ref object: the panel replaces this element every
   * time it leaves and re-enters the Preview tab, and a host that only learns
   * about the first one tracks a node that is no longer in the document.
   */
  placeholderRef: (element: HTMLDivElement | null) => void;
  /**
   * Where to portal pane chrome that has to be seen over the page — a loading
   * badge, a load-error strip.
   *
   * It cannot simply be rendered in the pane with a high `z-index`: Dockview
   * renders keep-alive panels inside `.dv-render-overlay`, which is an isolated
   * stacking context of its own, so pane-local layering is capped below the
   * guest plane no matter what number it asks for. `null` until a guest exists.
   */
  chromeLayer: HTMLElement | null;
  /**
   * Whether this panel is showing the page right now.
   *
   * Session recovery needs it: a session reclaimed by the hidden-guest cap must
   * be rebuilt when the user looks at its tab, not the instant it is reclaimed —
   * rebuilding immediately would put the guest straight back over the cap and
   * evict something else, indefinitely.
   */
  isPresented: boolean;
  /**
   * A guest now exists for this session and may be presented. Resolves once the
   * host has told the guest whether it is on screen, so callers can serialize
   * later session work behind it.
   */
  attachGuest: () => Promise<void>;
  /** The panel is going away or its session is being replaced. */
  detachGuest: () => void;
  /**
   * Panel-owned chrome that overlaps the preview is opening or closing.
   *
   * Only meaningful while the guest cannot be painted under DOM content; a
   * host whose guest is a DOM element ignores it.
   */
  setFloatingSurfaceOpen: (open: boolean) => void;
};
