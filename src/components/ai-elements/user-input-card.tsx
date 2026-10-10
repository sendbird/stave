import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, CircleHelp, ExternalLink, PencilLine } from "lucide-react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import {
  displayUserInputOptionLabel,
  shouldShowUserInputRecommendedBadge,
} from "@/lib/user-input-options";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { userInputCardStyles as styles } from "./user-input-card.styles";
import type { UserInputQuestion } from "@/types/chat";

/**
 * `composer` replaces the prompt input and carries its own height cap;
 * `embedded` sits inside a host card that owns the frame and the cap (the
 * delegated-request slot), so it only lets the questions scroll; `inline` is a
 * bordered card in the transcript; `summary` is compact while awaiting input.
 * Answered requests retain the question layout as a read-only record.
 */
export type UserInputCardPresentation =
  "composer" | "embedded" | "inline" | "summary";

interface UserInputCardProps {
  toolName: string;
  questions: UserInputQuestion[];
  state:
    | "input-requested"
    | "input-responded"
    | "input-interrupted"
    | "input-denied";
  answers?: Record<string, string>;
  onSubmit?: (answers: Record<string, string>) => void;
  onDeny?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  presentation?: UserInputCardPresentation;
}

interface QuestionSelection {
  selected: string[];
  custom: string;
}

function getQuestionKey(question: UserInputQuestion) {
  return question.key?.trim() || question.question;
}

function parseAnswerValue(args: {
  value?: string;
  multiSelect?: boolean;
  optionValues: string[];
}): QuestionSelection {
  const raw = args.value?.trim() ?? "";
  if (!raw) {
    return { selected: [], custom: "" };
  }
  const separator = raw.includes("\n") ? "\n" : ",";
  const parts =
    args.multiSelect && !args.optionValues.includes(raw)
      ? raw
          .split(separator)
          .map((part) => part.trim())
          .filter(Boolean)
      : [raw];
  const selected = parts.filter((part) => args.optionValues.includes(part));
  const custom = selected.length === 0
    ? raw
    : parts
        .filter((part) => !args.optionValues.includes(part))
        .join(separator === "\n" ? "\n" : ", ");
  return { selected, custom };
}

function getRequestStateCopy(state: UserInputCardProps["state"]): {
  title: string;
  detail: string;
} {
  switch (state) {
    case "input-responded":
      return {
        title: i18n.t("composer:userInputCard.title"),
        detail: i18n.t("composer:userInputCard.detail"),
      };
    case "input-denied":
      return {
        title: i18n.t("composer:userInputCard.title2"),
        detail: i18n.t("composer:userInputCard.detail2"),
      };
    case "input-interrupted":
      return {
        title: i18n.t("composer:userInputCard.title3"),
        detail: i18n.t("composer:userInputCard.detail3"),
      };
    default:
      return {
        title: i18n.t("composer:userInputCard.title4"),
        detail: i18n.t("composer:userInputCard.detail4"),
      };
  }
}

function UserInputSummary(args: {
  questions: UserInputQuestion[];
  state: UserInputCardProps["state"];
}) {
  useTranslation();
  const copy = getRequestStateCopy(args.state);
  const firstQuestion = args.questions[0]?.question.trim();

  return (
    <div
      className={sx(styles.summary)}
      role={args.state === "input-requested" ? undefined : "status"}
      aria-live={args.state === "input-requested" ? undefined : "polite"}
    >
      <div className={sx(styles.summaryRow)}>
        <span className={sx(styles.summaryBadge)}>
          {args.state === "input-responded" ? (
            <Check className={sx(styles.iconSm)} aria-hidden />
          ) : (
            <CircleHelp className={sx(styles.iconSm)} aria-hidden />
          )}
        </span>
        <div className={sx(styles.summaryBody)}>
          <p className={sx(styles.summaryTitle)}>{copy.title}</p>
          <p className={sx(styles.summaryDetail)}>{copy.detail}</p>
          {args.state === "input-requested" && firstQuestion ? (
            <p className={sx(styles.summaryFirstQuestion)}>
              {firstQuestion}
              {args.questions.length > 1 ? (
                <span className={sx(styles.summaryMoreCount)}>
                  {" "}
                  · +{args.questions.length - 1}{" "}
                  {i18n.t("composer:userInputCard.userInputSummary")}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function UserInputCard(args: UserInputCardProps) {
  useTranslation();
  const {
    questions,
    state,
    answers,
    onSubmit,
    onDeny,
    disabled,
    disabledReason,
    presentation = "inline",
  } = args;
  const readOnly = state === "input-responded";
  const formId = useId();
  const initialSelectionByQuestion = useMemo(
    () =>
      Object.fromEntries(
        questions.map((question) => {
          const parsed = parseAnswerValue({
            value:
              answers?.[getQuestionKey(question)] ??
              answers?.[question.header] ??
              (readOnly ? undefined : question.defaultValue),
            multiSelect: question.multiSelect,
            optionValues: question.options.map(
              (option) => option.value ?? option.label,
            ),
          });
          return [getQuestionKey(question), parsed];
        }),
      ) as Record<string, QuestionSelection>,
    [answers, questions, readOnly],
  );
  const initialCustomOpenByQuestion = useMemo(
    () =>
      Object.fromEntries(
        questions.map((question) => {
          const selection =
            initialSelectionByQuestion[getQuestionKey(question)];
          return [
            getQuestionKey(question),
            question.options.length === 0 || Boolean(selection?.custom),
          ];
        }),
      ) as Record<string, boolean>,
    [initialSelectionByQuestion, questions],
  );
  const [selectionByQuestion, setSelectionByQuestion] = useState(
    initialSelectionByQuestion,
  );
  const [customOpenByQuestion, setCustomOpenByQuestion] = useState(
    initialCustomOpenByQuestion,
  );

  useEffect(() => {
    setSelectionByQuestion(initialSelectionByQuestion);
    setCustomOpenByQuestion(initialCustomOpenByQuestion);
  }, [initialCustomOpenByQuestion, initialSelectionByQuestion]);

  const compiledAnswers = useMemo(
    () =>
      Object.fromEntries(
        questions.flatMap((question) => {
          const questionKey = getQuestionKey(question);
          if (question.inputType === "url_notice") {
            return [];
          }
          const selection = selectionByQuestion[questionKey] ?? {
            selected: [],
            custom: "",
          };
          const values = [...selection.selected];
          if (selection.custom.trim()) {
            values.push(selection.custom.trim());
          }
          if (values.length === 0) {
            return [];
          }
          return [[questionKey, values.join(", ")]];
        }),
      ) as Record<string, string>,
    [questions, selectionByQuestion],
  );

  const isReady = questions.every((question) => {
    if (question.inputType === "url_notice") {
      return true;
    }
    if (question.required === false) {
      return true;
    }
    return Boolean(compiledAnswers[getQuestionKey(question)]?.trim());
  });

  if (
    (!readOnly && presentation === "summary") ||
    state === "input-denied" ||
    state === "input-interrupted"
  ) {
    return <UserInputSummary questions={questions} state={state} />;
  }

  const questionCountLabel =
    questions.length === 1
      ? i18n.t("composer:userInputCard.questionCountLabel")
      : questions.length > 1
        ? i18n.t("composer:userInputCard.questionCountLabel2", {
            value1: questions.length,
          })
        : i18n.t("composer:userInputCard.questionCountLabel3");

  const formPresentationStyle =
    readOnly || presentation === "inline"
      ? styles.formInline
      : presentation === "composer"
        ? styles.formComposer
        : presentation === "embedded"
          ? styles.formEmbedded
          : null;
  const questionsWrapComposerStyle =
    !readOnly && (presentation === "composer" || presentation === "embedded")
      ? styles.questionsWrapComposer
      : null;
  const Container = readOnly ? "section" : "form";
  const copy = getRequestStateCopy(state);

  return (
    <Container
      aria-labelledby={`${formId}-title`}
      className={sx(styles.formBase, formPresentationStyle)}
      data-user-input-state={state}
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly && !disabled && isReady) {
          onSubmit?.(compiledAnswers);
        }
      }}
    >
      <header className={sx(styles.header)}>
        <span className={sx(styles.headerBadge)}>
          {readOnly ? (
            <Check className={sx(styles.iconMd)} aria-hidden />
          ) : (
            <CircleHelp className={sx(styles.iconMd)} aria-hidden />
          )}
        </span>
        <div
          className={sx(styles.headerBody, readOnly && focusRing.ring)}
          role={readOnly ? "status" : undefined}
          aria-live={readOnly ? "polite" : undefined}
          tabIndex={readOnly ? -1 : undefined}
        >
          <h3 id={`${formId}-title`} className={sx(styles.headerTitle)}>
            {readOnly
              ? copy.title
              : i18n.t("composer:userInputCard.userInputCard")}
          </h3>
          <p className={sx(styles.headerDetail)}>
            {readOnly ? copy.detail : questionCountLabel}
          </p>
        </div>
      </header>

      {questions.length > 0 ? (
        <div
          className={sx(
            styles.questionsWrap,
            // The composer is height-capped, so long question sets have to scroll
            // here instead of pushing the footer actions out of the viewport.
            questionsWrapComposerStyle,
          )}
        >
          {questions.map((question, questionIndex) => {
            const questionKey = getQuestionKey(question);
            const selections = readOnly
              ? initialSelectionByQuestion
              : selectionByQuestion;
            const selection = selections[questionKey] ?? {
              selected: [],
              custom: "",
            };
            const inputType = question.inputType ?? "text";
            const supportsCustom =
              question.allowCustom !== false &&
              inputType !== "boolean" &&
              inputType !== "url_notice";
            const customOpen =
              customOpenByQuestion[questionKey] ||
              question.options.length === 0;
            const selectionHint = question.multiSelect
              ? i18n.t("composer:userInputCard.selectionHint")
              : question.options.length > 0
                ? i18n.t("composer:userInputCard.selectionHint2")
                : question.required === false
                  ? i18n.t("composer:userInputCard.selectionHint3")
                  : i18n.t("composer:userInputCard.selectionHint4");

            return (
              <div
                key={questionKey}
                className={sx(questionIndex > 0 && styles.questionBlockDivided)}
              >
                <fieldset className={sx(styles.fieldset)}>
                  <legend className={sx(styles.legend)}>
                    <span className={sx(styles.legendHeaderRow)}>
                      <span className={sx(styles.legendHeader)}>
                        {question.header}
                      </span>
                      {readOnly ? null : (
                        <span className={sx(styles.legendHint)}>
                          {selectionHint}
                        </span>
                      )}
                    </span>
                    <span className={sx(styles.legendQuestion)}>
                      {question.question}
                    </span>
                  </legend>

                  {question.options.length > 0 ? (
                    <div className={sx(styles.optionsGrid)}>
                      {question.options.map((option) => {
                        const optionValue = option.value ?? option.label;
                        const isSelected =
                          selection.selected.includes(optionValue);
                        const isRecommended =
                          shouldShowUserInputRecommendedBadge({
                            option,
                            options: question.options,
                          });
                        return (
                          <label
                            key={optionValue}
                            className={sx(
                              styles.option,
                              focusRing.ringWithin,
                              isSelected && styles.optionSelected,
                              readOnly && styles.optionReadOnly,
                              !readOnly && disabled && styles.optionDisabled,
                            )}
                          >
                            <input
                              className={sx(styles.srOnly)}
                              type={question.multiSelect ? "checkbox" : "radio"}
                              name={`${formId}-question-${questionIndex}`}
                              value={optionValue}
                              checked={isSelected}
                              disabled={readOnly || disabled}
                              onChange={() => {
                                setSelectionByQuestion((current) => {
                                  const previous = current[questionKey] ?? {
                                    selected: [],
                                    custom: "",
                                  };
                                  const nextSelected = question.multiSelect
                                    ? isSelected
                                      ? previous.selected.filter(
                                          (value) => value !== optionValue,
                                        )
                                      : [...previous.selected, optionValue]
                                    : [optionValue];
                                  return {
                                    ...current,
                                    [questionKey]: {
                                      selected: nextSelected,
                                      custom: question.multiSelect
                                        ? previous.custom
                                        : "",
                                    },
                                  };
                                });
                                if (!question.multiSelect) {
                                  setCustomOpenByQuestion((current) => ({
                                    ...current,
                                    [questionKey]: false,
                                  }));
                                }
                              }}
                            />
                            <span
                              className={sx(
                                styles.optionMark,
                                question.multiSelect
                                  ? styles.optionMarkCheckbox
                                  : styles.optionMarkRadio,
                                isSelected
                                  ? styles.optionMarkSelected
                                  : styles.optionMarkUnselected,
                              )}
                              aria-hidden
                            >
                              {isSelected ? (
                                question.multiSelect ? (
                                  <Check className={sx(styles.iconXs)} />
                                ) : (
                                  <span className={sx(styles.radioDot)} />
                                )
                              ) : null}
                            </span>
                            <span className={sx(styles.optionBody)}>
                              <span className={sx(styles.optionLabelRow)}>
                                <span className={sx(styles.optionLabel)}>
                                  {displayUserInputOptionLabel(option.label)}
                                </span>
                                {isRecommended ? (
                                  <Badge
                                    variant="secondary"
                                    className={sx(styles.recommendedBadge)}
                                  >
                                    {i18n.t("composer:userInputCard.copy")}
                                  </Badge>
                                ) : null}
                              </span>
                              {option.description ? (
                                <span className={sx(styles.optionDescription)}>
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {inputType === "url_notice" && question.linkUrl ? (
                    <div className={sx(styles.urlNotice)}>
                      <p className={sx(styles.urlNoticeText)}>
                        {question.linkUrl}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={sx(styles.urlNoticeButton)}
                        disabled={disabled}
                        onClick={() =>
                          void window.api?.shell?.openExternal?.({
                            url: question.linkUrl!,
                          })
                        }
                      >
                        <ExternalLink className={sx(styles.iconSm)} />
                        {i18n.t("composer:userInputCard.copy2")}
                      </Button>
                    </div>
                  ) : null}

                  {readOnly &&
                  inputType !== "url_notice" &&
                  (selection.custom || selection.selected.length === 0) ? (
                    <p className={sx(styles.recordedAnswer)}>
                      {selection.custom ||
                        i18n.t("composer:userInputCard.extraCopy74")}
                    </p>
                  ) : null}

                  {!readOnly &&
                  supportsCustom &&
                  question.options.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={sx(styles.customToggle)}
                      disabled={disabled}
                      aria-expanded={customOpen}
                      onClick={() => {
                        setCustomOpenByQuestion((current) => ({
                          ...current,
                          [questionKey]: !customOpen,
                        }));
                        if (!customOpen && !question.multiSelect) {
                          setSelectionByQuestion((current) => ({
                            ...current,
                            [questionKey]: {
                              ...(current[questionKey] ?? {
                                selected: [],
                                custom: "",
                              }),
                              selected: [],
                            },
                          }));
                        }
                      }}
                    >
                      <PencilLine className={sx(styles.iconSm)} />
                      {question.multiSelect
                        ? i18n.t("composer:userInputCard.copy3")
                        : i18n.t("composer:userInputCard.copy4")}
                    </Button>
                  ) : null}

                  {!readOnly && supportsCustom && customOpen ? (
                    <div className={sx(styles.customInputWrap)}>
                      {inputType === "number" || inputType === "integer" ? (
                        <Input
                          type="number"
                          value={selection.custom}
                          disabled={disabled}
                          aria-label={i18n.t(
                            "composer:userInputCard.ariaLabel",
                            { value1: question.question },
                          )}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelectionByQuestion((current) => ({
                              ...current,
                              [questionKey]: {
                                selected: question.multiSelect
                                  ? (current[questionKey]?.selected ?? [])
                                  : [],
                                custom: value,
                              },
                            }));
                          }}
                          placeholder={question.placeholder || "Enter a number"}
                        />
                      ) : (
                        <Textarea
                          value={selection.custom}
                          disabled={disabled}
                          aria-label={i18n.t(
                            "composer:userInputCard.ariaLabel2",
                            { value1: question.question },
                          )}
                          className={sx(styles.customTextarea)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelectionByQuestion((current) => ({
                              ...current,
                              [questionKey]: {
                                selected: question.multiSelect
                                  ? (current[questionKey]?.selected ?? [])
                                  : [],
                                custom: value,
                              },
                            }));
                          }}
                          placeholder={
                            question.placeholder ||
                            (question.options.length > 0
                              ? i18n.t("composer:userInputCard.placeholder")
                              : i18n.t("composer:userInputCard.placeholder2"))
                          }
                        />
                      )}
                    </div>
                  ) : null}
                </fieldset>
              </div>
            );
          })}
        </div>
      ) : null}

      {!readOnly ? (
        <div className={sx(styles.footer)}>
          <Button type="submit" size="sm" disabled={disabled || !isReady}>
            {i18n.t("composer:userInputCard.userInputCard2")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onDeny}
          >
            {i18n.t("composer:userInputCard.userInputCard3")}
          </Button>
          {disabledReason ? (
            <p className={sx(styles.disabledReason)} role="status">
              {disabledReason}
            </p>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
