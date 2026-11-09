import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { ApprovalAudit, decisionTone, decisionWord } from "./Approval.shared";
import { ScopedApproval } from "./Approval.scoped";
import type { ApprovalDecision, ApprovalProps } from "./Approval.types";
import { Button } from "./Button";

export type {
  ApprovalArgument,
  ApprovalDecision,
  ApprovalOutcome,
  ApprovalProps,
  ApprovalResolution,
  ApprovalScopeOption,
} from "./Approval.types";

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
export function Approval(props: ApprovalProps) {
  if (props.scopes != null && props.scopes.length > 0) {
    return <ScopedApproval {...props} scopes={props.scopes} />;
  }
  return <TranscriptApproval {...props} />;
}

function TranscriptApproval({
  actions,
  allowAlways = true,
  allowAlwaysLabel = i18n.t("ui:approval.alwaysAllow"),
  allowOnceLabel = i18n.t("ui:approval.allowOnce"),
  allowOnceShortcut,
  arguments: argumentRows,
  loading: busy = false,
  className,
  density = "default",
  denyLabel = i18n.t("ui:approval.deny"),
  description,
  onDecide,
  onKeyDown,
  outcome,
  risk,
  title,
  xstyle,
  // Scoped-layout props: never forwarded to the `<section>`.
  allowLabel: _allowLabel,
  defaultScope: _defaultScope,
  footnote: _footnote,
  icon: _icon,
  meta: _meta,
  onScopeChange: _onScopeChange,
  scope: _scope,
  scopeLabel: _scopeLabel,
  scopes: _scopes,
  ...props
}: ApprovalProps) {
  useTranslation();
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
      ? i18n.t("ui:approval.recordingdecision")
      : i18n.t("ui:approval.needsyourapproval");
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

  const theme = themeProps("approval");
  const compact = density === "compact";
  const shortcutLive =
    allowOnceShortcut != null && !resolved && !busy && onDecide != null;

  // Bound on the decision itself, so the key only answers the request whose
  // card holds focus; a press anywhere else never reaches this handler.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event as React.KeyboardEvent<HTMLElement & HTMLDivElement>);
    if (
      event.defaultPrevented ||
      !shortcutLive ||
      event.key !== "Enter" ||
      !(event.metaKey || event.ctrlKey) ||
      event.altKey ||
      event.shiftKey ||
      event.repeat ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    decide("allow-once");
  };

  const statusWord = (
    <span
      aria-live="polite"
      aria-describedby={audit ? auditId : undefined}
      {...themeSlotProps("approval", "status")}
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
  );

  return (
    <section
      {...props}
      {...theme}
      onKeyDown={handleKeyDown}
      aria-busy={busy || undefined}
      aria-labelledby={titleId}
      className={cx(
        sx(agentSurface.decision, compact && styles.compactRoot, xstyle),
        theme.className,
        className,
      )}
      data-density={compact ? "compact" : undefined}
      // `group`, not `region`: a transcript can hold a dozen of these, and a
      // dozen landmarks is a landmark list nobody can use.
      role="group"
    >
      <div className={sx(agentSurface.metaRow)}>
        <span
          {...themeSlotProps("approval", "title")}
          className={sx(agentSurface.metaRowLabel, styles.title)}
          id={titleId}
        >
          {title}
        </span>
        {risk == null ? (
          statusWord
        ) : (
          <span className={sx(styles.statusGroup)}>
            <span className={sx(styles.risk)} data-approval-risk="">
              {risk}
              <span aria-hidden="true"> ·</span>
            </span>
            {statusWord}
          </span>
        )}
      </div>

      {description == null ? null : (
        <p
          {...themeSlotProps("approval", "description")}
          className={sx(styles.description, compact && styles.compactClamp)}
        >
          {description}
        </p>
      )}

      {argumentRows == null || argumentRows.length === 0 ? null : (
        // Rung 4. A recess, never a nested bordered panel: the decision itself
        // already has a horizontal transcript boundary.
        <dl
          {...themeSlotProps("approval", "arguments")}
          className={sx(
            agentSurface.well,
            styles.arguments,
            compact && styles.compactArguments,
          )}
        >
          {argumentRows.map((row) => (
            <div className={sx(agentSurface.metaRow)} key={row.id}>
              <dt className={sx(agentSurface.metaRowLabel, styles.term)}>
                {row.label}
              </dt>
              <dd
                className={sx(
                  agentSurface.meta,
                  styles.value,
                  compact && styles.compactClamp,
                )}
              >
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
          className={sx(styles.actions, compact && styles.compactActions)}
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
            aria-keyshortcuts={shortcutLive ? allowOnceShortcut.ariaKeyShortcuts : undefined}
            disabled={busy || onDecide == null}
            onClick={() => decide("allow-once")}
            size="sm"
            variant="primary"
          >
            {allowOnceLabel}
            {shortcutLive ? allowOnceShortcut.hint : null}
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
            variant="outlined"
          >
            {denyLabel}
          </Button>
          {actions}
        </div>
      )}
    </section>
  );
}

const styles = stylex.create({
  // The title wraps (overriding `metaRowLabel`'s single-line truncation):
  // a narrow rail cut "Human takeover s…" beside the status word.
  title: {
    overflow: "visible",
    overflowWrap: "anywhere",
    textOverflow: "clip",
    whiteSpace: "normal",
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    // Medium, not semibold: §3 reserves semibold for page titles, and a weight
    // jump on top of an ink step is the third signal that turns a dense
    // surface loud.
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  // The risk word and the status word, kept together at the row's end.
  statusGroup: {
    alignItems: "baseline",
    display: "inline-flex",
    flex: "0 0 auto",
    gap: vars["--aui-space-4"],
  },
  risk: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  status: {
    borderRadius: vars["--aui-radius-mark"],
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  arguments: {
    gap: vars["--aui-space-4"],
    margin: 0,
  },
  // The term keeps its words (up to 45% of the row); the value wraps.
  term: {
    flexShrink: 0,
    maxInlineSize: "45%",
    overflow: "visible",
    textOverflow: "clip",
    whiteSpace: "normal",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  value: {
    // The `<dd>` UA sheet ships a 40px inline indent; the metaRow owns spacing.
    marginInlineStart: 0,
    overflowWrap: "anywhere",
    textAlign: "end",
    whiteSpace: "pre-wrap",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-start",
  },
  // Host extension: `density="compact"`. The host container owns the
  // boundary, so the transcript rule goes and the rhythm tightens one step.
  compactRoot: {
    borderBlockStartWidth: 0,
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-4"],
  },
  compactArguments: {
    gap: vars["--aui-space-2"],
    padding: vars["--aui-space-8"],
  },
  compactClamp: {
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  compactActions: {
    gap: vars["--aui-space-4"],
    paddingBlockStart: vars["--aui-space-4"],
  },
});
