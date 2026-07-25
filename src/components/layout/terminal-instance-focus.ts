/**
 * Focus resolution for the xterm surface, plus the animation-frame wait the
 * terminal hook uses to let layout settle before measuring.
 *
 * Extracted verbatim from `useTerminalInstance.ts` to keep that file within the
 * max-lines ratchet; no behavior changed. `useTerminalInstance` re-exports
 * `focusTerminalInstanceSurface` for existing consumers.
 */

type FocusableTarget = {
  focus?: (this: unknown, options?: { preventScroll?: boolean }) => void;
};

type FocusDocument = {
  activeElement?: unknown;
};

type QueryableContainer = FocusableTarget & {
  querySelector?: (selector: string) => unknown;
  contains?: (target: any) => boolean;
  ownerDocument?: FocusDocument | null;
};

function resolveActiveElement(args: {
  container?: QueryableContainer | null;
  getActiveElement?: (() => unknown) | undefined;
}) {
  if (typeof args.getActiveElement === "function") {
    return args.getActiveElement();
  }
  if (args.container?.ownerDocument) {
    return args.container.ownerDocument.activeElement;
  }
  if (typeof document !== "undefined") {
    return document.activeElement;
  }
  return undefined;
}

function isFocusInsideContainer(args: {
  container?: QueryableContainer | null;
  activeElement: unknown;
}) {
  if (!args.container || !args.activeElement) {
    return false;
  }
  if (typeof args.container.contains === "function") {
    return args.container.contains(args.activeElement);
  }
  return args.activeElement === args.container;
}

function focusAndVerify(args: {
  target: FocusableTarget;
  focusOptions?: { preventScroll?: boolean };
  container?: QueryableContainer | null;
  getActiveElement?: (() => unknown) | undefined;
}) {
  args.target.focus?.call(args.target, args.focusOptions);

  const activeElement = resolveActiveElement({
    container: args.container,
    getActiveElement: args.getActiveElement,
  });

  if (activeElement === undefined) {
    return true;
  }

  return (
    activeElement === args.target ||
    isFocusInsideContainer({
      container: args.container,
      activeElement,
    })
  );
}

export function focusTerminalInstanceSurface(args: {
  terminal?: FocusableTarget | null;
  container?: QueryableContainer | null;
  getActiveElement?: () => unknown;
}) {
  if (args.terminal && typeof args.terminal.focus === "function") {
    if (
      focusAndVerify({
        target: args.terminal,
        container: args.container,
        getActiveElement: args.getActiveElement,
      })
    ) {
      return true;
    }
  }

  const textarea = args.container?.querySelector?.("textarea");
  if (
    textarea &&
    typeof (textarea as FocusableTarget | null | undefined)?.focus ===
      "function"
  ) {
    if (
      focusAndVerify({
        target: textarea as FocusableTarget,
        focusOptions: { preventScroll: true },
        container: args.container,
        getActiveElement: args.getActiveElement,
      })
    ) {
      return true;
    }
  }

  if (args.container && typeof args.container.focus === "function") {
    if (
      focusAndVerify({
        target: args.container,
        focusOptions: { preventScroll: true },
        container: args.container,
        getActiveElement: args.getActiveElement,
      })
    ) {
      return true;
    }
  }

  return false;
}

export function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    function step(remaining: number) {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    }
    step(count);
  });
}
