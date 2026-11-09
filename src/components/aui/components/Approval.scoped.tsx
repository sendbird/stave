import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { agentMotion } from "../recipes/agent-motion";
import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import {
  busyGroupProps,
  useBusyFocusReclaim,
  usePendingAction,
} from "../utils/busy-action";
import { cx, sx } from "../utils/stylex";
import type {
  ApprovalDecision,
  ApprovalProps,
  ApprovalScopeOption,
} from "./Approval.types";
import { ApprovalAudit, decisionTone, decisionWord } from "./Approval.shared";
import {
  AgentTextSwap,
  useChangeCount,
  useSelfEntrance,
} from "./agent-motion";
import { Button } from "./Button";
import { ToggleGroup } from "./ToggleGroup";

/**
 * The scoped permission request (#809 · G3, 2026-11-07). An agent asks for one
 * capability; the person reads who is asking, exactly what will change and
 * why, picks how long the grant lasts, and allows or denies once.
 *
 * It is a bounded object — a ring + raised card — because it is the thing a
 * person acts on, often outside the transcript (a side column, an inbox). The
 * change sentence and its facts share one recessed well, so "what" and "why"
 * are read together. The decision contract is the transcript one: the status
 * word, the busy hand-off and the preserved record after resolution.
 */
export function ScopedApproval({
  actions,
  allowLabel = i18n.t("ui:approval.allow"),
  arguments: argumentRows,
  loading: busyProp = false,
  className,
  defaultScope,
  denyLabel = i18n.t("ui:approval.deny"),
  description,
  footnote,
  icon,
  meta,
  onDecide,
  onScopeChange,
  outcome,
  scope: scopeProp,
  scopeLabel = i18n.t("ui:approval.scope"),
  scopes,
  title,
  xstyle,
  // Transcript-layout props with no meaning here.
  allowAlways: _allowAlways,
  allowAlwaysLabel: _allowAlwaysLabel,
  allowOnceLabel: _allowOnceLabel,
  allowOnceShortcut: _allowOnceShortcut,
  density: _density,
  risk: _risk,
  ...props
}: ApprovalProps & { scopes: readonly ApprovalScopeOption[] }) {
  useTranslation();
  const baseId = React.useId();
  const titleId = `${baseId}title`;
  const auditId = `${baseId}audit`;
  const { busy, run } = usePendingAction<ApprovalDecision>(busyProp);
  const resolved = outcome != null;
  // A decision that lands while the card is on screen animates in; a card
  // mounted already resolved simply shows its record.
  const decidedHere = useChangeCount(resolved) > 0;
  // Host: the card's own rise-in is skipped inside an `AgentEntranceScope`
  // (the virtualized chat transcript, where a mount is a scroll).
  const enterCard = useSelfEntrance() && agentMotion.enterCard;
  const { groupProps, markReclaim, statusProps } = useBusyFocusReclaim<
    HTMLSpanElement,
    HTMLDivElement
  >({ busy, resolved });

  const [uncontrolledScope, setUncontrolledScope] = React.useState(
    defaultScope ?? scopes[0]?.value ?? "",
  );
  const scope = scopeProp ?? uncontrolledScope;
  const chosen = scopes.find((option) => option.value === scope) ?? scopes[0];

  // A recorded scope names the grant, so the word drops "once"/"always" —
  // "Allowed once · For 1 hour" would state two durations.
  const word = resolved
    ? outcome.scope != null && outcome.decision !== "deny"
      ? decisionWord.allowed
      : decisionWord[outcome.decision]
    : busy
      ? i18n.t("ui:approval.recordingdecision")
      : i18n.t("ui:approval.needsyourapproval");
  const audit =
    resolved &&
    (outcome.by != null || outcome.at != null || outcome.note != null);

  const decide = (decision: ApprovalDecision) => {
    if (onDecide == null) return;
    markReclaim();
    run(decision, () =>
      onDecide(decision, decision === "deny" ? undefined : chosen?.value),
    );
  };
  const setScope = (next: string) => {
    if (scopeProp === undefined) setUncontrolledScope(next);
    onScopeChange?.(next);
  };

  const theme = themeProps("approval");
  const hasWell =
    description != null || (argumentRows != null && argumentRows.length > 0);

  return (
    <section
      {...props}
      {...theme}
      aria-busy={busy || undefined}
      aria-labelledby={titleId}
      className={cx(
        sx(agentSurface.tile, styles.card, enterCard, xstyle),
        theme.className,
        className,
      )}
      data-layout="scoped"
      role="group"
    >
      <div className={sx(styles.head)}>
        {icon == null ? null : (
          <span aria-hidden="true" className={sx(styles.icon)}>
            {icon}
          </span>
        )}
        <div className={sx(styles.identity)}>
          <span
            {...themeSlotProps("approval", "title")}
            className={sx(styles.title)}
            id={titleId}
          >
            {title}
          </span>
          {meta == null ? null : (
            <span className={sx(styles.meta)}>{meta}</span>
          )}
        </div>
        <span
          aria-live="polite"
          aria-describedby={audit ? auditId : undefined}
          {...themeSlotProps("approval", "status")}
          className={sx(
            styles.status,
            resolved ? decisionTone[outcome.decision] : agentStatusWord.warning,
            focusRing.ring,
            transition.colors,
            // Waiting, the scope track and Allow / Deny already say "pending"
            // (as drawn); the word stays for assistive tech and reappears for
            // "Recording decision" and the recorded outcome.
            !resolved && !busy && styles.statusQuiet,
          )}
          {...statusProps}
        >
          {/* Needs approval → Recording → Allowed fades over in place. */}
          <AgentTextSwap
            swapKey={`${word}|${resolved ? (outcome.scope ?? "") : ""}`}
          >
            {word}
            {resolved && outcome.scope != null ? <> · {outcome.scope}</> : null}
          </AgentTextSwap>
        </span>
      </div>

      {hasWell ? (
        <div
          {...themeSlotProps("approval", "arguments")}
          className={sx(agentSurface.well, styles.well)}
        >
          {description == null ? null : (
            <p
              {...themeSlotProps("approval", "description")}
              className={sx(styles.change)}
            >
              {description}
            </p>
          )}
          {argumentRows == null || argumentRows.length === 0 ? null : (
            <dl className={sx(styles.facts)}>
              {argumentRows.map((row) => (
                <React.Fragment key={row.id}>
                  <dt className={sx(styles.term)}>{row.label}</dt>
                  <dd className={sx(agentSurface.meta, styles.value)}>
                    {row.value}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>
      ) : null}

      {resolved ? (
        audit ? (
          <ApprovalAudit
            id={auditId}
            outcome={outcome}
            xstyle={decidedHere ? agentMotion.enter : undefined}
          />
        ) : null
      ) : (
        <>
          <ToggleGroup
            aria-label={scopeLabel}
            density="compact"
            disabled={busy}
            options={scopes.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            // A scope is always chosen: pressing the active one is a no-op,
            // never an empty selection.
            onValueChange={(next) => {
              const [value] = next;
              if (value) setScope(value);
            }}
            value={chosen ? [chosen.value] : []}
            xstyle={styles.scope}
          />
          <div
            {...busyGroupProps(busy)}
            className={sx(styles.actions)}
            {...groupProps}
          >
            <Button
              disabled={busy || onDecide == null}
              onClick={() =>
                decide(chosen?.standing ? "allow-always" : "allow-once")
              }
              size="xs"
              variant="primary"
            >
              {allowLabel}
            </Button>
            <Button
              disabled={busy || onDecide == null}
              onClick={() => decide("deny")}
              size="xs"
              variant="outlined"
            >
              {denyLabel}
            </Button>
            {actions}
            {footnote == null ? null : (
              <span className={sx(styles.footnote)}>{footnote}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const styles = stylex.create({
  // Host: the installed `agentSurface.tile` still rests on the opaque border;
  // #809 moved bounded agent objects to the ring + raised edge, restated here.
  card: {
    borderColor: vars["--aui-color-ring"],
    boxShadow: vars["--aui-elevation-raised"],
    gap: vars["--aui-space-12"],
    position: "relative",
    padding: vars["--aui-space-16"],
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  // The tool's tile: the same raised square a run or file row leads with.
  icon: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderRadius: vars["--aui-radius-control"],
    boxShadow: `inset 0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-ring"]}, ${vars["--aui-elevation-raised"]}`,
    blockSize: vars["--aui-control-height-xs"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--aui-control-height-xs"],
    justifyContent: "center",
  },
  identity: {
    display: "grid",
    flex: "1 1 auto",
    minInlineSize: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"],
    overflowWrap: "anywhere",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
  status: {
    alignSelf: "flex-start",
    borderRadius: vars["--aui-radius-mark"],
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  // Visually hidden, kept in the tree (VisuallyHidden's geometry).
  statusQuiet: {
    blockSize: 1,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  well: {
    gap: vars["--aui-space-12"],
  },
  change: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-row"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  facts: {
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    margin: 0,
    rowGap: vars["--aui-space-2"],
  },
  term: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  // Machine register (`agentSurface.meta`), as in the transcript layout.
  value: {
    marginInlineStart: 0,
    overflowWrap: "anywhere",
    textAlign: "end",
  },
  // The scope track runs the card's width; its items keep their own measure.
  scope: {
    inlineSize: "100%",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  footnote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    marginInlineStart: "auto",
  },
});
