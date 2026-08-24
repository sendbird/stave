import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LENS_GUEST_VIEWPORT,
  areLensGuestRectsEqual,
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
      visibility: "visible",
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

  test("hides a parked guest without moving or resizing it", () => {
    // Parking is the case that decides whether an agent-driven session can
    // still answer a screenshot. Moving it offscreen or collapsing it would
    // put it where Chromium throttles frame production.
    const style = resolveLensGuestStyle({ rect: RECT, presented: false });

    expect(style.visibility).toBe("hidden");
    expect(style.pointerEvents).toBe("none");
    expect(style.left).toBe("120px");
    expect(style.top).toBe("64px");
    expect(style.width).toBe("900px");
    expect(style.height).toBe("600px");
  });

  test("never resolves to display:none", () => {
    // Guarded by the type, and asserted anyway: a `display: none` ancestor is
    // the one CSS state that stops a guest compositing altogether, so the
    // style object must have no way to express it.
    for (const presented of [true, false]) {
      const style = resolveLensGuestStyle({ rect: RECT, presented });
      expect(Object.keys(style)).not.toContain("display");
    }
  });

  test("gives an unmeasured guest a real viewport", () => {
    const style = resolveLensGuestStyle({ rect: null, presented: false });

    expect(style.width).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.width}px`);
    expect(style.height).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.height}px`);
    expect(style.visibility).toBe("hidden");
  });

  test("substitutes the default viewport for a degenerate rectangle", () => {
    const style = resolveLensGuestStyle({
      rect: { x: 5, y: 5, width: 0, height: 0 },
      presented: true,
    });

    expect(style.width).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.width}px`);
    expect(style.height).toBe(`${DEFAULT_LENS_GUEST_VIEWPORT.height}px`);
    expect(style.left).toBe("5px");
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
