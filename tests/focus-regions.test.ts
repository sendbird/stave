import { describe, expect, test } from "bun:test";
import {
  findAppKeybindingCandidates,
  type AppKeybindingEvent,
} from "../src/components/layout/app-keybinding-dispatch";
import {
  EDITABLE_SHORTCUT_SELECTOR,
  PROMPT_INPUT_ROOT_SELECTOR,
  TERMINAL_SURFACE_SELECTOR,
} from "../src/components/layout/app-shell.shortcuts";
import { nextFocusRegionIndex } from "../src/components/layout/focus-regions";

function target(matches: string[] = [], isContentEditable = false) {
  const set = new Set(matches);
  return {
    isContentEditable,
    closest: (selector: string) => (set.has(selector) ? ({} as Element) : null),
  } as unknown as EventTarget;
}

function candidates(
  init: { key: string; shiftKey?: boolean; target?: EventTarget },
  appSurfaceKind = "workspace",
) {
  const event: AppKeybindingEvent = {
    code: init.key,
    target: target(),
    ...init,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
  return findAppKeybindingCandidates(event, { appSurfaceKind }).map((entry) => entry.id);
}

describe("F6 region order", () => {
  test("steps forward and back, wrapping at either end", () => {
    // sidebar, top bar, main, rail
    expect(nextFocusRegionIndex(4, 0, 1)).toBe(1);
    expect(nextFocusRegionIndex(4, 3, 1)).toBe(0);
    expect(nextFocusRegionIndex(4, 0, -1)).toBe(3);
    expect(nextFocusRegionIndex(4, 2, -1)).toBe(1);
  });

  test("from outside every region, F6 starts at the first and Shift+F6 at the last", () => {
    expect(nextFocusRegionIndex(4, -1, 1)).toBe(0);
    expect(nextFocusRegionIndex(4, -1, -1)).toBe(3);
    expect(nextFocusRegionIndex(0, -1, 1)).toBe(-1);
  });
});

describe("F6 dispatch", () => {
  test("F6 and Shift+F6 run on the workspace and on global views", () => {
    expect(candidates({ key: "F6" })).toEqual(["navigation.next-region"]);
    expect(candidates({ key: "F6", shiftKey: true })).toEqual(["navigation.previous-region"]);
    expect(candidates({ key: "F6" }, "fleet-view")).toEqual(["navigation.next-region"]);
  });

  test("they are the way out of a field, the composer and the terminal included", () => {
    for (const focus of [
      target([EDITABLE_SHORTCUT_SELECTOR]),
      target([PROMPT_INPUT_ROOT_SELECTOR], true),
      target([EDITABLE_SHORTCUT_SELECTOR, TERMINAL_SURFACE_SELECTOR]),
    ]) {
      expect(candidates({ key: "F6", target: focus })).toEqual(["navigation.next-region"]);
    }
  });
});
