import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LENS_GUEST_VIEWPORT,
  areLensGuestRectsEqual,
  isLensGuestVisuallyPresented,
  isMeasurableLensGuestRect,
  resolveLensGuestStyle,
} from "../src/lib/lens/lens-guest-placement";

const RECT = { x: 120, y: 64, width: 900, height: 600 };

describe("Lens guest placement", () => {
  test("puts a presented guest at the measured rectangle, unscaled", () => {
    // No zoom factor, no device-pixel conversion, no inward rounding: the
    // guest is a DOM element in the same coordinate space as the placeholder
    // that was measured, so the numbers travel verbatim.
    expect(resolveLensGuestStyle({ rect: RECT, presented: true })).toEqual({
      left: "120px",
      top: "64px",
      width: "900px",
      height: "600px",
      opacity: "1",
      pointerEvents: "auto",
    });
  });

  test("keeps fractional CSS pixels intact", () => {
    const style = resolveLensGuestStyle({
      rect: { x: 10.5, y: 20.25, width: 300.75, height: 100.5 },
      presented: true,
    });
    expect(style.left).toBe("10.5px");
    expect(style.width).toBe("300.75px");
  });

  test("hides a parked guest without moving, resizing, or uncompositing it", () => {
    // Parking is the case that decides whether an agent-driven session can
    // still answer a screenshot. Moving it offscreen or collapsing it would
    // put it where Chromium throttles frame production; `visibility: hidden`
    // would stop it producing a frame at all, and `Page.captureScreenshot`
    // then fails outright. Measured in
    // tests/e2e-electron/lens-parked-guest-agent-path.electron.e2e.ts.
    const style = resolveLensGuestStyle({ rect: RECT, presented: false });

    expect(style.opacity).toBe("0");
    expect(style.pointerEvents).toBe("none");
    expect(style.left).toBe("120px");
    expect(style.top).toBe("64px");
    expect(style.width).toBe("900px");
    expect(style.height).toBe("600px");
  });

  test("never resolves to a state Chromium refuses to composite", () => {
    // Guarded by the type, and asserted anyway. `display: none` and
    // `visibility: hidden` are the two CSS states that stop a guest producing
    // a compositor frame, and a guest with no frame cannot answer
    // `Page.captureScreenshot` — which is the whole agent path. The style
    // object must have no way to express either.
    for (const presented of [true, false]) {
      const style = resolveLensGuestStyle({ rect: RECT, presented });
      expect(Object.keys(style)).not.toContain("display");
      expect(Object.keys(style)).not.toContain("visibility");
    }
  });

  test("gives an unmeasured guest a real viewport", () => {
    const style = resolveLensGuestStyle({ rect: null, presented: false });

    expect(style.width).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.width}px`);
    expect(style.height).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.height}px`);
    expect(style.opacity).toBe("0");
  });

  test("substitutes the default viewport for a degenerate rectangle", () => {
    const style = resolveLensGuestStyle({
      rect: { x: 5, y: 5, width: 0, height: 0 },
      presented: true,
    });

    expect(style.width).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.width}px`);
    expect(style.height).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.height}px`);
    expect(style.left).toBe("5px");
    expect(style.opacity).toBe("0");
    expect(style.pointerEvents).toBe("none");
  });

  test("never reveals a guest that has no measured rectangle", () => {
    const style = resolveLensGuestStyle({ rect: null, presented: true });

    expect(style.width).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.width}px`);
    expect(style.height).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.height}px`);
    expect(style.left).toBe("0px");
    expect(style.top).toBe("0px");
    expect(style.opacity).toBe("0");
    expect(style.pointerEvents).toBe("none");
    expect(isLensGuestVisuallyPresented({ rect: null, presented: true })).toBe(
      false,
    );
    expect(isLensGuestVisuallyPresented({ rect: RECT, presented: true })).toBe(
      true,
    );
    expect(isLensGuestVisuallyPresented({ rect: RECT, presented: false })).toBe(
      false,
    );
  });

  test("does not adopt a rectangle measured while collapsed or torn down", () => {
    expect(isMeasurableLensGuestRect(RECT)).toBe(true);
    expect(isMeasurableLensGuestRect(null)).toBe(false);
    expect(
      isMeasurableLensGuestRect({ x: 0, y: 0, width: 0, height: 600 }),
    ).toBe(false);
    expect(
      isMeasurableLensGuestRect({ x: 0, y: 0, width: 900, height: 0 }),
    ).toBe(false);
    expect(
      isMeasurableLensGuestRect({
        x: 0,
        y: 0,
        width: Number.NaN,
        height: 600,
      }),
    ).toBe(false);
  });

  test("compares rectangles by value so unchanged layout writes nothing", () => {
    expect(areLensGuestRectsEqual(RECT, { ...RECT })).toBe(true);
    expect(areLensGuestRectsEqual(RECT, { ...RECT, x: 121 })).toBe(false);
    expect(areLensGuestRectsEqual(null, null)).toBe(true);
    expect(areLensGuestRectsEqual(RECT, null)).toBe(false);
  });
});
