import { Children, useCallback } from "react";
import type * as React from "react";

import { transition } from "../recipes/transition";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { useBoardContext } from "./Board.context";
import { styles } from "./Board.styles";

export type BoardColumnProps = Omit<
  React.ComponentProps<"section">,
  "title"
> & {
  /** Trailing header slot (e.g. an icon `Button` opening a column menu). */
  actions?: React.ReactNode;
  /** Card count shown as a quiet badge next to the title. */
  count?: number;
  /** Stable identity used in the `onCardMove(cardId, toColumnId, …)` contract. */
  id: string;
  /** Column title (muted; header hierarchy comes from weight, not fill). */
  title: React.ReactNode;
} & XstyleProp;

/**
 * One board column: muted header (title + count badge + `actions` slot) over a
 * vertical card list. While a pointer-dragged card hovers it, the column
 * highlights (accent-soft wash + accent border). An empty column keeps a quiet
 * dashed drop zone so it stays a visible target.
 */
export function BoardColumn({
  actions,
  children,
  className,
  count,
  id,
  title,
  xstyle,
  ...props
}: BoardColumnProps) {
  const board = useBoardContext();
  const label = typeof title === "string" ? title : id;
  const registerRef = useCallback(
    (el: HTMLElement | null) => board?.registerColumn(id, el, label),
    [board, id, label],
  );
  const highlighted = board?.hoverColumnId === id;
  const isEmpty = Children.count(children) === 0;

  return (
    <section
      {...props}
      className={cx(
        sx(
          styles.column,
          transition.colors,
          highlighted && styles.columnActive,
          xstyle,
        ),
        className,
      )}
      data-board-column-id={id}
      ref={registerRef}
    >
      <header className={sx(styles.columnHeader)}>
        <span className={sx(styles.columnTitle)}>{title}</span>
        {count !== undefined ? (
          <span className={sx(styles.columnCount)}>{count}</span>
        ) : null}
        {actions != null ? (
          <div className={sx(styles.columnActions)}>{actions}</div>
        ) : null}
      </header>
      <div className={sx(styles.columnBody)} role="list">
        {isEmpty && board?.interactive ? (
          <div aria-hidden className={sx(styles.dropZone)}>
            Drop cards here
          </div>
        ) : isEmpty ? (
          <div className={sx(styles.emptyState)}>Nothing in {label}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
