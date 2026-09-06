import { useEffect, useId, useMemo, useState } from "react";
import { Check, CircleHelp, ExternalLink, PencilLine } from "lucide-react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import {
  displayUserInputOptionLabel,
  shouldShowUserInputRecommendedBadge,
} from "@/lib/user-input-options";
import { cx, sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { userInputCardStyles as styles } from "./user-input-card.styles";
import type { UserInputQuestion } from "@/types/chat";

export type UserInputCardPresentation = "composer" | "inline" | "summary";

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
  const parts = args.multiSelect
    ? raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [raw];
  const selected = parts.filter((part) => args.optionValues.includes(part));
  const custom = parts
    .filter((part) => !args.optionValues.includes(part))
    .join(", ");
  return { selected, custom };
}

function getRequestStateCopy(state: UserInputCardProps["state"]): {
  title: string;
  detail: string;
} {
  switch (state) {
    case "input-responded":
      return {
        title: "Answered",
        detail: "Your response was sent to the agent.",
      };
    case "input-denied":
      return {
        title: "Answer declined",
        detail: "The agent will continue without a response when possible.",
      };
    case "input-interrupted":
      return {
        title: "Question expired",
        detail: "The turn ended before this question was answered.",
      };
    default:
      return {
        title: "Question ready",
        detail: "Answer in the composer below to continue.",
      };
  }
}

function UserInputSummary(args: {
  questions: UserInputQuestion[];
  state: UserInputCardProps["state"];
  answers?: Record<string, string>;
}) {
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
          <p className={sx(styles.summaryDetail)}>
            {copy.detail}
          </p>
          {args.state === "input-requested" && firstQuestion ? (
            <p className={sx(styles.summaryFirstQuestion)}>
              {firstQuestion}
              {args.questions.length > 1 ? (
                <span className={sx(styles.summaryMoreCount)}>
                  {" "}
                  · +{args.questions.length - 1} more
                </span>
              ) : null}
            </p>
          ) : null}
          {args.state === "input-responded" ? (
            <dl className={sx(styles.answerList)}>
              {args.questions.map((question) => {
                const answer =
                  args.answers?.[getQuestionKey(question)] ??
                  (question.inputType === "url_notice"
                    ? "Accepted"
                    : "No answer");
                const displayAnswer = answer
                  .split(",")
                  .map((value) => value.trim())
                  .map((value) => {
                    const option = question.options.find(
                      (candidate) =>
                        (candidate.value ?? candidate.label) === value,
                    );
                    return option
                      ? displayUserInputOptionLabel(option.label)
                      : value;
                  })
                  .join(", ");
                return (
                  <div
                    key={getQuestionKey(question)}
                    className={sx(styles.answerRow)}
                  >
                    <dt className={sx(styles.answerTerm)}>
                      {question.header}
                    </dt>
                    <dd className={sx(styles.answerValue)}>
                      {displayAnswer}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function UserInputCard(args: UserInputCardProps) {
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
  const formId = useId();
  const initialSelectionByQuestion = useMemo(
    () =>
      Object.fromEntries(
        questions.map((question) => {
          const parsed = parseAnswerValue({
            value: answers?.[getQuestionKey(question)] ?? question.defaultValue,
            multiSelect: question.multiSelect,
            optionValues: question.options.map(
              (option) => option.value ?? option.label,
            ),
          });
          return [getQuestionKey(question), parsed];
        }),
      ) as Record<string, QuestionSelection>,
    [answers, questions],
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

  if (presentation === "summary" || state !== "input-requested") {
    return (
      <UserInputSummary questions={questions} state={state} answers={answers} />
    );
  }

  const questionCountLabel =
    questions.length === 1
      ? "1 question · Answer to continue"
      : questions.length > 1
        ? `${questions.length} questions · Answer to continue`
        : "Confirmation needed to continue";

  const formPresentationStyle =
    presentation === "inline"
      ? styles.formInline
      : presentation === "composer"
        ? styles.formComposer
        : null;
  const questionsWrapComposerStyle =
    presentation === "composer" ? styles.questionsWrapComposer : null;

  return (
    <form
      aria-labelledby={`${formId}-title`}
      className={sx(styles.formBase, formPresentationStyle)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && isReady) {
          onSubmit?.(compiledAnswers);
        }
      }}
    >
      <header className={sx(styles.header)}>
        <span className={sx(styles.headerBadge)}>
          <CircleHelp className={sx(styles.iconMd)} aria-hidden />
        </span>
        <div className={sx(styles.headerBody)}>
          <h3
            id={`${formId}-title`}
            className={sx(styles.headerTitle)}
          >
            Agent needs your input
          </h3>
          <p className={sx(styles.headerDetail)}>
            {questionCountLabel}
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
            const selection = selectionByQuestion[questionKey] ?? {
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
              ? "Select one or more"
              : question.options.length > 0
                ? "Select one"
                : question.required === false
                  ? "Optional"
                  : "Required";

            return (
              <div
                key={questionKey}
                className={sx(
                  questionIndex > 0 && styles.questionBlockDivided,
                )}
              >
                <fieldset className={sx(styles.fieldset)}>
                  <legend className={sx(styles.legend)}>
                    <span className={sx(styles.legendHeaderRow)}>
                      <span className={sx(styles.legendHeader)}>
                        {question.header}
                      </span>
                      <span className={sx(styles.legendHint)}>{selectionHint}</span>
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
                              disabled && styles.optionDisabled,
                            )}
                          >
                            <input
                              className={sx(styles.srOnly)}
                              type={question.multiSelect ? "checkbox" : "radio"}
                              name={`${formId}-question-${questionIndex}`}
                              value={optionValue}
                              checked={isSelected}
                              disabled={disabled}
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
                                    Recommended
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
                        Open link
                      </Button>
                    </div>
                  ) : null}

                  {supportsCustom && question.options.length > 0 ? (
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
                        ? "Add another answer"
                        : "Write a different answer"}
                    </Button>
                  ) : null}

                  {supportsCustom && customOpen ? (
                    <div className={sx(styles.customInputWrap)}>
                      {inputType === "number" || inputType === "integer" ? (
                        <Input
                          type="number"
                          value={selection.custom}
                          disabled={disabled}
                          aria-label={`Answer: ${question.question}`}
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
                          aria-label={`Answer: ${question.question}`}
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
                              ? "Write your answer"
                              : "Type your answer")
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

      <div className={sx(styles.footer)}>
        <Button type="submit" size="sm" disabled={disabled || !isReady}>
          Continue
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onDeny}
        >
          Decline to answer
        </Button>
        {disabledReason ? (
          <p
            className={sx(styles.disabledReason)}
            role="status"
          >
            {disabledReason}
          </p>
        ) : null}
      </div>
    </form>
  );
}
