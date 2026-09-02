import { describe, expect, test } from "bun:test";
import { UI_LAYER_CLASS, UI_LAYER_VALUE } from "@/lib/ui-layers";

describe("ui layer ordering", () => {
  test("keeps resize handles below overlays and popovers", () => {
    expect(UI_LAYER_VALUE.resizer).toBeLessThan(UI_LAYER_VALUE.dialog);
    expect(UI_LAYER_VALUE.dialog).toBeLessThan(UI_LAYER_VALUE.popover);
    expect(UI_LAYER_VALUE.popover).toBeLessThan(UI_LAYER_VALUE.lightbox);
  });

  test("keeps anchored composer chrome below the dialog band", () => {
    // The composer control tray hosts triggers that open dialogs (Review,
    // Advisor, Compare). Base UI portals a nested dialog into the tray's own
    // portal node, so a tray above the dialog band paints over the dialog it
    // just opened.
    expect(UI_LAYER_VALUE.floatingChrome).toBeLessThan(UI_LAYER_VALUE.dialog);
  });

  test("keeps muse above chrome but below modal surfaces", () => {
    expect(UI_LAYER_VALUE.chrome).toBeLessThan(UI_LAYER_VALUE.muse);
    expect(UI_LAYER_VALUE.muse).toBeLessThan(UI_LAYER_VALUE.dialog);
  });

  test("keeps the full-screen lightbox above every other UI layer", () => {
    expect(UI_LAYER_VALUE.appMenu).toBeLessThan(UI_LAYER_VALUE.lightbox);
    expect(UI_LAYER_VALUE.popover).toBeLessThan(UI_LAYER_VALUE.lightbox);
    expect(UI_LAYER_VALUE.dialog).toBeLessThan(UI_LAYER_VALUE.lightbox);
  });

  test("puts Lens pane chrome above the guest page but below the sash", () => {
    // A Lens guest is a DOM element now, so pane content that overlaps its
    // rectangle has to be raised above it explicitly or the page paints over
    // the loading badge and the load-error strip.
    expect(UI_LAYER_VALUE.lensSurface).toBeLessThan(
      UI_LAYER_VALUE.lensPaneChrome,
    );
    expect(UI_LAYER_VALUE.lensPaneChrome).toBeLessThan(UI_LAYER_VALUE.resizer);
  });

  test("exposes stable class names for shared surfaces", () => {
    expect(UI_LAYER_CLASS.resizer).toBe("z-20");
    expect(UI_LAYER_CLASS.dialog).toBe("z-[80]");
    expect(UI_LAYER_CLASS.popover).toBe("z-[90]");
    expect(UI_LAYER_CLASS.appMenu).toBe("z-[100]");
    expect(UI_LAYER_CLASS.lightbox).toBe("z-[110]");
  });
});
