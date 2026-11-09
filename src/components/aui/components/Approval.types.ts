import type * as React from "react";

import type { XstyleProp } from "../utils/stylex";

/*
 * Approval's types, split out as #809 did so the transcript decision
 * (`Approval.tsx`) and the scoped permission request (`Approval.scoped.tsx`)
 * share one contract. Host extensions (`density`, `allowOnceShortcut`, `risk`,
 * `ApprovalResolution`) are kept; see PROVENANCE.
 */

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
  /**
   * The grant the person chose in the scoped layout ("For 1 hour"), as the
   * host recorded it. Shown after the status word.
   */
  scope?: React.ReactNode;
};

/** One grant the runtime supports for a scoped request (#809 · G3). */
export type ApprovalScopeOption = {
  label: React.ReactNode;
  /**
   * The grant outlives this request ("Always in this workspace"). Allow then
   * reports `allow-always`; every other scope — once, or time-boxed — reports
   * `allow-once`, and `onDecide`'s second argument names the scope chosen.
   */
  standing?: boolean;
  value: string;
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
  /**
   * Allow button label in the scoped layout, where one Allow is read against
   * the chosen scope. @default `ui:approval.allow`
   */
  allowLabel?: React.ReactNode;
  /**
   * Host extension. A keyboard shortcut for "Allow once" that is live only
   * while focus is inside this decision: Enter with Ctrl or Cmd (the app-wide
   * `mod`), never repeated or composed. `ariaKeyShortcuts` names it on the
   * button and `hint` is the keycap drawn inside it. Escape is deliberately
   * not bound: a refusal is never one stray key away.
   */
  allowOnceShortcut?: { ariaKeyShortcuts: string; hint: React.ReactNode };
  /** What is being approved, as `label → value` pairs. Rung 4. */
  arguments?: readonly ApprovalArgument[];
  /** A decision is being recorded. Blocks the controls without faking one. */
  loading?: boolean;
  /**
   * Host extension. `compact` fits a decision into a host surface that draws
   * its own boundary — a composer slot, an inbox row, a side panel: no
   * transcript rule, tighter rhythm, and the description and argument values
   * clamped to a few lines. The decision set and its behavior are unchanged.
   * @default "default"
   */
  density?: "default" | "compact";
  /** Initial scope when uncontrolled. @default the first of `scopes` */
  defaultScope?: string;
  denyLabel?: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Trailing note in the scoped layout's action row — where the grant can be
   * revoked, say. Only state what the host actually offers.
   */
  footnote?: React.ReactNode;
  /** Leading tile in the scoped layout's header — the tool or resource. */
  icon?: React.ReactNode;
  /** One line under the title in the scoped layout: where, and on what. */
  meta?: React.ReactNode;
  /**
   * Record the decision. With `scopes`, the second argument is the scope
   * chosen for an allow.
   */
  onDecide?: (decision: ApprovalDecision, scope?: string) => void;
  onScopeChange?: (scope: string) => void;
  /**
   * The recorded decision. Its presence is what switches the surface from
   * pending to resolved; `null`/`undefined` means "still waiting".
   */
  outcome?: ApprovalOutcome | null;
  /**
   * Host extension. What makes the request riskier than a routine call, read
   * from the request itself, as a word before the status word. It is text in
   * muted ink, not a colored badge: the status word stays the one signal.
   */
  risk?: React.ReactNode;
  /** Controlled scope (a `value` from `scopes`). */
  scope?: string;
  /** Accessible name of the scope group. @default `ui:approval.scope` */
  scopeLabel?: string;
  /**
   * Grants the runtime supports for this request. Supplying them switches to
   * the scoped permission request (#809 · G3): a card with who, what and why,
   * a scope choice, and one Allow / Deny. Without them the three-button
   * transcript decision is unchanged.
   */
  scopes?: readonly ApprovalScopeOption[];
  title: React.ReactNode;
} & XstyleProp;
