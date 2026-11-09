import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { MessageSquare } from "lucide-react";
import type * as React from "react";

import { agentMotion } from "../recipes/agent-motion";
import { agentSurface } from "../recipes/agent-surface";
import { vars } from "../tokens/tokens.stylex";
import { sx, type StyleXValue } from "../utils/stylex";
import { AgentTextSwap, useSelfEntrance } from "./agent-motion";
import { Badge } from "./Badge";
import type { PlanStepItem } from "./Plan.parts";

/**
 * Steering notes in a plan (P2 agent-steering, 2026-11-07).
 *
 * A note the reader sent to a running agent is a row in the plan, at the step
 * it will be read before — not a chat bubble beside the run. It keeps the
 * plan's columns (mark · copy · meta) so it reads as part of the sequence: a
 * note glyph in the mark cell, the note itself in quotes, and a second line
 * with the caller-worded state tag ("Queued for step 3"), who sent it and
 * when, and any actions the runtime supports (Edit, Remove). Nothing here is
 * inferred: the tag, the meta and the actions render only when supplied.
 *
 * Once the agent picks a note up, the note leaves the list and the step that
 * applied it says so: `appliedNote` prints "Applied your note “…”" under the
 * step title with a success tag.
 *
 * Host: the applied line's words read `ui:plan.appliedNote` / `ui:plan.applied`
 * (no English in the bundle file). The tags are plain Badges, as upstream
 * after #811, which folded `shape` into Badge itself.
 */
export function PlanNoteRow({
  enter = [],
  first,
  item,
  top,
}: {
  /** The plan's arrival entrance (rise + stagger) for this row. */
  enter?: readonly StyleXValue[];
  first: boolean;
  item: PlanStepItem;
  top: boolean;
}) {
  return (
    <li
      className={sx(
        agentSurface.row,
        styles.row,
        top && agentSurface.rowGroupItem,
        top && first && agentSurface.rowGroupItemFirst,
        ...enter,
      )}
      data-plan-step-kind="note"
    >
      <span aria-hidden className={sx(styles.mark)}>
        <MessageSquare size={12} strokeWidth={1.75} />
      </span>
      <span className={sx(styles.copy)}>
        <span className={sx(styles.quote)}>{item.title}</span>
        {item.noteStatus != null ||
        item.noteMeta != null ||
        item.noteActions != null ? (
          <span className={sx(styles.line)}>
            {item.noteStatus != null ? (
              <Badge dot size="md" tone="warning">
                {/* "Queued for step 3" → "Queued for step 4" fades over. */}
                <AgentTextSwap>{item.noteStatus}</AgentTextSwap>
              </Badge>
            ) : null}
            {item.noteMeta != null ? (
              <span className={sx(styles.meta)}>{item.noteMeta}</span>
            ) : null}
            {item.noteActions != null ? (
              <span className={sx(styles.actions)}>{item.noteActions}</span>
            ) : null}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function PlanAppliedNote({
  label,
  note,
  tag,
}: {
  label?: React.ReactNode;
  note: React.ReactNode;
  tag?: React.ReactNode;
}) {
  useTranslation();
  const entrance = useSelfEntrance();
  label ??= i18n.t("ui:plan.appliedNote");
  tag ??= i18n.t("ui:plan.applied");
  return (
    // The applied line arrives with the step's settle: a rise-in on mount.
    // Host: not inside an `AgentEntranceScope` (the virtualized transcript),
    // where a mount is a scroll, not an arrival.
    <span
      className={sx(styles.applied, entrance && agentMotion.enter)}
      data-plan-applied-note=""
    >
      <span className={sx(styles.appliedText)}>
        {label} <q className={sx(styles.appliedQuote)}>{note}</q>
      </span>
      <Badge dot size="md" tone="success">
        {tag}
      </Badge>
    </span>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "start",
    columnGap: vars["--aui-space-12"],
    gridTemplateColumns: "auto minmax(0, 1fr)",
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-warning-soft"],
    blockSize: 16,
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-warning-text"],
    display: "inline-flex",
    inlineSize: 16,
    justifyContent: "center",
    marginBlockStart: vars["--aui-space-8"],
  },
  // The note itself is a warm well — a request in flight, not a step.
  copy: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-warning-soft"]} 60%, transparent)`,
    borderRadius: vars["--aui-radius-control"],
    boxShadow: `inset 0 0 0 ${vars["--aui-border-width-hairline"]} color-mix(in oklch, ${vars["--aui-color-warning"]} 22%, transparent)`,
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  quote: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
    overflowWrap: "anywhere",
  },
  line: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: `${vars["--aui-space-4"]} ${vars["--aui-space-8"]}`,
    minInlineSize: 0,
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  actions: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    marginInlineStart: "auto",
  },
  applied: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: `${vars["--aui-space-4"]} ${vars["--aui-space-8"]}`,
    minInlineSize: 0,
  },
  appliedText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
  },
  appliedQuote: {
    fontStyle: "italic",
    quotes: "“ ”",
  },
});
