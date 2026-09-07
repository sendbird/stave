import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";

/**
 * How a question stopped being open.
 *
 * `lapsed` is the third value for the same reason `Approval` has one: a run
 * that is interrupted leaves its question unanswered, and neither of the other
 * two is true of it. `skipped` is a reader's choice — they saw the question and
 * declined it — so reusing it for a withdrawn question credits the reader with
 * a decision they never made, and leaving the outcome `null` leaves live
 * fields and a Continue button on a form the host can no longer submit.
 */
export type ClarificationResult = "answered" | "skipped" | "lapsed";

export type ClarificationOutcome = {
  at?: React.ReactNode;
  by?: React.ReactNode;
  /** Durable submitted answer summary. Omit when skipped or lapsed. */
  content?: React.ReactNode;
  result: ClarificationResult;
};

export type ClarificationProps = Omit<
  React.ComponentProps<"section">,
  "title"
> & {
  /** ADS form controls for the current question or step. */
  children?: React.ReactNode;
  /** Current 1-based step. Shown only when `totalSteps` is also provided. */
  currentStep?: number;
  description?: React.ReactNode;
  /** A submission is being recorded. */
  busy?: boolean;
  continueLabel?: React.ReactNode;
  onContinue?: () => void;
  onSkip?: () => void;
  /** Preserved answer; its presence resolves the question. */
  outcome?: ClarificationOutcome | null;
  skipLabel?: React.ReactNode;
  title: React.ReactNode;
  totalSteps?: number;
} & XstyleProp;

const resultWord: Record<ClarificationResult, string> = {
  answered: "Answered",
  // Same word as `Approval`'s lapsed resolution, deliberately: one vocabulary
  // for "the run ended before the reader answered" across both decision
  // surfaces, so a transcript holding one of each cannot name it two ways.
  lapsed: "Withdrawn",
  skipped: "Skipped",
};

const resultTone = {
  answered: agentStatusWord.success,
  lapsed: agentStatusWord.neutral,
  skipped: agentStatusWord.neutral,
} as const satisfies Record<ClarificationResult, stylex.StyleXStyles>;

/**
 * Structured clarification or review inside an agent transcript.
 *
 * This is intentionally separate from `Approval`: permission answers “may the
 * tool perform this risky action?”, while a questionnaire gathers information
 * the run needs. Callers compose the actual fields from ADS `RadioGroup`,
 * `CheckboxGroup`, `TextField`, and other form controls. The shared component
 * owns step truth, submit/skip intent, focus recovery, and the durable answer.
 */
export function Clarification({
  busy = false,
  children,
  className,
  continueLabel = "Continue",
  currentStep,
  description,
  onContinue,
  onSkip,
  outcome,
  skipLabel = "Skip",
  title,
  totalSteps,
  xstyle,
  ...props
}: ClarificationProps) {
  const titleId = React.useId();
  const auditId = React.useId();
  const interactionRef = React.useRef<HTMLDivElement>(null);
  const statusRef = React.useRef<HTMLSpanElement>(null);
  const reclaimRef = React.useRef(false);
  const hadInteractionFocusRef = React.useRef(false);
  const previousBusyRef = React.useRef(busy);
  const resolved = outcome != null;
  const status = resolved
    ? resultWord[outcome.result]
    : busy
      ? "Recording answer"
      : "Needs your input";
  const step =
    !resolved && currentStep != null && totalSteps != null && totalSteps > 0
      ? `${Math.min(Math.max(1, currentStep), totalSteps)} / ${totalSteps}`
      : null;
  const audit =
    resolved &&
    (outcome.by != null || outcome.at != null || outcome.content != null);

  React.useLayoutEffect(() => {
    const busyEndedWithoutOutcome =
      previousBusyRef.current && !busy && !resolved;
    previousBusyRef.current = busy;
    if (busyEndedWithoutOutcome) {
      reclaimRef.current = false;
      hadInteractionFocusRef.current = false;
      return;
    }
    if (
      (!busy && !resolved) ||
      (!reclaimRef.current && !hadInteractionFocusRef.current)
    ) {
      return;
    }
    statusRef.current?.focus();
    hadInteractionFocusRef.current = false;
    if (resolved) reclaimRef.current = false;
  }, [busy, resolved]);

  const invoke = (action: (() => void) | undefined) => {
    if (action == null) return;
    reclaimRef.current = true;
    action();
  };

  return (
    <section
      {...props}
      aria-busy={busy || undefined}
      aria-labelledby={titleId}
      className={cx(sx(agentSurface.decision, xstyle), className)}
      role="group"
    >
      <div className={sx(agentSurface.metaRow)}>
        <span
          className={sx(agentSurface.metaRowLabel, styles.title)}
          id={titleId}
        >
          {title}
        </span>
        <span className={sx(styles.headerMeta)}>
          {step == null ? null : (
            <span
              aria-label={`Step ${step.replace(" / ", " of ")}`}
              className={sx(agentSurface.meta)}
            >
              {step}
            </span>
          )}
          <span
            aria-describedby={audit ? auditId : undefined}
            className={sx(
              styles.status,
              resolved ? resultTone[outcome.result] : agentStatusWord.warning,
              focusRing.ring,
              transition.colors,
            )}
            onBlur={() => {
              reclaimRef.current = false;
            }}
            ref={statusRef}
            tabIndex={-1}
          >
            {status}
          </span>
        </span>
      </div>
      {description == null ? null : (
        <p className={sx(styles.description)}>{description}</p>
      )}
      {resolved ? (
        audit ? (
          <ClarificationAudit id={auditId} outcome={outcome} />
        ) : null
      ) : (
        <div
          aria-disabled={busy || undefined}
          className={sx(styles.interaction)}
          inert={busy || undefined}
          onBlurCapture={(event) => {
            if (event.relatedTarget == null) {
              queueMicrotask(() => {
                if (!interactionRef.current?.contains(document.activeElement)) {
                  hadInteractionFocusRef.current = false;
                }
              });
            } else if (
              !event.currentTarget.contains(event.relatedTarget as Node)
            ) {
              hadInteractionFocusRef.current = false;
            }
          }}
          onFocusCapture={() => {
            hadInteractionFocusRef.current = true;
          }}
          ref={interactionRef}
        >
          {children == null ? null : (
            <div className={sx(styles.fields)}>{children}</div>
          )}
          <div className={sx(styles.actions)}>
            <Button
              disabled={busy || onContinue == null}
              onClick={() => invoke(onContinue)}
              size="sm"
              variant="primary"
            >
              {continueLabel}
            </Button>
            {onSkip == null ? null : (
              <Button
                disabled={busy}
                onClick={() => invoke(onSkip)}
                size="sm"
                variant="quiet"
              >
                {skipLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ClarificationAudit({
  id,
  outcome,
}: {
  id: string;
  outcome: ClarificationOutcome;
}) {
  return (
    <div className={sx(styles.audit)} id={id}>
      {outcome.content == null ? null : (
        <div className={sx(agentSurface.well, styles.answer)}>
          <span className={sx(styles.answerLabel)}>Recorded answer</span>
          <span className={sx(styles.answerCopy)}>{outcome.content}</span>
        </div>
      )}
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
    </div>
  );
}

const styles = stylex.create({
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
  },
  headerMeta: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars.space8,
  },
  status: {
    borderRadius: vars.radiusMark,
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
  fields: { display: "grid", gap: vars.space12, minInlineSize: 0 },
  interaction: { display: "grid", gap: vars.space12, minInlineSize: 0 },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  audit: { display: "grid", gap: vars.space8, minInlineSize: 0 },
  answer: { gap: vars.space4 },
  answerLabel: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
  },
  answerCopy: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  by: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
  },
});
