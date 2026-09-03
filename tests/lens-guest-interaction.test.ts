import { describe, expect, test } from "bun:test";
import {
  createLensGuestPointerPassthroughTracker,
  createLensGuestPresenterRegistry,
  isLensGuestPointerTarget,
  shouldParkLensGuestForWorkspace,
} from "../src/lib/lens/lens-guest-interaction";

describe("Lens guest workspace parking", () => {
  test("parks a presented guest when its workspace is no longer active", () => {
    expect(
      shouldParkLensGuestForWorkspace({
        guestWorkspaceId: "ws-alpha",
        activeWorkspaceId: "ws-beta",
        presented: true,
        hasPresenter: true,
      }),
    ).toBe(true);
  });

  test("leaves a guest in the active workspace alone", () => {
    expect(
      shouldParkLensGuestForWorkspace({
        guestWorkspaceId: "ws-alpha",
        activeWorkspaceId: "ws-alpha",
        presented: true,
        hasPresenter: true,
      }),
    ).toBe(false);
  });

  test("does not touch a guest that is already parked", () => {
    expect(
      shouldParkLensGuestForWorkspace({
        guestWorkspaceId: "ws-alpha",
        activeWorkspaceId: "ws-beta",
        presented: false,
        hasPresenter: true,
      }),
    ).toBe(false);
  });

  test("parks every presented guest when no workspace is active", () => {
    expect(
      shouldParkLensGuestForWorkspace({
        guestWorkspaceId: "ws-alpha",
        activeWorkspaceId: null,
        presented: true,
        hasPresenter: true,
      }),
    ).toBe(true);
  });

  test("parks a presented guest in the active workspace once no panel claims it", () => {
    expect(
      shouldParkLensGuestForWorkspace({
        guestWorkspaceId: "ws-alpha",
        activeWorkspaceId: "ws-alpha",
        presented: true,
        hasPresenter: false,
      }),
    ).toBe(true);
  });
});

describe("Lens guest presenter registry", () => {
  test("a claim is visible until its release", () => {
    const registry = createLensGuestPresenterRegistry();
    const release = registry.claim("ws-alpha\u0000default");
    expect(registry.has("ws-alpha\u0000default")).toBe(true);
    expect(release()).toBe(true);
    expect(registry.has("ws-alpha\u0000default")).toBe(false);
  });

  test("a superseded claim's release neither parks nor reports ownership", () => {
    const registry = createLensGuestPresenterRegistry();
    const releaseFirst = registry.claim("ws-beta\u0000default");
    const releaseSecond = registry.claim("ws-beta\u0000default");
    expect(releaseFirst()).toBe(false);
    expect(registry.has("ws-beta\u0000default")).toBe(true);
    expect(releaseSecond()).toBe(true);
    expect(registry.has("ws-beta\u0000default")).toBe(false);
  });

  test("claims are per guest key", () => {
    const registry = createLensGuestPresenterRegistry();
    registry.claim("ws-alpha\u0000default");
    expect(registry.has("ws-beta\u0000default")).toBe(false);
  });
});

describe("Lens guest pointer targeting", () => {
  test("treats the guest page as a guest hit", () => {
    expect(isLensGuestPointerTarget({ tagName: "WEBVIEW" })).toBe(true);
    expect(isLensGuestPointerTarget({ tagName: "webview" })).toBe(true);
  });

  test("treats over-the-page chrome as a guest hit", () => {
    expect(
      isLensGuestPointerTarget({
        tagName: "DIV",
        closest: (selector) =>
          selector === "[data-lens-guest-chrome]" ? {} : null,
      }),
    ).toBe(true);
  });

  test("lets host chrome start a drag that must ignore the guest", () => {
    expect(
      isLensGuestPointerTarget({
        tagName: "DIV",
        closest: () => null,
      }),
    ).toBe(false);
    expect(isLensGuestPointerTarget(null)).toBe(false);
  });
});

describe("Lens guest pointer passthrough lifetime", () => {
  test("stays active until every acquired pointer is released", () => {
    const changes: boolean[] = [];
    const tracker = createLensGuestPointerPassthroughTracker((active) => {
      changes.push(active);
    });

    tracker.acquire(41);
    tracker.acquire(42);
    tracker.release(41);

    expect(changes).toEqual([true]);

    tracker.release(42);
    expect(changes).toEqual([true, false]);
  });

  test("ignores duplicate and unrelated pointer releases", () => {
    const changes: boolean[] = [];
    const tracker = createLensGuestPointerPassthroughTracker((active) => {
      changes.push(active);
    });

    tracker.acquire(7);
    tracker.acquire(7);
    tracker.release(99);
    tracker.release(7);

    expect(changes).toEqual([true, false]);
  });

  test("resets every acquisition at a lifecycle boundary", () => {
    const changes: boolean[] = [];
    const tracker = createLensGuestPointerPassthroughTracker((active) => {
      changes.push(active);
    });

    tracker.acquire(1);
    tracker.acquire(2);
    tracker.reset();
    tracker.reset();

    expect(changes).toEqual([true, false]);
  });
});
