import { describe, expect, test } from "bun:test";
import {
  EMPTY_LENS_GUEST_FOCUS_BORROW,
  beginLensGuestFocusBorrow,
  finishLensGuestFocusBorrow,
  type LensFocusableHost,
} from "../src/lib/lens/lens-guest-focus-borrow";

type Host = LensFocusableHost & { id: string; blurred: number };

function host(id: string): Host {
  return {
    id,
    blurred: 0,
    focus() {},
    blur() {
      this.blurred += 1;
    },
  };
}

/** Guest that is on screen; focus on it is focus the user can see. */
const presented = () => false;
/** Guest with no rectangle; focus on it is an invisible caret. */
const parked = () => true;

describe("Lens guest focus borrow", () => {
  test("remembers the host control that held focus before the first borrow", () => {
    const guest = host("guest");
    const prompt = host("prompt");

    const borrowed = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    expect(borrowed.borrowIds).toEqual(["b1"]);
    expect(borrowed.returnTarget).toBe(prompt);
  });

  test("does not overwrite the return target on a nested borrow", () => {
    const guest = host("guest");
    const prompt = host("prompt");
    const first = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });
    const nested = beginLensGuestFocusBorrow({
      borrowId: "b2",
      guest,
      activeElement: guest,
      state: first,
    });

    expect(nested.borrowIds).toEqual(["b1", "b2"]);
    expect(nested.returnTarget).toBe(prompt);

    const inner = finishLensGuestFocusBorrow({
      borrowId: "b2",
      state: nested,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });
    expect(inner.restoreTarget).toBeNull();
    expect(inner.state.borrowIds).toEqual(["b1"]);
    expect(inner.state.returnTarget).toBe(prompt);

    const outer = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: inner.state,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });
    expect(outer.restoreTarget).toBe(prompt);
    expect(outer.state).toEqual(EMPTY_LENS_GUEST_FOCUS_BORROW);
  });

  test("does not yank focus back if the user already moved it off the guest", () => {
    const guest = host("guest");
    const prompt = host("prompt");
    const button = host("button");
    const borrowed = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    const finished = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: borrowed,
      activeElement: button,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });

    expect(finished.restoreTarget).toBeNull();
    expect(finished.blurTarget).toBeNull();
    expect(finished.state).toEqual(EMPTY_LENS_GUEST_FOCUS_BORROW);
  });

  test("blurs a parked guest when the control that held focus has unmounted", () => {
    // A workspace switch during an agent dispatch unmounts the PromptInput the
    // borrow remembered. Leaving the caret in a page with no rectangle sends
    // the user's next keystroke somewhere they cannot see.
    const guest = host("guest");
    const prompt = host("prompt");
    const borrowed = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    const finished = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: borrowed,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => false,
    });

    expect(finished.restoreTarget).toBeNull();
    expect(finished.blurTarget).toBe(guest);
    expect(finished.state).toEqual(EMPTY_LENS_GUEST_FOCUS_BORROW);
  });

  test("blurs a parked guest when nothing in the host held focus to begin with", () => {
    const guest = host("guest");
    const borrowed = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: null,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });
    expect(borrowed.returnTarget).toBeNull();

    const finished = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: borrowed,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });

    expect(finished.blurTarget).toBe(guest);
  });

  test("leaves a presented guest focused when there is nothing to restore", () => {
    const guest = host("guest");
    const borrowed = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: null,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    const finished = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: borrowed,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: presented,
      isReturnTargetLive: () => true,
    });

    expect(finished.restoreTarget).toBeNull();
    expect(finished.blurTarget).toBeNull();
  });

  test("settles a borrow whose confirmation missed main's wait", () => {
    // Main's borrow wait is 250ms. When it expires the tool call fails, but
    // the renderer still grants the borrow a moment later — so main releases
    // that borrow id anyway, and the release has to land.
    const guest = host("guest");
    const prompt = host("prompt");
    const lateGrant = beginLensGuestFocusBorrow({
      borrowId: "timed-out",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    const finished = finishLensGuestFocusBorrow({
      borrowId: "timed-out",
      state: lateGrant,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });

    expect(finished.restoreTarget).toBe(prompt);
    expect(finished.state).toEqual(EMPTY_LENS_GUEST_FOCUS_BORROW);
  });

  test("ignores a release for a borrow that was never granted", () => {
    // Main releases every borrow it attempts, including ones the renderer
    // refused. Such a release must not settle a different borrow that is
    // still dispatching, or that guest loses focus mid-input.
    const guest = host("guest");
    const prompt = host("prompt");
    const outstanding = beginLensGuestFocusBorrow({
      borrowId: "granted",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });

    const stray = finishLensGuestFocusBorrow({
      borrowId: "never-granted",
      state: outstanding,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });

    expect(stray.restoreTarget).toBeNull();
    expect(stray.blurTarget).toBeNull();
    expect(stray.state).toBe(outstanding);
  });

  test("is idempotent for a re-delivered borrow and its release", () => {
    const guest = host("guest");
    const prompt = host("prompt");
    const once = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: prompt,
      state: EMPTY_LENS_GUEST_FOCUS_BORROW,
    });
    const twice = beginLensGuestFocusBorrow({
      borrowId: "b1",
      guest,
      activeElement: guest,
      state: once,
    });
    expect(twice).toBe(once);

    const finished = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: twice,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });
    expect(finished.restoreTarget).toBe(prompt);

    const again = finishLensGuestFocusBorrow({
      borrowId: "b1",
      state: finished.state,
      activeElement: guest,
      isGuestElement: (element) => element === guest,
      isParkedGuestElement: parked,
      isReturnTargetLive: () => true,
    });
    expect(again.restoreTarget).toBeNull();
    expect(again.blurTarget).toBeNull();
  });
});
