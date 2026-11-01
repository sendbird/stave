import { i18n, useTranslation } from "@/i18n";
import type { KeyboardEvent } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Button, Kbd } from "@/components/ui";
import { buildShortQuestionAnswers } from "@/lib/fleet/inline-interaction";
import type { FleetInteractionResponse } from "@/lib/fleet/interaction-respond";
import { inboxRowStyles as styles } from "./inbox-row.styles";
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
 * The request a Fleet row names, answered on the row's own line: Allow and
 * Deny for an approval (with their A / D keys), the numbered options for a
 * short question. Always allow and the full request stay one Open away, in
 * the task's controls. Long forms, other repositories and requests that are
 * no longer pending say so and leave the row's Open action to take over.
 * There is no Undo: an answer is delivered to the agent the moment it is given.
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
    <div className={sx(styles.inlineAnswerCompact)} data-fleet-inline-answer={inline.kind}>
      {inline.kind === "approval" && !interaction.busy ? (
        <>
          <Button
            aria-keyshortcuts="A"
            aria-label={i18n.t("fleet:inlineAnswer.allowOnceLabel", { tool: inline.part.toolName })}
            onClick={() => onAnswer({ kind: "approval", approved: true, scope: "once" })}
            size="sm"
            type="button"
            xstyle={styles.inlineOptionCompact}
          >
            <Kbd aria-hidden="true">A</Kbd>
            {i18n.t("fleet:inlineAnswer.allow")}
          </Button>
          <Button
            aria-keyshortcuts="D"
            aria-label={i18n.t("fleet:inlineAnswer.denyLabel", { tool: inline.part.toolName })}
            onClick={() => onAnswer({ kind: "approval", approved: false })}
            size="sm"
            type="button"
            variant="outline"
            xstyle={styles.inlineOptionCompact}
          >
            <Kbd aria-hidden="true">D</Kbd>
            {i18n.t("fleet:inlineAnswer.deny")}
          </Button>
        </>
      ) : null}
      {inline.kind === "short-question" ? (
        <div
          aria-label={i18n.t("fleet:inlineAnswer.optionsLabel", {
            question: inline.question.question,
          })}
          className={sx(styles.inlineOptionsCompact)}
          role="group"
          title={inline.question.question}
        >
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
              xstyle={styles.inlineOptionCompact}
            >
              <Kbd aria-hidden="true">{index + 1}</Kbd>
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {interaction.error ? (
        <p className={sx(styles.inlineNote, styles.inlineNoteCompact, styles.inlineNoteError)} role="alert" title={interaction.error}>
          {interaction.error}
        </p>
      ) : note || (inline.kind === "approval" && interaction.busy) ? (
        <p aria-live="polite" className={sx(styles.inlineNote, styles.inlineNoteCompact)} role="status">
          {note ?? i18n.t("fleet:inlineAnswer.sending")}
        </p>
      ) : null}
    </div>
  );
}
