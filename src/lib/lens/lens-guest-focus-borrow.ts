/**
 * Host-window focus borrow for CDP input into a Lens guest.
 *
 * `Input.dispatch*` is delivered to whatever holds native focus in the
 * embedder, not to the CDP target. A guest must therefore hold
 * `document.activeElement` for the duration of a click or type.
 *
 * Every workspace's guests live in the same renderer. Leaving focus on a
 * parked guest after the dispatch is the failure this module exists to
 * prevent: the user typing in another workspace's PromptInput loses the
 * caret because an agent click on a hidden page stole it.
 *
 * Borrows are tracked by the id main minted for them rather than counted.
 * A counter cannot survive the two ways the two sides fall out of step:
 *
 * - main's borrow wait times out (250ms) while the renderer grants the borrow
 *   anyway a moment later, so a release must still settle *that* borrow;
 * - a borrow main asked for was never granted (no guest, or no listener), so
 *   its release must not settle a *different* borrow that is still dispatching.
 *
 * With ids both are decided by identity: an unknown release is a no-op, and a
 * known one releases exactly what it named.
 */

export type LensFocusableHost = {
  focus(options?: { preventScroll?: boolean }): void;
  blur(): void;
};

export type LensGuestFocusBorrowState = {
  /** Ids of the borrows the renderer has actually granted, in grant order. */
  borrowIds: readonly string[];
  /** Host control that held focus before the first of them. */
  returnTarget: LensFocusableHost | null;
};

export const EMPTY_LENS_GUEST_FOCUS_BORROW: LensGuestFocusBorrowState = {
  borrowIds: [],
  returnTarget: null,
};

export function beginLensGuestFocusBorrow(args: {
  borrowId: string;
  guest: LensFocusableHost;
  activeElement: LensFocusableHost | null;
  state: LensGuestFocusBorrowState;
}): LensGuestFocusBorrowState {
  if (args.state.borrowIds.includes(args.borrowId)) {
    return args.state;
  }

  const returnTarget =
    args.state.borrowIds.length === 0
      ? args.activeElement && args.activeElement !== args.guest
        ? args.activeElement
        : null
      : args.state.returnTarget;

  return {
    borrowIds: [...args.state.borrowIds, args.borrowId],
    returnTarget,
  };
}

export function finishLensGuestFocusBorrow(args: {
  borrowId: string;
  state: LensGuestFocusBorrowState;
  activeElement: LensFocusableHost | null;
  isGuestElement: (element: LensFocusableHost | null) => boolean;
  /** A guest with no rectangle on screen: focus on one is focus nobody can see. */
  isParkedGuestElement: (element: LensFocusableHost) => boolean;
  isReturnTargetLive: (target: LensFocusableHost) => boolean;
}): {
  state: LensGuestFocusBorrowState;
  restoreTarget: LensFocusableHost | null;
  blurTarget: LensFocusableHost | null;
} {
  if (!args.state.borrowIds.includes(args.borrowId)) {
    return { state: args.state, restoreTarget: null, blurTarget: null };
  }

  const borrowIds = args.state.borrowIds.filter((id) => id !== args.borrowId);
  if (borrowIds.length > 0) {
    return {
      state: { borrowIds, returnTarget: args.state.returnTarget },
      restoreTarget: null,
      blurTarget: null,
    };
  }

  const empty = EMPTY_LENS_GUEST_FOCUS_BORROW;
  const active = args.activeElement;
  if (!active || !args.isGuestElement(active)) {
    // The user already moved focus off the guest. Their choice wins.
    return { state: empty, restoreTarget: null, blurTarget: null };
  }

  const target = args.state.returnTarget;
  if (target && args.isReturnTargetLive(target)) {
    return { state: empty, restoreTarget: target, blurTarget: null };
  }

  /*
   * Nothing live to hand focus back to — either nothing in the host held it
   * when the borrow started, or the control that did has since unmounted (a
   * workspace switch during an agent dispatch does exactly that).
   *
   * A parked guest must not be left holding the caret: its page is invisible,
   * so the caret would be too, and the user's next keystroke would land in a
   * page they cannot see. Drop focus instead. A presented guest is kept
   * focused, because there the caret is where the user can see it.
   */
  return {
    state: empty,
    restoreTarget: null,
    blurTarget: args.isParkedGuestElement(active) ? active : null,
  };
}
