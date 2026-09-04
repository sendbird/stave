import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Four-bar composer chrome: a raised card with lower-depth strips peeking
 * above, below, and to each side. Empty slots collapse so unused wings do
 * not reserve a decorative tab.
 */
export function ComposerFrame(props: {
  top?: ReactNode;
  bottom?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasTop = Boolean(props.top);
  const hasBottom = Boolean(props.bottom);
  const hasLeft = Boolean(props.left);
  const hasRight = Boolean(props.right);

  return (
    <div
      data-composer-frame="true"
      className={cn(
        "grid items-stretch [grid-template-columns:auto_minmax(0,1fr)_auto]",
        props.className,
      )}
    >
      {hasTop ? (
        <div
          data-composer-frame-slot="top"
          className="relative z-0 col-start-2 row-start-1 -mb-2.5 min-w-0"
        >
          {props.top}
        </div>
      ) : null}
      {hasLeft ? (
        <div
          data-composer-frame-slot="left"
          className="relative z-0 col-start-1 row-start-2 mr-[-0.65rem] self-center"
        >
          {props.left}
        </div>
      ) : null}
      <div className="relative z-10 col-start-2 row-start-2 min-w-0">
        {props.children}
      </div>
      {hasRight ? (
        <div
          data-composer-frame-slot="right"
          className="relative z-0 col-start-3 row-start-2 ml-[-0.65rem] self-center"
        >
          {props.right}
        </div>
      ) : null}
      {hasBottom ? (
        <div
          data-composer-frame-slot="bottom"
          className="relative z-0 col-start-2 row-start-3 -mt-2.5 min-w-0"
        >
          {props.bottom}
        </div>
      ) : null}
    </div>
  );
}

export function ComposerFrameWing(props: {
  side: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-composer-frame-wing={props.side}
      className={cn(
        "composer-frame-surface flex rounded-xl bg-card p-1.5",
        props.side === "left"
          ? "max-h-52 flex-col flex-wrap content-start gap-1"
          : "flex-col items-center gap-1",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
