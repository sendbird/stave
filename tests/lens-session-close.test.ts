import { describe, expect, test } from "bun:test";
import {
  resolveLensSessionCloseRecovery,
  shouldCloseLensTabOnSessionClose,
} from "../src/lib/lens/lens-session-close";

describe("shouldCloseLensTabOnSessionClose", () => {
  test("a deliberate close takes the tab with it", () => {
    expect(shouldCloseLensTabOnSessionClose("closed")).toBe(true);
  });

  test("a payload with no reason is treated as a deliberate close", () => {
    // Older builds only ever emitted this event for a deliberate teardown.
    expect(shouldCloseLensTabOnSessionClose(undefined)).toBe(true);
  });

  test("a crashed guest leaves the tab in place", () => {
    // This is the regression: dropping the tab here made a page crash look like
    // a Lens pane that silently vanished, and it raced the panel's own rebuild.
    expect(shouldCloseLensTabOnSessionClose("guest-gone")).toBe(false);
  });

  test("an evicted guest leaves the tab in place", () => {
    expect(shouldCloseLensTabOnSessionClose("evicted")).toBe(false);
  });
});

describe("resolveLensSessionCloseRecovery", () => {
  test("a deliberate close recovers nothing", () => {
    expect(
      resolveLensSessionCloseRecovery({ reason: "closed", isPresented: true }),
    ).toBe("none");
    expect(
      resolveLensSessionCloseRecovery({ reason: undefined, isPresented: true }),
    ).toBe("none");
  });

  test("a crashed guest rebuilds immediately, presented or not", () => {
    // The panel is still on screen with nothing behind it either way; the
    // bounded budget is what stops a page that dies on every load.
    expect(
      resolveLensSessionCloseRecovery({
        reason: "guest-gone",
        isPresented: true,
      }),
    ).toBe("rebuild-now");
    expect(
      resolveLensSessionCloseRecovery({
        reason: "guest-gone",
        isPresented: false,
      }),
    ).toBe("rebuild-now");
  });

  test("an eviction under a hidden panel defers until it is presented", () => {
    // Rebuilding a session nobody is looking at puts it straight back over the
    // hidden-guest cap, which evicts a different one — indefinitely.
    expect(
      resolveLensSessionCloseRecovery({
        reason: "evicted",
        isPresented: false,
      }),
    ).toBe("rebuild-when-presented");
  });

  test("an eviction that raced a panel becoming visible rebuilds now", () => {
    expect(
      resolveLensSessionCloseRecovery({ reason: "evicted", isPresented: true }),
    ).toBe("rebuild-now");
  });
});
