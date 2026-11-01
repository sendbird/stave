import { describe, expect, test } from "bun:test";
import {
  correctAnchorScrollTop,
  findDisclosureTrigger,
  shouldFollowAfterDisclosureToggle,
} from "@/components/ai-elements/conversation-scroll-anchor";

describe("correctAnchorScrollTop", () => {
  test("scrolls by the trigger's drift so it returns to its pre-click position", () => {
    // The audit case: the trace opened and the trigger went from y=142 to y=-315.
    expect(
      correctAnchorScrollTop({ scrollTop: 900, anchorTopBefore: 142, anchorTopNow: -315, maxScrollTop: 2_000 }),
    ).toBe(443);
    expect(
      correctAnchorScrollTop({ scrollTop: 400, anchorTopBefore: 142, anchorTopNow: 202, maxScrollTop: 2_000 }),
    ).toBe(460);
  });

  test("leaves the position alone when the trigger did not move", () => {
    expect(
      correctAnchorScrollTop({ scrollTop: 321, anchorTopBefore: 142, anchorTopNow: 142.3, maxScrollTop: 2_000 }),
    ).toBe(321);
  });

  test("clamps to the container's scroll range", () => {
    expect(
      correctAnchorScrollTop({ scrollTop: 50, anchorTopBefore: 300, anchorTopNow: 100, maxScrollTop: 2_000 }),
    ).toBe(0);
    expect(
      correctAnchorScrollTop({ scrollTop: 900, anchorTopBefore: 100, anchorTopNow: 400, maxScrollTop: 1_000 }),
    ).toBe(1_000);
    expect(
      correctAnchorScrollTop({ scrollTop: 0, anchorTopBefore: 100, anchorTopNow: 400, maxScrollTop: -20 }),
    ).toBe(0);
  });
});

describe("shouldFollowAfterDisclosureToggle", () => {
  test("never resumes following for a reader who was scrolled up", () => {
    for (const atBottomNow of [true, false]) {
      for (const expandedNow of [true, false]) {
        expect(shouldFollowAfterDisclosureToggle({ wasAtBottom: false, atBottomNow, expandedNow })).toBe(false);
      }
    }
  });

  test("stops following when an opened panel now runs below the view", () => {
    expect(shouldFollowAfterDisclosureToggle({ wasAtBottom: true, atBottomNow: false, expandedNow: true })).toBe(false);
  });

  test("keeps following when the reader stays at the bottom or collapsed the panel", () => {
    expect(shouldFollowAfterDisclosureToggle({ wasAtBottom: true, atBottomNow: true, expandedNow: true })).toBe(true);
    expect(shouldFollowAfterDisclosureToggle({ wasAtBottom: true, atBottomNow: false, expandedNow: false })).toBe(true);
  });
});

describe("findDisclosureTrigger", () => {
  class FakeElement {
    constructor(
      private readonly attributes: Record<string, string>,
      private readonly ancestor: FakeElement | null = null,
    ) {}
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    }
    closest(selector: string): FakeElement | null {
      expect(selector).toBe("[aria-expanded]");
      if ("aria-expanded" in this.attributes) return this;
      return this.ancestor?.closest(selector) ?? null;
    }
  }
  const asElement = (value: FakeElement) => value as unknown as Element;
  const originalElement = globalThis.Element;

  function withFakeElement(run: () => void) {
    (globalThis as { Element?: unknown }).Element = FakeElement;
    try {
      run();
    } finally {
      (globalThis as { Element?: unknown }).Element = originalElement;
    }
  }

  test("finds the disclosure button a click landed inside", () => {
    withFakeElement(() => {
      const trigger = new FakeElement({ "aria-expanded": "false" });
      const label = new FakeElement({}, trigger);
      const container = { contains: (node: unknown) => node === trigger } as unknown as HTMLElement;
      expect(findDisclosureTrigger(asElement(label), container)).toBe(asElement(trigger) as HTMLElement);
    });
  });

  test("ignores menu, listbox and dialog triggers and clicks outside the transcript", () => {
    withFakeElement(() => {
      const inside = { contains: () => true } as unknown as HTMLElement;
      const outside = { contains: () => false } as unknown as HTMLElement;
      for (const popup of ["menu", "listbox", "dialog", "true"]) {
        const menu = new FakeElement({ "aria-expanded": "false", "aria-haspopup": popup });
        expect(findDisclosureTrigger(asElement(menu), inside)).toBeNull();
      }
      const disclosure = new FakeElement({ "aria-expanded": "true", "aria-haspopup": "false" });
      expect(findDisclosureTrigger(asElement(disclosure), inside)).toBe(asElement(disclosure) as HTMLElement);
      expect(findDisclosureTrigger(asElement(disclosure), outside)).toBeNull();
      expect(findDisclosureTrigger(asElement(new FakeElement({})), inside)).toBeNull();
      expect(findDisclosureTrigger(null, inside)).toBeNull();
    });
  });
});
