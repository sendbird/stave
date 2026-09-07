import * as stylex from "@stylexjs/stylex";
import { BookOpenText, ExternalLink, FileText, Globe2 } from "lucide-react";
import * as React from "react";

import {
  CollapsiblePanel,
  CollapsibleRoot,
  CollapsibleTrigger,
  type CollapsibleRootProps,
} from "../headless/collapsible";
import { agentSurface } from "../recipes/agent-surface";
import { controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { inlineDisclosure } from "../recipes/inline-disclosure";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { InlineDisclosureIcon } from "./inline-disclosure-icon";

/* ------------------------------------------------------------------------ *
 * Citation — the source list and its rows.
 *
 * Split from `Citation.tsx` to stay under the 500-line source ceiling, and
 * split HERE because the seam is real: the mark is one inline object with an
 * overlay, the list is a rung-3 row group. Nothing in this file imports the
 * root, so the pair adds no relative-import cycle.
 * ------------------------------------------------------------------------ */

/**
 * One cited source, shared by the inline mark and the list.
 *
 * `index` is the number as written in the running text, not a position in an
 * array: models renumber and reorder their references, and an array offset
 * silently mislabels every source when they do.
 */
export type CitationSource = {
  /** Retrieved-context excerpt — what the answer was actually grounded in. */
  excerpt?: React.ReactNode;
  href?: string;
  /** Stable list key, and the `id` of the rendered row so a mark can anchor to it. */
  id?: string;
  index: number;
  /** Where it came from: a domain, a doc path, a file. The machine register. */
  source?: React.ReactNode;
  /** Source name. Carries the mark's accessible name and the popover heading. */
  title: React.ReactNode;
};

export type CitationListProps = Omit<
  React.ComponentProps<"section">,
  "title"
> & {
  /** @default false */
  defaultOpen?: boolean;
  /** `compact` keeps source rows scan-sized; `detailed` also shows excerpts. */
  detail?: "compact" | "detailed";
  /** Disclosure row copy. @default "Sources" */
  label?: string;
  onOpenChange?: CollapsibleRootProps["onOpenChange"];
  /** Controlled disclosure state. */
  open?: boolean;
  sources: CitationSource[];
} & XstyleProp;

/**
 * The source list behind the marks — `decisions/agent-surface-grammar.md`
 * §7.B, rung 3.
 *
 * **The disclosure affordance is a small evidence control**, not a list header
 * or a bordered accordion. Source rows are separated by whitespace and a
 * rounded hover wash rather than N−1 table rules; the list therefore reads as
 * supporting evidence, not another data table nested below the answer.
 *
 * Ink does the rest of the hierarchy (§2): the title is body ink at
 * `fontWeightMedium`, the domain is mono/tertiary because it is an address
 * rather than language, and the retrieved excerpt is secondary ink clamped to
 * two lines. None of those three needed a box to separate it from the others.
 */
export function CitationList({
  className,
  defaultOpen = false,
  detail = "compact",
  label = "Sources",
  onOpenChange,
  open,
  sources,
  xstyle,
  ...props
}: CitationListProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;
  const empty = sources.length === 0;

  return (
    <CollapsibleRoot
      className={cx(sx(inlineDisclosure.root, xstyle), className)}
      onOpenChange={(nextOpen, details) => {
        setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen, details);
      }}
      open={resolvedOpen}
      render={<section {...props} />}
    >
      <CollapsibleTrigger
        className={cx(
          sx(
            inlineDisclosure.trigger,
            inlineDisclosure.triggerIntrinsic,
            resolvedOpen && inlineDisclosure.triggerOpen,
            transition.colors,
            focusRing.ring,
          ),
          "atelier-inline-disclosure-trigger",
        )}
        disabled={empty}
      >
        <InlineDisclosureIcon disclosure={!empty} open={resolvedOpen}>
          <BookOpenText aria-hidden size={controlIconSizes.md} />
        </InlineDisclosureIcon>
        <span className={sx(styles.triggerLabel)}>{label}</span>
        <span className={sx(agentSurface.meta)}>{sources.length}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}
        keepMounted
      >
        <ol
          className={cx(
            sx(inlineDisclosure.body, styles.list),
            "atelier-motion-panel-inner",
          )}
        >
          {sources.map((entry, position) => (
            <li
              className={sx(styles.listItem)}
              id={entry.id}
              key={entry.id ?? entry.href ?? `${entry.index}-${position}`}
            >
              <CitationRow detail={detail} source={entry} />
            </li>
          ))}
        </ol>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

function CitationRow({
  detail,
  source,
}: {
  detail: "compact" | "detailed";
  source: CitationSource;
}) {
  const body = (
    <>
      <span aria-hidden className={sx(styles.sourceGlyph)}>
        {source.href ? <Globe2 size={12} /> : <FileText size={12} />}
      </span>
      <span className={sx(styles.rowCopy)}>
        <span className={sx(styles.rowHeading)}>
          <span className={sx(styles.rowTitle)}>{source.title}</span>
          {source.source != null ? (
            <span className={sx(agentSurface.meta, styles.sourceName)}>
              {source.source}
            </span>
          ) : null}
        </span>
        {detail === "detailed" && source.excerpt != null ? (
          <span className={sx(styles.rowExcerpt)}>{source.excerpt}</span>
        ) : null}
      </span>
      <span className={sx(agentSurface.meta, styles.rowIndex)}>
        {source.index}
      </span>
    </>
  );

  if (!source.href) {
    return <span className={sx(styles.row, styles.rowStatic)}>{body}</span>;
  }

  return (
    <a
      className={sx(
        styles.row,
        styles.rowLink,
        transition.colors,
        focusRing.ring,
      )}
      href={source.href}
      rel="noreferrer noopener"
      target="_blank"
    >
      {body}
      <ExternalLink aria-hidden className={sx(styles.rowGlyph)} size={12} />
    </a>
  );
}

const styles = stylex.create({
  triggerLabel: {
    color: vars.colorText,
    flexBasis: 0,
    flexGrow: 1,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  listItem: {
    minInlineSize: 0,
  },
  row: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    boxSizing: "border-box",
    columnGap: vars.space8,
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
    inlineSize: "100%",
    minBlockSize: vars.controlHeightSm,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
    textDecoration: "none",
  },
  rowStatic: {
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
  },
  rowLink: {
    backgroundColor: {
      default: "transparent",
      ":active": vars.colorOverlayPressed,
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars.colorOverlayPressed,
        ":hover": vars.colorOverlayHover,
      },
    },
    color: vars.colorText,
  },
  sourceGlyph: {
    alignItems: "center",
    color: vars.colorTextSubtle,
    display: "inline-flex",
    flexShrink: 0,
  },
  /**
   * The reference number in the machine register, in its own trailing column,
   * so the count stays aligned while the title/domain cell yields first.
   */
  rowIndex: {
    lineHeight: vars.lineHeightTight,
  },
  rowCopy: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  rowHeading: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  rowTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sourceName: {
    flexShrink: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Two lines of retrieved context, then a clamp — a list row is scanned. */
  rowExcerpt: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflow: "hidden",
  },
  rowGlyph: {
    color: vars.colorTextSubtle,
  },
});
