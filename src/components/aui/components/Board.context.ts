import { createContext, useContext } from "react";

/**
 * Board coordination context — the seam the column and card modules read.
 * Column order and card order are always read back from the DOM, so the board
 * never holds a second copy of the order its children already declare.
 */

export type BoardColumnLayout = {
  cardIds: string[];
  id: string;
};

export type BoardContextValue = {
  /** Whether cards are movable. Read-only boards retain their host card actions. */
  interactive: boolean;
  /**
   * Cancel a keyboard grab: move the card back to where it was picked up.
   */
  cancelGrab: (cardId: string) => void;
  columnLabel: (id: string) => string;
  grabbedCardId: string | null;
  /** Hit-test a viewport point against the registered column rects. */
  hitTestColumn: (clientX: number, clientY: number) => string | null;
  /** Drop-target column while a pointer drag hovers it. */
  hoverColumnId: string | null;
  /**
   * Commit a move (pointer drop or keyboard step). Returns `true` when the
   * move changed anything (and `onCardMove` was called).
   */
  moveCard: (
    cardId: string,
    toColumnId: string,
    toIndex: number,
    options?: { refocus?: boolean },
  ) => boolean;
  readDirection: () => "ltr" | "rtl";
  /** Column order + card order, read from the DOM (children define order). */
  readLayout: () => BoardColumnLayout[];
  reduceMotion: boolean;
  registerColumn: (id: string, el: HTMLElement | null, label?: string) => void;
  /** Grab (`id`) or release (`null`) a card via keyboard. */
  setGrabbedCard: (id: string | null, message?: string) => void;
  setHoverColumnId: (id: string | null) => void;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext() {
  return useContext(BoardContext);
}
