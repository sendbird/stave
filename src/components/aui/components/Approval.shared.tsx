import { i18n, Trans, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { sx, type StyleXValue } from "../utils/stylex";
import type { ApprovalOutcome, ApprovalResolution } from "./Approval.types";

/*
 * Parts both Approval layouts share — the transcript decision and the scoped
 * permission request (`Approval.scoped.tsx`) — so the recorded status word and
 * the audit line cannot drift between them. Words read the host's `ui:`
 * translations (the bundle ships English literals).
 */

export const decisionWord: Record<ApprovalResolution, string> = {
  get "allow-always"() { return i18n.t("ui:decisionWord.aAllowed"); },
  get "allow-once"() { return i18n.t("ui:decisionWord.aOnce"); },
  get allowed() { return i18n.t("ui:decisionWord.allowed"); },
  get deny() { return i18n.t("ui:decisionWord.denied"); },
  // "Withdrawn", not "Expired": nothing timed out on its own — the run that
  // asked the question ended, so the question went with it.
  get lapsed() { return i18n.t("ui:decisionWord.withdrawn"); },
};

export const decisionTone = {
  "allow-always": agentStatusWord.success,
  "allow-once": agentStatusWord.success,
  allowed: agentStatusWord.success,
  deny: agentStatusWord.danger,
  lapsed: agentStatusWord.neutral,
} as const satisfies Record<ApprovalResolution, stylex.StyleXStyles>;

/**
 * The audit line: who and when, plus any note.
 *
 * Rendered only when the caller supplied at least one of the three. With no
 * attribution the status word alone is the whole record, and an empty "by —"
 * row would be chrome pretending to be evidence.
 */
export function ApprovalAudit({
  id,
  outcome,
  xstyle,
}: {
  id: string;
  outcome: ApprovalOutcome;
  /** Host motion (the scoped card's rise-in when a decision lands). */
  xstyle?: StyleXValue;
}): React.ReactElement {
  useTranslation();
  return (
    <div
      {...themeSlotProps("approval", "audit")}
      className={sx(styles.audit, xstyle)}
      id={id}
    >
      {outcome.by == null && outcome.at == null ? null : (
        <div className={sx(agentSurface.metaRow)}>
          <span className={sx(agentSurface.metaRowLabel, styles.by)}>
            {outcome.by == null ? null : <Trans i18n={i18n} ns="ui" i18nKey="approval.byAuthor" components={{ author: <span>{outcome.by}</span> }} />}
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
  audit: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  by: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
});
