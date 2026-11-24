import * as stylex from "@stylexjs/stylex";
import { ChartColumnBig } from "lucide-react";
import { isValidElement } from "react";
import type * as React from "react";

import { sx } from "../utils/stylex";
import { EmptyState } from "./EmptyState";

/**
 * A chart's empty state as content: the `EmptyState` shape every empty region
 * in the package draws — a title, the sentence under it, one way forward.
 */
export type ChartEmptyStateContent = {
  /** One recovery action under the copy — a `Button` ("Reset filters"). */
  action?: React.ReactNode;
  /**
   * Second line: what the reader can change ("Try a different date range.").
   * Omitted, the title stands alone; there is no sentence to invent.
   */
  description?: React.ReactNode;
  /** The heading. Defaults to the chart's own ("No data for this selection"). */
  title?: React.ReactNode;
};

/**
 * What a chart shows when it has nothing to draw (`empty`).
 *
 * The same slot shape the collection components take: an object configures
 * the standard empty state (`{ title, description, action }`, each optional),
 * and any other node — an element, a string — replaces the whole body,
 * centred in the plot's box. (It replaced the two props the chart family grew
 * one at a time, `emptyMessage` and `emptyDescription`, removed 2026-11-08.)
 */
export type ChartEmptyState = ChartEmptyStateContent | React.ReactNode;

/** True for the `{ title, description, action }` form, false for a node. */
export function isChartEmptyStateContent(
  value: unknown,
): value is ChartEmptyStateContent {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isValidElement(value) &&
    !(Symbol.iterator in value)
  );
}

/**
 * The empty plot. A node `emptyState` is drawn as given; otherwise the
 * composed `EmptyState` — `plain`, because the chart card already owns the
 * surface underneath — with `emptyState`'s fields over the chart's own
 * default title.
 */
export function ChartEmptyPlot({
  emptyState,
  emptyTitle,
}: {
  emptyState?: ChartEmptyState;
  /** The title when `emptyState` sets none; carries each form's default. */
  emptyTitle: React.ReactNode;
}) {
  const custom =
    emptyState != null &&
    emptyState !== false &&
    !isChartEmptyStateContent(emptyState);
  const content = isChartEmptyStateContent(emptyState) ? emptyState : {};
  const title = content.title ?? emptyTitle;
  const description = content.description;
  return (
    <div className={sx(styles.emptyPlot)}>
      {custom ? (
        (emptyState as React.ReactNode)
      ) : (
        <EmptyState.Root variant="plain">
          <EmptyState.Media>
            <ChartColumnBig aria-hidden />
          </EmptyState.Media>
          <EmptyState.Header>
            <EmptyState.Title>{title}</EmptyState.Title>
            {description != null && description !== false ? (
              <EmptyState.Description>{description}</EmptyState.Description>
            ) : null}
          </EmptyState.Header>
          {content.action != null && content.action !== false ? (
            <EmptyState.Content>{content.action}</EmptyState.Content>
          ) : null}
        </EmptyState.Root>
      )}
    </div>
  );
}

const styles = stylex.create({
  emptyPlot: {
    alignItems: "center",
    blockSize: "100%",
    display: "flex",
    justifyContent: "center",
  },
});
