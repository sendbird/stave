import { describe, expect, test } from "bun:test";
import {
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  nextZoomFactor,
  zoomActionFromInput,
} from "../electron/main/zoom-shortcut";

type Input = Parameters<typeof zoomActionFromInput>[0];

function keyDown(overrides: Partial<Input>): Input {
  return {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...overrides,
  };
}

describe("zoomActionFromInput", () => {
  test("maps Cmd and Ctrl with +, -, 0 and numpad keys", () => {
    expect(zoomActionFromInput(keyDown({ meta: true, key: "=", code: "Equal" }))).toBe("in");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "+", code: "Equal", shift: true }))).toBe("in");
    expect(zoomActionFromInput(keyDown({ control: true, key: "=", code: "Equal" }))).toBe("in");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "-", code: "Minus" }))).toBe("out");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "0", code: "Digit0" }))).toBe("reset");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "+", code: "NumpadAdd" }))).toBe("in");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "-", code: "NumpadSubtract" }))).toBe("out");
    expect(zoomActionFromInput(keyDown({ meta: true, key: "0", code: "Numpad0" }))).toBe("reset");
  });

  test("ignores keys without the modifier, with Alt, or on key up", () => {
    expect(zoomActionFromInput(keyDown({ key: "=", code: "Equal" }))).toBeNull();
    expect(zoomActionFromInput(keyDown({ meta: true, alt: true, key: "=", code: "Equal" }))).toBeNull();
    expect(zoomActionFromInput(keyDown({ type: "keyUp", meta: true, key: "=", code: "Equal" }))).toBeNull();
    expect(zoomActionFromInput(keyDown({ meta: true, key: "w", code: "KeyW" }))).toBeNull();
  });
});

describe("nextZoomFactor", () => {
  test("steps by 0.1 and rounds away float drift", () => {
    expect(nextZoomFactor(1, "in")).toBe(1.1);
    expect(nextZoomFactor(1.1, "out")).toBe(1);
    expect(nextZoomFactor(1.2, "in")).toBe(1.3);
  });

  test("reset always returns to 1", () => {
    expect(nextZoomFactor(1.7, "reset")).toBe(1);
  });

  test("clamps at the bounds on both ends", () => {
    expect(nextZoomFactor(MAX_ZOOM_FACTOR, "in")).toBe(MAX_ZOOM_FACTOR);
    expect(nextZoomFactor(MIN_ZOOM_FACTOR, "out")).toBe(MIN_ZOOM_FACTOR);
    expect(nextZoomFactor(1.95, "in")).toBe(MAX_ZOOM_FACTOR);
  });
});
