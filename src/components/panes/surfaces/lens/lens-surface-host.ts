import type { RefObject } from "react";

/**
 * How a Lens panel presents the guest page for its session.
 *
 * Four members, and deliberately none of them describe *how* the guest is
 * hosted. The panel says where the page goes (`placeholderRef`), when a guest
 * exists (`attachGuest` / `detachGuest`), and when its own chrome needs the
 * space (`setFloatingSurfaceOpen`). Everything else — whether presenting means
 * an IPC round trip or a style write, whether "chrome is up" means anything at
 * all — is the implementation's business.
 *
 * This is what makes the rendering-model change a second implementation of one
 * interface rather than another edit to the panel. The interface lives on its
 * own so neither implementation owns it.
 */
export type LensSurfaceHostHandle = {
  /** Rectangle the panel renders for the guest page to occupy. */
  placeholderRef: RefObject<HTMLDivElement | null>;
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
