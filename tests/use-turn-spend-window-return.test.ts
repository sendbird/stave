import { describe, expect, test } from "bun:test";
import { watchWindowReturn } from "../src/lib/providers/use-turn-spend";

function fakeWindowAndDocument() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  return { win, doc };
}

describe("spend refresh on window return", () => {
  test("focus refreshes, and a return that fires visibilitychange and focus together refreshes once", () => {
    const { win, doc } = fakeWindowAndDocument();
    let at = 0;
    let returns = 0;
    const unwatch = watchWindowReturn({
      window: win as unknown as Window,
      document: doc as unknown as Document,
      onReturn: () => {
        returns += 1;
      },
      now: () => at,
    });

    win.dispatchEvent(new Event("focus"));
    expect(returns).toBe(1);

    at = 60_000;
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    expect(returns).toBe(2);

    // Hidden is not a return.
    at = 120_000;
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(returns).toBe(2);

    unwatch();
    doc.visibilityState = "visible";
    at = 180_000;
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(returns).toBe(2);
  });
});
