import { GhosttyTerminal, Terminal } from "ghostty-web";

const GHOSTTY_RUNTIME_HANDLER = Symbol("stave.ghostty-runtime-handler");

export type GhosttyRuntimeErrorContext =
  | "render-loop"
  | "mouse-move"
  | "selection"
  | "word-at-cell";

export type GhosttyRuntimeErrorHandler = (
  error: unknown,
  context: GhosttyRuntimeErrorContext,
) => void;

let ghosttyRuntimeGuardsInstalled = false;

export function isInvalidCodePointError(error: unknown) {
  return (
    error instanceof RangeError &&
    /invalid code point/i.test(error.message)
  );
}

export function isRecoverableGhosttyRuntimeError(error: unknown) {
  return (
    isInvalidCodePointError(error) ||
    (error instanceof Error && /memory access out of bounds/i.test(error.message))
  );
}

function notifyGhosttyRuntimeError(
  terminal: unknown,
  error: unknown,
  context: GhosttyRuntimeErrorContext,
) {
  try {
    const handler = (terminal as Record<PropertyKey, unknown>)[
      GHOSTTY_RUNTIME_HANDLER
    ];
    if (typeof handler === "function") {
      (handler as GhosttyRuntimeErrorHandler)(error, context);
    }
  } catch (handlerError) {
    console.warn("[terminal] ghostty runtime handler failed", handlerError);
  }
}

export function bindGhosttyRuntimeErrorHandler(
  terminal: Terminal,
  handler: GhosttyRuntimeErrorHandler,
) {
  ((terminal as unknown) as Record<PropertyKey, unknown>)[
    GHOSTTY_RUNTIME_HANDLER
  ] = handler;
}

export function clearGhosttyRuntimeErrorHandler(terminal: Terminal) {
  delete ((terminal as unknown) as Record<PropertyKey, unknown>)[
    GHOSTTY_RUNTIME_HANDLER
  ];
}

export function installGhosttyRuntimeGuards() {
  if (ghosttyRuntimeGuardsInstalled) {
    return;
  }
  ghosttyRuntimeGuardsInstalled = true;

  const originalGetGraphemeString = GhosttyTerminal.prototype.getGraphemeString;
  GhosttyTerminal.prototype.getGraphemeString = function patchedGetGraphemeString(
    row: number,
    col: number,
  ) {
    try {
      return originalGetGraphemeString.call(this, row, col);
    } catch (error) {
      if (isInvalidCodePointError(error)) {
        return "\uFFFD";
      }
      throw error;
    }
  };

  const originalGetScrollbackGraphemeString =
    GhosttyTerminal.prototype.getScrollbackGraphemeString;
  GhosttyTerminal.prototype.getScrollbackGraphemeString =
    function patchedGetScrollbackGraphemeString(offset: number, col: number) {
      try {
        return originalGetScrollbackGraphemeString.call(this, offset, col);
      } catch (error) {
        if (isInvalidCodePointError(error)) {
          return "\uFFFD";
        }
        throw error;
      }
    };

  const terminalPrototype = Terminal.prototype as any;

  const originalGetSelection = terminalPrototype.getSelection;
  terminalPrototype.getSelection = function patchedGetSelection() {
    try {
      return originalGetSelection.call(this);
    } catch (error) {
      if (isRecoverableGhosttyRuntimeError(error)) {
        notifyGhosttyRuntimeError(this, error, "selection");
        return "";
      }
      throw error;
    }
  };

  if (typeof terminalPrototype.getWordAtCell === "function") {
    const originalGetWordAtCell = terminalPrototype.getWordAtCell;
    terminalPrototype.getWordAtCell = function patchedGetWordAtCell(
      col: number,
      row: number,
    ) {
      try {
        return originalGetWordAtCell.call(this, col, row);
      } catch (error) {
        if (isRecoverableGhosttyRuntimeError(error)) {
          notifyGhosttyRuntimeError(this, error, "word-at-cell");
          return null;
        }
        throw error;
      }
    };
  }

  if (typeof terminalPrototype.processMouseMove === "function") {
    const originalProcessMouseMove = terminalPrototype.processMouseMove;
    terminalPrototype.processMouseMove = function patchedProcessMouseMove(
      event: MouseEvent,
    ) {
      try {
        return originalProcessMouseMove.call(this, event);
      } catch (error) {
        if (isRecoverableGhosttyRuntimeError(error)) {
          notifyGhosttyRuntimeError(this, error, "mouse-move");
          return;
        }
        throw error;
      }
    };
  }

  terminalPrototype.startRenderLoop = function patchedStartRenderLoop() {
    const terminal = this as any;

    const tick = () => {
      if (terminal.isDisposed || !terminal.isOpen) {
        return;
      }

      try {
        terminal.renderer?.render(
          terminal.wasmTerm,
          false,
          terminal.viewportY,
          terminal,
          terminal.scrollbarOpacity,
        );
        const cursor = terminal.wasmTerm?.getCursor?.();
        if (cursor && cursor.y !== terminal.lastCursorY) {
          terminal.lastCursorY = cursor.y;
          terminal.cursorMoveEmitter?.fire();
        }
      } catch (error) {
        notifyGhosttyRuntimeError(terminal, error, "render-loop");
        if (!isRecoverableGhosttyRuntimeError(error)) {
          throw error;
        }
      }

      terminal.animationFrameId = window.requestAnimationFrame(tick);
    };

    tick();
  };
}
