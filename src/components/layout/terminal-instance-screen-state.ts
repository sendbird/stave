/**
 * Replays a persisted terminal screen snapshot into a fresh xterm parser state.
 *
 * Extracted verbatim from `useTerminalInstance.ts` to keep that file within the
 * max-lines ratchet; no behavior changed. `useTerminalInstance` re-exports
 * `restoreTerminalScreenState` for existing consumers.
 */

type ScreenStateTerminalLike = {
  reset: () => void;
  write: (data: string) => void;
};

export function restoreTerminalScreenState(args: {
  terminal?: ScreenStateTerminalLike | null;
  screenState: string;
}) {
  const terminal = args.terminal;
  if (!terminal) {
    return;
  }

  // Snapshot replay needs a fresh parser/render surface. `clear()` only emits
  // ANSI erase commands into the existing state, which can leave stale session
  // state behind when a new PTY is attached to the same renderer.
  terminal.reset();
  if (args.screenState) {
    terminal.write(args.screenState);
  }
}
