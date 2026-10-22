import { i18n, Trans, useTranslation } from "@/i18n";
import type { KeyboardEvent } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ToolApprovalCard } from "@/components/session/ToolApprovalCard";
import { Button, Kbd } from "@/components/ui";
import { buildShortQuestionAnswers } from "@/lib/fleet/inline-interaction";
import type { FleetInteractionResponse } from "@/lib/fleet/interaction-respond";
import { attentionStyles as styles } from "./fleet-attention-inbox.styles";
import type { FleetRowInteraction } from "./useFleetRowInteraction";

/** A field that takes typed text; its keys are letters, not answers. */
function isTextEntryTarget(target: EventTarget | null) {
  const element = target as
    | (Partial<Pick<HTMLInputElement, "tagName" | "type" | "isContentEditable">>)
    | null;
  if (!element || typeof element.tagName !== "string") {
    return false;
  }
  const tag = element.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (tag === "INPUT") {
    return element.type !== "radio" && element.type !== "checkbox";
  }
  return element.isContentEditable === true;
}

/**
 * The response a key press in a focused Fleet row stands for: `A` allows an
 * approval once, `D` denies it, `1`–`9` picks an option of a short question.
 * Modified, composing, repeated and typed keys mean nothing here, so a held
 * key never answers twice and a field keeps its letters.
 */
export function resolveFleetRowKey(
  event: Pick<
    KeyboardEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat" | "target"
  > & { isComposing?: boolean },
  interaction: Pick<FleetRowInteraction, "inline" | "busy">,
): FleetInteractionResponse | null {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    interaction.busy ||
    isTextEntryTarget(event.target)
  ) {
    return null;
  }
  const { inline } = interaction;
  if (inline.kind === "approval") {
    const key = event.key.toLowerCase();
    if (key === "a") return { kind: "approval", approved: true, scope: "once" };
    if (key === "d") return { kind: "approval", approved: false };
    return null;
  }
  if (inline.kind === "short-question" && /^[1-9]$/.test(event.key)) {
    const option = inline.options[Number(event.key) - 1];
    return option
      ? {
          kind: "user-input",
          answers: buildShortQuestionAnswers(inline.question, option),
        }
      : null;
  }
  return null;
}

/** The keys a row answers to, for `aria-keyshortcuts` on its trigger. */
export function describeFleetRowKeys(
  interaction: Pick<FleetRowInteraction, "inline">,
) {
  const { inline } = interaction;
  if (inline.kind === "approval") return "A D";
  if (inline.kind === "short-question") {
    return inline.options
      .slice(0, 9)
      .map((_, index) => String(index + 1))
      .join(" ");
  }
  return undefined;
}

/**
 * The request a Fleet row names, answered in the row: an approval as the same
 * compact approval card the composer uses, a short question as its options.
 * Long forms, other repositories and requests that are no longer pending say
 * so and leave the row's Open action to take over. There is no Undo: an
 * answer is delivered to the agent the moment it is given.
 */
export function FleetRowInlineAnswer(props: {
  interaction: FleetRowInteraction;
  onAnswer: (response: FleetInteractionResponse) => void;
}) {
  useTranslation();
  const { interaction, onAnswer } = props;
  if (!interaction.identity) {
    return null;
  }
  const { inline } = interaction;
  const note = interaction.error
    ? null
    : interaction.otherRepository
      ? i18n.t("fleet:inlineAnswer.otherRepository")
      : interaction.loading
        ? i18n.t("fleet:inlineAnswer.loading")
        : interaction.settled
          ? i18n.t("fleet:inlineAnswer.answered")
          : interaction.pending && inline.kind === "open"
            ? i18n.t("fleet:inlineAnswer.openInTask")
            : interaction.busy && inline.kind === "short-question"
              ? i18n.t("fleet:inlineAnswer.sending")
              : null;

  if (inline.kind === "open" && !note && !interaction.error) {
    return null;
  }

  return (
    <div className={sx(styles.inlineAnswer)} data-fleet-inline-answer={inline.kind}>
      {inline.kind === "approval" ? (
        <ToolApprovalCard
          actions={
            interaction.busy ? undefined : (
              <span aria-hidden="true" className={sx(styles.inlineKeyHint)}>
                <Trans
                  i18n={i18n}
                  ns="fleet"
                  i18nKey="inlineAnswer.approvalKeys"
                  components={{ key: <Kbd /> }}
                />
              </span>
            )
          }
          allowAlways={!interaction.managed}
          busy={interaction.busy}
          density="compact"
          onDecide={(decision) =>
            onAnswer({
              kind: "approval",
              approved: decision.approved,
              scope: decision.scope,
            })
          }
          part={inline.part}
        />
      ) : null}
      {inline.kind === "short-question" ? (
        <div
          aria-label={i18n.t("fleet:inlineAnswer.optionsLabel", {
            question: inline.question.question,
          })}
          className={sx(styles.inlineQuestion)}
          role="group"
        >
          <p className={sx(styles.inlineQuestionText)}>{inline.question.question}</p>
          <div className={sx(styles.inlineOptions)}>
            {inline.options.map((option, index) => (
              <Button
                aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                disabled={interaction.busy}
                key={option.value}
                onClick={() =>
                  onAnswer({
                    kind: "user-input",
                    answers: buildShortQuestionAnswers(inline.question, option),
                  })
                }
                size="sm"
                title={option.description}
                type="button"
                variant="outline"
                xstyle={styles.inlineOption}
              >
                <Kbd aria-hidden="true">{index + 1}</Kbd>
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {interaction.error ? (
        <p className={sx(styles.inlineNote, styles.inlineNoteError)} role="alert">
          {interaction.error}
        </p>
      ) : note ? (
        <p aria-live="polite" className={sx(styles.inlineNote)} role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
