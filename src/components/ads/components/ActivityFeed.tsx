import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import type * as React from "react";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Avatar } from "./Avatar";
import { IconTile } from "./IconTile";

export type ActivityItem = {
  /** Avatar initials for the actor (used when no `icon`). */
  actorFallback?: string;
  /** Optional profile image for the actor. */
  actorAvatarSrc?: string;
  actor: React.ReactNode;
  /** Optional day-group key; a header is shown when it changes. */
  day?: string;
  /** Event icon shown on the rail instead of an avatar. */
  icon?: React.ReactNode;
  id: string;
  target?: React.ReactNode;
  timestamp?: React.ReactNode;
  verb: React.ReactNode;
};

export type ActivityFeedDensity = "compact" | "regular";

export type ActivityFeedProps = React.ComponentProps<"section"> & {
  /**
   * Event rhythm, from the shared `densityPad` scale: `regular` spaces events
   * 12px apart, `compact` 8px — the audit-rail shape, where dozens of events
   * share an inspector column. The connector follows the gap. @default "regular"
   */
  density?: ActivityFeedDensity;
  /** Shown when `items` is empty. Host modification: required, from the host's translations. */
  emptyText: React.ReactNode;
  items: ActivityItem[];
} & XstyleProp;

type FeedRow =
  | { day: string; key: string; type: "day" }
  | { connector: boolean; item: ActivityItem; key: string; type: "item" };

/** Day headers and events as one row sequence. */
function feedRows(items: ActivityItem[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let lastDay: string | undefined;
  items.forEach((item, index) => {
    if (item.day && item.day !== lastDay) {
      rows.push({ day: item.day, key: `day:${item.id}`, type: "day" });
    }
    lastDay = item.day ?? lastDay;
    const next = items[index + 1];
    // Connector runs between events of the same group; it stops before the
    // end of the feed and before a day break.
    rows.push({
      connector: next != null && !(next.day && next.day !== lastDay),
      item,
      key: item.id,
      type: "item",
    });
  });
  return rows;
}

/**
 * Chronological actor·verb·target·time feed for review/audit history, with
 * optional day grouping. Built on `Avatar`; pass `icon` for system events.
 */
export function ActivityFeed({
  className,
  density = "regular",
  emptyText,
  items,
  xstyle,
  ...props
}: ActivityFeedProps) {
  const theme = themeProps("activity-feed", { density });
  const rows = useMemo(() => feedRows(items), [items]);
  if (items.length === 0) {
    return (
      <section
        {...props}
        {...theme}
        className={cx(sx(styles.root, xstyle), theme.className, className)}
      >
        <p className={sx(styles.empty)}>{emptyText}</p>
      </section>
    );
  }

  const renderRow = (row: FeedRow) => {
    if (row.type === "day") {
      return (
        <li
          {...themeSlotProps("activity-feed", "day")}
          className={sx(styles.dayHeader)}
          key={row.key}
        >
          {row.day}
        </li>
      );
    }
    const { item } = row;
    return (
      <li className={sx(styles.item)} key={row.key}>
        {row.connector ? (
          <span
            aria-hidden
            {...themeSlotProps("activity-feed", "connector")}
            className={sx(styles.connector, connectorStyles[density])}
          />
        ) : null}
        <span className={sx(styles.rail)}>
          {item.icon ? (
            <IconTile shape="round" size="xs">
              {item.icon}
            </IconTile>
          ) : (
            <Avatar
              // Host modification: the actor's name is the text beside the
              // mark, so a mark without initials is decorative.
              alt={item.actorFallback ?? ""}
              fallback={item.actorFallback ?? "?"}
              size="sm"
              src={item.actorAvatarSrc}
            />
          )}
        </span>
        <div
          {...themeSlotProps("activity-feed", "body")}
          className={sx(styles.body)}
        >
          <p className={sx(styles.line)}>
            <span className={sx(styles.actor)}>{item.actor}</span>{" "}
            <span className={sx(styles.verb)}>{item.verb}</span>
            {item.target ? (
              <>
                {" "}
                <span className={sx(styles.target)}>{item.target}</span>
              </>
            ) : null}
          </p>
          {item.timestamp ? (
            <span className={sx(styles.time)}>{item.timestamp}</span>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
    >
      <ol className={sx(styles.list, listStyles[density])} role="list">
        {rows.map(renderRow)}
      </ol>
    </section>
  );
}

/**
 * The rail mark is 28px on both arms — `Avatar size="sm"` and `IconTile
 * size="xs"`, which is `controlHeightXs`. Every piece of rail geometry below
 * is written against the token instead of that number, so a change to the
 * control scale moves the connector and the text with the mark rather than
 * leaving them behind.
 */
const RAIL_MARK = vars["--ads-control-height-xs"];
/** The body's first line box, the thing the mark is centred against. */
const RAIL_LINE = `calc(${vars["--ads-font-size-body"]} * ${vars["--ads-line-height-normal"]})`;

const styles = stylex.create({
  root: {
    color: vars["--ads-color-text"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  list: {
    display: "grid",
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  // §8: the density prop owns this gap, so it reads the fixed `densityPad`
  // scale — as `space12` the compact theme preset collapsed it onto 8px and a
  // `density` prop would have resolved to one value under that preset.
  listRegular: {
    gap: densityPad.md,
  },
  listCompact: {
    gap: densityPad.sm,
  },
  dayHeader: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlockStart: vars["--ads-space-4"],
  },
  item: {
    alignItems: "start",
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: "auto minmax(0, 1fr)",
    minInlineSize: 0,
    position: "relative",
  },
  /**
   * The hairline between two events of the same day. It starts `space4` below
   * the mark and stops `space4` short of the next one, so the run reads as one
   * line broken by the marks rather than as a stack of ticks.
   *
   * `insetInlineStart` subtracts half the hairline: the line is 1px wide and
   * the mark's centre is at half its width, so placing the line's *edge* there
   * left it half a pixel off the column it is supposed to run down.
   */
  connector: {
    backgroundColor: vars["--ads-color-border-subtle"],
    insetBlockStart: `calc(${RAIL_MARK} + ${densityPad.xs})`,
    insetInlineStart: `calc(${RAIL_MARK} / 2 - ${vars["--ads-border-width-hairline"]} / 2)`,
    inlineSize: vars["--ads-border-width-hairline"],
    position: "absolute",
  },
  rail: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  body: {
    display: "grid",
    gap: vars["--ads-space-2"],
    minInlineSize: 0,
    // Half the difference between the mark and the first line box, so the
    // actor's name sits on the mark's centre line. `space2` was a nudge in the
    // right direction that stopped 2px short — measured 28px against a 20px
    // line, which wants 4px, and a literal would go stale the moment either
    // side of that subtraction moves.
    paddingBlockStart: `calc((${RAIL_MARK} - ${RAIL_LINE}) / 2)`,
  },
  line: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  actor: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  verb: {
    color: vars["--ads-color-text-muted"],
  },
  target: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  time: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  // The connector reaches into the gap below its event and stops `xs` short
  // of the next mark, so its end moves with the density gap.
  connectorRegular: {
    insetBlockEnd: `calc(${densityPad.xs} - ${densityPad.md})`,
  },
  connectorCompact: {
    insetBlockEnd: `calc(${densityPad.xs} - ${densityPad.sm})`,
  },
});

const listStyles = {
  compact: styles.listCompact,
  regular: styles.listRegular,
} as const;

const connectorStyles = {
  compact: styles.connectorCompact,
  regular: styles.connectorRegular,
} as const;
