import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";

/** What a human can decide about a proposed agent action. */
export type ApprovalDecision = "allow-once" | "allow-always" | "deny";

/**
 * What a *recorded* approval can say, which is strictly more than what a human
 * can choose.
 *
 * `ApprovalDecision` is the input union — the three buttons. A transcript,
 * though, has to be able to render two records that are not any of them, and
 * §5's rule (never invent precision) is what forces them to be separate values
 * rather than the nearest decision:
 *
 * - `allowed` — the action was permitted, and the host does not retain *which*
 *   grant was used. Many permission stores keep "answered: yes" and drop the
 *   scope. Rendering that as `allow-once` states a scope nobody recorded, and
 *   `allow-always` states a standing grant that may not exist.
 * - `lapsed` — no decision was ever made: the run was interrupted, or the
 *   request was withdrawn, and the gate closed unanswered. It is not `deny`,
 *   because nobody denied anything, and it is not pending, because leaving the
 *   buttons live on a request the host can no longer answer is an affordance
 *   that does nothing.
 *
 * Both are neutral-to-success ink and never `danger`: a lapse is not a refusal.
 */
export type ApprovalResolution = ApprovalDecision | "allowed" | "lapsed";

export type ApprovalOutcome = {
  /**
   * When the decision was recorded. Rendered in the machine register, so pass
   * a formatted timestamp (or a `RelativeTime`) rather than a `Date`.
   */
  at?: React.ReactNode;
  /** Who decided. Omit for an unattributed or automated grant. */
  by?: React.ReactNode;
  decision: ApprovalResolution;
  /** Free text kept with the decision — why it was allowed, or why not. */
  note?: React.ReactNode;
};

export type ApprovalArgument = {
  id: string;
  label: React.ReactNode;
  /** A value the agent produced, rendered in the machine register. */
  value: React.ReactNode;
};

export type ApprovalProps = Omit<React.ComponentProps<"section">, "title"> & {
  /** App-owned actions rendered after the built-in decision set. */
  actions?: React.ReactNode;
  /**
   * Offer "always allow". Turn it off where the host cannot persist a standing
   * grant — an option that silently decays to "once" is worse than no option.
   * @default true
   */
  allowAlways?: boolean;
  allowAlwaysLabel?: React.ReactNode;
  allowOnceLabel?: React.ReactNode;
  /** What is being approved, as `label → value` pairs. Rung 4. */
  arguments?: readonly ApprovalArgument[];
  /** A decision is being recorded. Blocks the controls without faking one. */
  busy?: boolean;
  denyLabel?: React.ReactNode;
  description?: React.ReactNode;
  onDecide?: (decision: ApprovalDecision) => void;
  /**
   * The recorded decision. Its presence is what switches the surface from
   * pending to resolved; `null`/`undefined` means "still waiting".
   */
  outcome?: ApprovalOutcome | null;
  title: React.ReactNode;
} & XstyleProp;

const decisionWord: Record<ApprovalResolution, string> = {
  "allow-always": "Always allowed",
  "allow-once": "Allowed once",
  allowed: "Allowed",
  deny: "Denied",
  // "Withdrawn", not "Expired": nothing timed out on its own — the run that
  // asked the question ended, so the question went with it.
  lapsed: "Withdrawn",
};

const decisionTone = {
  "allow-always": agentStatusWord.success,
  "allow-once": agentStatusWord.success,
  allowed: agentStatusWord.success,
  deny: agentStatusWord.danger,
  lapsed: agentStatusWord.neutral,
} as const satisfies Record<ApprovalResolution, stylex.StyleXStyles>;

/**
 * A human decision inside an agent transcript: allow this action once, allow
 * it from now on, or deny it.
 *
 * ## The decision survives being made
 *
 * The resolved state is **preserved in the transcript, not replaced by it.**
 * Once a decision lands, the surface keeps its title, its description, and the
 * arguments the action would have run with, and adds who decided and when. A
 * decision you cannot see afterwards is a decision you cannot audit — and an
 * approval that erases itself takes the evidence of what was approved with it.
 *
 * ## Attention is one explicit status word
 *
 * The header names pending, allowed, or denied in text and uses semantic color
 * only on that word. A colored leading edge would repeat the same fact as a
 * side-tab accent and make every decision resemble a generated callout card.
 * `agentSurface.decision` therefore uses one horizontal transcript boundary
 * while the argument `well` remains the one recessed payload region.
 *
 * ## Focus is handed somewhere on resolution
 *
 * Pressing a decision unmounts the button that was pressed, which leaves focus
 * on `<body>` and a keyboard user with no position. The click marks a reclaim,
 * and when the outcome arrives focus moves to the status word — which is
 * described by the audit line, so the move announces "Allowed once, by Jae
 * Park, 14:32" rather than nothing.
 */
export function Approval({
  actions,
  allowAlways = true,
  allowAlwaysLabel = "Always allow",
  allowOnceLabel = "Allow once",
  arguments: argumentRows,
  busy = false,
  className,
  denyLabel = "Deny",
  description,
  onDecide,
  outcome,
  title,
  xstyle,
  ...props
}: ApprovalProps) {
  const baseId = React.useId();
  const titleId = `${baseId}title`;
  const auditId = `${baseId}audit`;
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const statusRef = React.useRef<HTMLSpanElement>(null);
  const reclaimRef = React.useRef(false);
  const hadActionFocusRef = React.useRef(false);
  const previousBusyRef = React.useRef(busy);

  const resolved = outcome != null;
  const word = resolved
    ? decisionWord[outcome.decision]
    : busy
      ? "Recording decision"
      : "Needs your approval";
  // One predicate for "there is a record beyond the status word", used both to
  // render the audit line and to point `aria-describedby` at it — so a
  // note-only outcome cannot render text that focus never announces.
  const audit =
    resolved &&
    (outcome.by != null || outcome.at != null || outcome.note != null);

  // Native disabled controls and `inert` custom actions both leave the focus
  // owner during an async decision. Move it before paint to the durable status
  // only when focus was inside this decision set; an external resolution must
  // never steal focus from elsewhere in the transcript.
  React.useLayoutEffect(() => {
    const busyEndedWithoutOutcome =
      previousBusyRef.current && !busy && !resolved;
    previousBusyRef.current = busy;
    if (busyEndedWithoutOutcome) {
      reclaimRef.current = false;
      hadActionFocusRef.current = false;
      return;
    }
    if (
      (!busy && !resolved) ||
      (!reclaimRef.current && !hadActionFocusRef.current)
    ) {
      return;
    }
    statusRef.current?.focus();
    hadActionFocusRef.current = false;
    if (resolved) reclaimRef.current = false;
  }, [busy, resolved]);

  const decide = (decision: ApprovalDecision) => {
    if (onDecide == null) return;
    reclaimRef.current = true;
    onDecide(decision);
  };

  return (
    <section
      {...props}
      aria-busy={busy || undefined}
      aria-labelledby={titleId}
      className={cx(sx(agentSurface.decision, xstyle), className)}
      // `group`, not `region`: a transcript can hold a dozen of these, and a
      // dozen landmarks is a landmark list nobody can use.
      role="group"
    >
      <div className={sx(agentSurface.metaRow)}>
        <span
          className={sx(agentSurface.metaRowLabel, styles.title)}
          id={titleId}
        >
          {title}
        </span>
        <span
          aria-live="polite"
          aria-describedby={audit ? auditId : undefined}
          className={sx(
            styles.status,
            resolved ? decisionTone[outcome.decision] : agentStatusWord.warning,
            focusRing.ring,
            transition.colors,
          )}
          onBlur={() => {
            // Once the reader leaves the durable status, a later network
            // outcome belongs to the transcript rather than to their focus.
            reclaimRef.current = false;
          }}
          ref={statusRef}
          // Programmatic focus only — never a tab stop. It exists so the
          // resolution has somewhere to land, not so readers have to pass
          // through it on the way to the composer.
          tabIndex={-1}
        >
          {word}
        </span>
      </div>

      {description == null ? null : (
        <p className={sx(styles.description)}>{description}</p>
      )}

      {argumentRows == null || argumentRows.length === 0 ? null : (
        // Rung 4. A recess, never a nested bordered panel: the decision itself
        // already has a horizontal transcript boundary.
        <dl className={sx(agentSurface.well, styles.arguments)}>
          {argumentRows.map((row) => (
            <div className={sx(agentSurface.metaRow)} key={row.id}>
              <dt className={sx(agentSurface.metaRowLabel, styles.term)}>
                {row.label}
              </dt>
              <dd className={sx(agentSurface.meta, styles.value)}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {resolved ? (
        audit ? (
          <ApprovalAudit id={auditId} outcome={outcome} />
        ) : null
      ) : (
        // Leading-aligned, allow first. This is an inline decision in a
        // document, not a modal footer, so the trailing-aligned dialog
        // convention does not apply — the eye is already at the start edge
        // coming out of the description.
        <div
          aria-disabled={busy || undefined}
          className={sx(styles.actions)}
          inert={busy || undefined}
          onBlurCapture={(event) => {
            if (event.relatedTarget == null) {
              queueMicrotask(() => {
                if (!actionsRef.current?.contains(document.activeElement)) {
                  hadActionFocusRef.current = false;
                  reclaimRef.current = false;
                }
              });
            } else if (
              !event.currentTarget.contains(event.relatedTarget as Node)
            ) {
              hadActionFocusRef.current = false;
              reclaimRef.current = false;
            }
          }}
          onFocusCapture={() => {
            hadActionFocusRef.current = true;
          }}
          ref={actionsRef}
        >
          <Button
            disabled={busy || onDecide == null}
            onClick={() => decide("allow-once")}
            size="sm"
            variant="primary"
          >
            {allowOnceLabel}
          </Button>
          {allowAlways ? (
            <Button
              disabled={busy || onDecide == null}
              onClick={() => decide("allow-always")}
              size="sm"
              variant="secondary"
            >
              {allowAlwaysLabel}
            </Button>
          ) : null}
          <Button
            disabled={busy || onDecide == null}
            onClick={() => decide("deny")}
            size="sm"
            tone="danger"
            variant="outline"
          >
            {denyLabel}
          </Button>
          {actions}
        </div>
      )}
    </section>
  );
}

/**
 * The audit line: who and when, plus any note.
 *
 * Rendered only when the caller supplied at least one of the three. With no
 * attribution the status word alone is the whole record, and an empty "by —"
 * row would be chrome pretending to be evidence.
 */
function ApprovalAudit({
  id,
  outcome,
}: {
  id: string;
  outcome: ApprovalOutcome;
}) {
  return (
    <div className={sx(styles.audit)} id={id}>
      {outcome.by == null && outcome.at == null ? null : (
        <div className={sx(agentSurface.metaRow)}>
          <span className={sx(agentSurface.metaRowLabel, styles.by)}>
            {outcome.by == null ? null : <>by {outcome.by}</>}
          </span>
          {outcome.at == null ? null : (
            <span className={sx(agentSurface.meta)}>{outcome.at}</span>
          )}
        </div>
      )}
      {outcome.note == null ? null : (
        <p className={sx(styles.note)}>{outcome.note}</p>
      )}
    </div>
  );
}

const styles = stylex.create({
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    // Medium, not semibold: §3 reserves semibold for page titles, and a weight
    // jump on top of an ink step is the third signal that turns a dense
    // surface loud.
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
  },
  status: {
    borderRadius: vars.radiusMark,
    flex: "0 0 auto",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    whiteSpace: "nowrap",
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    overflowWrap: "anywhere",
  },
  arguments: {
    gap: vars.space4,
    margin: 0,
  },
  term: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  value: {
    // The `<dd>` UA sheet ships a 40px inline indent; the metaRow owns spacing.
    marginInlineStart: 0,
    overflowWrap: "anywhere",
    textAlign: "end",
    whiteSpace: "pre-wrap",
  },
  audit: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  by: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
  },
  note: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    overflowWrap: "anywhere",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "flex-start",
  },
});
