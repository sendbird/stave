import { useCallback, useMemo, useRef, useState } from "react";
import type * as React from "react";

import { useAtelierMotion } from "../motion";
import { useCancelableHandle } from "../utils/pointer-gesture";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { BoardCard } from "./Board.card";
import { BoardColumn } from "./Board.column";
import { BoardContext, type BoardContextValue } from "./Board.context";
import { styles } from "./Board.styles";
import { VisuallyHidden } from "./VisuallyHidden";

export type { BoardCardProps } from "./Board.card";
export type { BoardColumnProps } from "./Board.column";

export type BoardProps = React.ComponentProps<"div"> & {
  /**
   * Fill at least the parent's bounded block size while still growing with a
   * taller card stack. The parent must supply a bounded height and own vertical
   * scrolling.
   */
  fillHeight?: boolean;
  /**
   * Controlled move callback: `toIndex` is the card's index within the
   * destination column *after* it is removed from its source position.
   * Splice your state accordingly — the board never mutates its own order.
   */
  onCardMove?: (cardId: string, toColumnId: string, toIndex: number) => void;
  /**
   * Present cards without drag-and-drop when the host has no move write path.
   * Defaults to true if `onCardMove` is omitted.
   */
  readOnly?: boolean;
} & XstyleProp;

function BoardRoot({
  children,
  className,
  fillHeight = false,
  onCardMove,
  readOnly = onCardMove == null,
  xstyle,
  ...props
}: BoardProps) {
  const { reduceMotion } = useAtelierMotion();
  const interactive = !readOnly && onCardMove != null;
  const boardRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(
    new Map<string, { el: HTMLElement; label: string }>(),
  );
  const [hoverColumnId, setHoverColumnId] = useState<string | null>(null);
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(null);
  // Position snapshot taken at keyboard pickup, so Escape can restore it.
  const grabOriginRef = useRef<{ columnId: string; index: number } | null>(
    null,
  );
  // Set while a keyboard move remounts the card, so its blur doesn't drop it.
  const movingRef = useRef(false);
  // Passing the global directly evaluates it during SSR. The wrapper defers
  // that browser-only lookup until a keyboard move actually schedules focus.
  const scheduleFocusRestore = useCancelableHandle<number>((handle) =>
    cancelAnimationFrame(handle),
  );
  const [live, setLive] = useState({ message: "", nonce: 0 });

  const announce = useCallback((message: string) => {
    setLive((prev) => ({ message, nonce: prev.nonce + 1 }));
  }, []);

  const registerColumn = useCallback(
    (id: string, el: HTMLElement | null, label?: string) => {
      if (el) {
        columnsRef.current.set(id, { el, label: label ?? id });
      } else {
        columnsRef.current.delete(id);
      }
    },
    [],
  );

  const columnLabel = useCallback(
    (id: string) => columnsRef.current.get(id)?.label ?? id,
    [],
  );

  const readLayout = useCallback(() => {
    const board = boardRef.current;
    if (!board) {
      return [];
    }
    return Array.from(
      board.querySelectorAll<HTMLElement>("[data-board-column-id]"),
    ).map((column) => ({
      cardIds: Array.from(
        column.querySelectorAll<HTMLElement>("[data-board-card-id]"),
      ).map((card) => card.dataset.boardCardId ?? ""),
      id: column.dataset.boardColumnId ?? "",
    }));
  }, []);

  const readDirection = useCallback((): "ltr" | "rtl" => {
    const board = boardRef.current;
    return board && getComputedStyle(board).direction === "rtl" ? "rtl" : "ltr";
  }, []);

  const hitTestColumn = useCallback(
    (clientX: number, clientY: number): string | null => {
      for (const [id, { el }] of columnsRef.current) {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return id;
        }
      }
      return null;
    },
    [],
  );

  const moveCard = useCallback(
    (
      cardId: string,
      toColumnId: string,
    toIndex: number,
    options?: { refocus?: boolean },
    ): boolean => {
      if (!interactive || !onCardMove) return false;
      const layout = readLayout();
      const from = layout.find((column) => column.cardIds.includes(cardId));
      const target = layout.find((column) => column.id === toColumnId);
      if (!from || !target) {
        return false;
      }
      const fromIndex = from.cardIds.indexOf(cardId);
      const sameColumn = from.id === toColumnId;
      const maxIndex = sameColumn
        ? target.cardIds.length - 1
        : target.cardIds.length;
      const index = Math.max(0, Math.min(toIndex, maxIndex));
      if (sameColumn && index === fromIndex) {
        return false;
      }
      if (options?.refocus) {
        movingRef.current = true;
      }
      onCardMove(cardId, toColumnId, index);
      const total = sameColumn
        ? target.cardIds.length
        : target.cardIds.length + 1;
      announce(
        `Card moved to "${columnLabel(toColumnId)}", position ${index + 1} of ${total}.`,
      );
      if (options?.refocus) {
        // The card remounts under its new column; restore focus afterwards.
        scheduleFocusRestore(requestAnimationFrame, () => {
          boardRef.current
            ?.querySelector<HTMLElement>(`[data-board-card-id="${cardId}"]`)
            ?.focus();
          movingRef.current = false;
        });
      }
      return true;
    },
    [
      announce,
      columnLabel,
      interactive,
      onCardMove,
      readLayout,
      scheduleFocusRestore,
    ],
  );

  const setGrabbedCard = useCallback(
    (id: string | null, message?: string) => {
      if (id !== null) {
        const layout = readLayout();
        const from = layout.find((column) => column.cardIds.includes(id));
        grabOriginRef.current = from
          ? { columnId: from.id, index: from.cardIds.indexOf(id) }
          : null;
      }
      // Ignore the blur fired by a mid-move remount; a real release also
      // drops the origin snapshot so Escape can no longer restore it.
      if (!movingRef.current || id !== null) {
        if (id === null) {
          grabOriginRef.current = null;
        }
        setGrabbedCardId(id);
      }
      if (message) {
        announce(message);
      }
    },
    [announce, readLayout],
  );

  const cancelGrab = useCallback(
    (cardId: string) => {
      const origin = grabOriginRef.current;
      grabOriginRef.current = null;
      setGrabbedCardId(null);
      if (origin) {
        moveCard(cardId, origin.columnId, origin.index, { refocus: true });
      }
      announce("Move cancelled.");
    },
    [announce, moveCard],
  );

  const context = useMemo<BoardContextValue>(
    () => ({
      cancelGrab,
      columnLabel,
      grabbedCardId,
      hitTestColumn,
      hoverColumnId,
      interactive,
      moveCard,
      readDirection,
      readLayout,
      reduceMotion,
      registerColumn,
      setGrabbedCard,
      setHoverColumnId,
    }),
    [
      cancelGrab,
      columnLabel,
      grabbedCardId,
      hitTestColumn,
      hoverColumnId,
      interactive,
      moveCard,
      readDirection,
      readLayout,
      reduceMotion,
      registerColumn,
      setGrabbedCard,
    ],
  );

  return (
    <BoardContext.Provider value={context}>
      <div
        {...props}
        className={cx(
          sx(styles.board, fillHeight && styles.boardFillHeight, xstyle),
          className,
        )}
        ref={boardRef}
      >
        {children}
      </div>
      {/* Keyboard-move announcements (pickup / move / drop / cancel). */}
      <VisuallyHidden aria-live="polite" role="status">
        {live.message}
        {/* Nonce toggle forces SRs to re-announce repeated messages. */}
        {live.nonce % 2 === 1 ? " " : ""}
      </VisuallyHidden>
    </BoardContext.Provider>
  );
}

/**
 * Kanban board (controlled): a horizontal scroll row of columns holding
 * draggable cards.
 *
 * Anatomy: `Board` (scroll row + `onCardMove`) → `Board.Column`
 * (`{id, title, count?, actions?}`) → `Board.Card` (`{id}`). Cards drag
 * freely across columns (Motion owns `transform`); the hovered column gets an
 * accent-soft highlight and drops resolve by hit-testing registered column
 * rects. All moves — pointer and keyboard — flow through one controlled
 * contract: `onCardMove(cardId, toColumnId, toIndex)` where `toIndex` is the
 * destination index after removal from the source. `fillHeight` makes the
 * board and every column fill a bounded parent while allowing them to grow
 * with taller card stacks. Reduced motion: no layout springs, instant moves.
 *
 * Anatomy in source: this root owns move coordination and announcements;
 * `Board.column` renders a column, `Board.card` owns drag + keyboard moves,
 * and `Board.styles` holds the shared surface rules.
 *
 * ```tsx
 * <Board onCardMove={handleMove}>
 *   {columns.map((col) => (
 *     <Board.Column count={col.cards.length} id={col.id} key={col.id} title={col.title}>
 *       {col.cards.map((card) => (
 *         <Board.Card id={card.id} key={card.id}>{card.label}</Board.Card>
 *       ))}
 *     </Board.Column>
 *   ))}
 * </Board>
 * ```
 */
export const Board = Object.assign(BoardRoot, {
  Card: BoardCard,
  Column: BoardColumn,
});
