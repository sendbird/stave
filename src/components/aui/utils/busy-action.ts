import * as React from "react";

/**
 * The busy contract for a surface whose controls start asynchronous work — a
 * decision, an approval, a comment save. Lifted out of `Approval` so
 * `ApprovalBar`, `CommentThread` and the comment-action contract share one
 * implementation instead of each growing a copy (`Clarification` still carries
 * the original one; it is the next consumer).
 *
 * Two halves, usable apart:
 *
 * - {@link usePendingAction} decides **whether an action may start** and who
 *   owns the pending state while it runs.
 * - {@link useBusyFocusReclaim} decides **where focus goes** when the controls
 *   that held it are blocked or unmount because the work landed.
 */

/** What an action handler may return: nothing, or the work in flight. */
export type PendingActionResult = void | PromiseLike<unknown>;

/** The outcome of asking {@link usePendingAction} to start an action. */
export type PendingActionRun =
  /** Refused: the host said `busy`, or another action is still in flight. */
  | { status: "ignored" }
  /** The handler returned synchronously; the host owns whatever follows. */
  | { status: "done" }
  /** The handler returned a promise; `settled` resolves `true` on success. */
  | { settled: Promise<boolean>; status: "pending" };

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Pending ownership for user-triggered actions.
 *
 * - **The host can say busy.** While `busy` is true every `run` is refused —
 *   the `Approval.busy` contract, unchanged.
 * - **A promise owns its own pending state.** A handler that returns a promise
 *   marks `action` pending until it settles, so a host that forgets to pass
 *   `busy` still cannot be double-submitted. `settled` reports success, which is
 *   how an editor knows whether to close (resolved) or keep the draft
 *   (rejected). A rejection is swallowed here: the host that returned the
 *   promise owns the error and its message.
 * - **A same-task repeat is refused.** `disabled` only takes effect once React
 *   commits, and a second click dispatched in the same task as the first — a
 *   scripted double `click()`, or two events queued before a render — would
 *   otherwise run the handler twice. The lock lives in a ref and is held until
 *   the microtask after a synchronous handler returns, which is after React's
 *   own flush of a `busy` the handler set.
 *
 * `busy` in the result is the union of the host's flag and an owned promise;
 * `action` names the action that owns the pending state — the one to show a
 * spinner on — or the last one started while the host's `busy` is up.
 */
export function usePendingAction<Action extends string = string>(
  busyProp = false,
) {
  const lockRef = React.useRef<Action | null>(null);
  const busyRef = React.useRef(busyProp);
  busyRef.current = busyProp;
  const [owned, setOwned] = React.useState<Action | null>(null);
  const [started, setStarted] = React.useState<Action | null>(null);

  const run = React.useCallback(
    (action: Action, handler: () => PendingActionResult): PendingActionRun => {
      if (busyRef.current || lockRef.current !== null) {
        return { status: "ignored" };
      }
      lockRef.current = action;
      setStarted(action);
      let result: PendingActionResult;
      try {
        result = handler();
      } catch (error) {
        lockRef.current = null;
        throw error;
      }
      if (!isThenable(result)) {
        queueMicrotask(() => {
          if (lockRef.current === action) lockRef.current = null;
          // A handler that did not raise the host's `busy` has finished; it
          // must not be named as the pending action by a later, unrelated one.
          if (!busyRef.current) setStarted(null);
        });
        return { status: "done" };
      }
      setOwned(action);
      const release = (ok: boolean) => {
        if (lockRef.current === action) lockRef.current = null;
        setOwned((current) => (current === action ? null : current));
        if (!busyRef.current) setStarted(null);
        return ok;
      };
      return {
        settled: Promise.resolve(result).then(
          () => release(true),
          () => release(false),
        ),
        status: "pending",
      };
    },
    [],
  );

  // The host's `busy` coming down ends whatever it was busy with.
  React.useEffect(() => {
    if (!busyProp) setStarted(null);
  }, [busyProp]);

  const busy = busyProp || owned !== null;
  return {
    action: owned ?? (busyProp ? started : null),
    busy,
    run,
  };
}

/**
 * Blocking props for the group of controls a busy surface holds. `inert` takes
 * the controls out of the tab order and the pointer path at once, and
 * `aria-disabled` says why to assistive tech. Pair with
 * {@link useBusyFocusReclaim}, because `inert` also drops focus.
 */
export function busyGroupProps(busy: boolean) {
  return {
    "aria-disabled": busy || undefined,
    inert: busy || undefined,
  } as const;
}

/**
 * Focus reclaim for a decision set whose controls go away.
 *
 * Pressing a decision disables (native `disabled`, or `inert` on the group) or
 * unmounts the control that was pressed, which leaves focus on `<body>` and a
 * keyboard user with no position. The press marks a reclaim (`markReclaim`);
 * when the surface goes busy or resolves, focus moves before paint to the
 * durable `status` element — only when focus was inside the group, so an
 * external resolution never steals focus from elsewhere on the page. When busy
 * ends with no resolution the reclaim is dropped, and so is any reclaim once
 * the reader leaves the status on their own.
 */
export function useBusyFocusReclaim<
  Status extends HTMLElement = HTMLElement,
  Group extends HTMLElement = HTMLDivElement,
>({ busy, resolved }: { busy: boolean; resolved: boolean }) {
  const groupRef = React.useRef<Group>(null);
  const statusRef = React.useRef<Status>(null);
  const reclaimRef = React.useRef(false);
  const hadGroupFocusRef = React.useRef(false);
  const previousBusyRef = React.useRef(busy);

  React.useLayoutEffect(() => {
    const busyEndedWithoutOutcome =
      previousBusyRef.current && !busy && !resolved;
    previousBusyRef.current = busy;
    if (busyEndedWithoutOutcome) {
      reclaimRef.current = false;
      hadGroupFocusRef.current = false;
      return;
    }
    if (
      (!busy && !resolved) ||
      (!reclaimRef.current && !hadGroupFocusRef.current)
    ) {
      return;
    }
    statusRef.current?.focus();
    hadGroupFocusRef.current = false;
    if (resolved) reclaimRef.current = false;
  }, [busy, resolved]);

  const markReclaim = React.useCallback(() => {
    reclaimRef.current = true;
  }, []);

  const groupProps = {
    onBlurCapture: (event: React.FocusEvent<Group>) => {
      if (event.relatedTarget == null) {
        queueMicrotask(() => {
          if (!groupRef.current?.contains(document.activeElement)) {
            hadGroupFocusRef.current = false;
            reclaimRef.current = false;
          }
        });
      } else if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        hadGroupFocusRef.current = false;
        reclaimRef.current = false;
      }
    },
    onFocusCapture: () => {
      hadGroupFocusRef.current = true;
    },
    ref: groupRef,
  };

  const statusProps = {
    // Once the reader leaves the durable status, a later outcome belongs to
    // the page rather than to their focus.
    onBlur: () => {
      reclaimRef.current = false;
    },
    ref: statusRef,
    // Programmatic focus only — never a tab stop. It exists so the resolution
    // has somewhere to land, not so readers have to pass through it.
    tabIndex: -1,
  };

  return { groupProps, markReclaim, statusProps };
}
