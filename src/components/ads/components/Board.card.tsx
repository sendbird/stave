import { type HTMLMotionProps, m } from "motion/react";
import { useRef, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { springSmooth } from "../tokens/tokens.stylex";
import { useClickSuppressionLatch } from "../utils/pointer-gesture";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { useBoardContext, type BoardContextValue } from "./Board.context";
import { styles } from "./Board.styles";

export type BoardCardProps = Omit<
  HTMLMotionProps<"div">,
  "drag" | "dragListener" | "layout"
> & {
  /** Stable identity used in the `onCardMove` contract. */
  id: string;
} & XstyleProp;

/**
 * Keyboard move map for a grabbed card: Space picks up / drops, Escape
 * restores the pickup position, Left/Right step across columns (direction
 * aware), Up/Down reorder within one. Every step commits through `moveCard`.
 */
function handleCardKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  id: string,
  board: BoardContextValue,
  grabbed: boolean,
) {
  const layout = board.readLayout();
  const from = layout.find((col) => col.cardIds.includes(id));
  if (!from) {
    return;
  }
  const fromIndex = from.cardIds.indexOf(id);
  if (event.key === " " || (event.key === "Enter" && grabbed)) {
    event.preventDefault();
    if (grabbed) {
      board.setGrabbedCard(
        null,
        `Card dropped in "${board.columnLabel(from.id)}" at position ${fromIndex + 1} of ${from.cardIds.length}.`,
      );
    } else {
      board.setGrabbedCard(
        id,
        `Card picked up from "${board.columnLabel(from.id)}", position ${fromIndex + 1} of ${from.cardIds.length}. Use arrow keys to move, Space to drop, Escape to cancel.`,
      );
    }
    return;
  }
  if (!grabbed) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    board.cancelGrab(id);
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const step = event.key === "ArrowUp" ? -1 : 1;
    board.moveCard(id, from.id, fromIndex + step, { refocus: true });
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const physical = event.key === "ArrowRight" ? 1 : -1;
    const step = board.readDirection() === "rtl" ? -physical : physical;
    const columnIndex = layout.findIndex((col) => col.id === from.id);
    const target = layout[columnIndex + step];
    if (target) {
      board.moveCard(
        id,
        target.id,
        Math.min(fromIndex, target.cardIds.length),
        {
          refocus: true,
        },
      );
    }
  }
}

/**
 * Resolve the drop index inside `columnId`: how many other cards in that
 * column sit above the pointer's drop point.
 */
function dropIndexAt(columnId: string, cardId: string, clientY: number) {
  const columnEl = document.querySelector<HTMLElement>(
    `[data-board-column-id="${columnId}"]`,
  );
  const others = columnEl
    ? Array.from(
        columnEl.querySelectorAll<HTMLElement>("[data-board-card-id]"),
      ).filter((el) => el.dataset.boardCardId !== cardId)
    : [];
  let toIndex = 0;
  for (const el of others) {
    const rect = el.getBoundingClientRect();
    if (rect.top + rect.height / 2 < clientY) {
      toIndex += 1;
    }
  }
  return toIndex;
}

/**
 * One draggable card. Motion owns `transform`: free drag across columns with
 * an elevation lift; drop targets are hit-tested against the column rects
 * registered via context. Keyboard: Space picks up, arrows move (Left/Right
 * across columns, Up/Down within one), Enter/Space drops, Escape restores the
 * pickup position — every step goes through the same `onCardMove` contract.
 */
export function BoardCard({
  children,
  className,
  id,
  onBlur,
  onDrag,
  onDragEnd,
  onDragStart,
  onKeyDown,
  xstyle,
  ...props
}: BoardCardProps) {
  const board = useBoardContext();
  const [dragging, setDragging] = useState(false);
  const lastHoverRef = useRef<string | null>(null);
  const reduceMotion = board?.reduceMotion ?? false;
  const interactive = board?.interactive ?? false;
  const grabbed = board !== null && board.grabbedCardId === id;
  const clickLatch = useClickSuppressionLatch();

  const setHover = (next: string | null) => {
    if (lastHoverRef.current !== next) {
      lastHoverRef.current = next;
      board?.setHoverColumnId(next);
    }
  };

  return (
    <m.div
      {...props}
      aria-roledescription={interactive ? "draggable card" : undefined}
      className={cx(
        sx(
          styles.card,
          transition.ring,
          (dragging || grabbed) && styles.cardLifted,
          focusRing.ring,
          xstyle,
        ),
        className,
      )}
      data-board-card-id={id}
      onClickCapture={(event) =>
        clickLatch.consumeClick(event, props.onClickCapture)
      }
      drag={interactive}
      dragSnapToOrigin
      layout={reduceMotion ? false : "position"}
      onBlur={(event) => {
        onBlur?.(event);
        // Losing focus mid-grab drops the card where it currently sits
        // (unless the blur came from a keyboard move remounting it).
        if (interactive && grabbed) {
          board?.setGrabbedCard(null);
        }
      }}
      onDrag={(event, info) => {
        onDrag?.(event, info);
        setHover(
          board?.hitTestColumn(
            info.point.x - window.scrollX,
            info.point.y - window.scrollY,
          ) ?? null,
        );
      }}
      onDragEnd={(event, info) => {
        onDragEnd?.(event, info);
        setDragging(false);
        setHover(null);
        clickLatch.release();
        if (!board || !interactive) {
          return;
        }
        const clientX = info.point.x - window.scrollX;
        const clientY = info.point.y - window.scrollY;
        const targetId = board.hitTestColumn(clientX, clientY);
        if (targetId === null) {
          return;
        }
        board.moveCard(id, targetId, dropIndexAt(targetId, id, clientY));
      }}
      onDragStart={(event, info) => {
        onDragStart?.(event, info);
        if (!interactive) return;
        setDragging(true);
        clickLatch.arm();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !board ||
          !interactive ||
          event.defaultPrevented ||
          event.target !== event.currentTarget
        ) {
          return;
        }
        handleCardKeyDown(event, id, board, grabbed);
      }}
      role="listitem"
      tabIndex={interactive ? 0 : undefined}
      transition={reduceMotion ? { duration: 0 } : springSmooth}
    >
      {children}
    </m.div>
  );
}
