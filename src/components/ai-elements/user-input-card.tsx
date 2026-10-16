import { i18n, Trans, useTranslation } from "@/i18n";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Check, CircleHelp, ExternalLink, PencilLine } from "lucide-react";
import { Badge, Button, Input, Kbd, Textarea } from "@/components/ui";
import {
  displayUserInputOptionLabel,
  shouldShowUserInputRecommendedBadge,
} from "@/lib/user-input-options";
import { Button as AdsButton } from "@/components/ads/components/Button";
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

const EMPTY_SELECTION: QuestionSelection = { selected: [], custom: "" };

/**
 * A single-choice pick moves to the next question after this pause, so the
 * chosen row registers visually before the step changes and a quick second
 * click can still land on the same question.
 */
const AUTO_ADVANCE_DELAY_MS = 200;

/** Number keys 1-9 pick the matching option of the visible question. */
const SHORTCUT_OPTION_LIMIT = 9;

function getQuestionKey(question: UserInputQuestion) {
  return question.key?.trim() || question.question;
}

function getOptionValue(option: UserInputQuestion["options"][number]) {
  return option.value ?? option.label;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return target.type !== "radio" && target.type !== "checkbox";
  }
  return target instanceof HTMLElement && target.isContentEditable;
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
            optionValues: question.options.map(getOptionValue),
          });
          return [getQuestionKey(question), parsed];
        }),
      ) as Record<string, QuestionSelection>,
    [answers, questions, readOnly],
  );
  const [selectionByQuestion, setSelectionByQuestion] = useState(
    initialSelectionByQuestion,
  );

  useEffect(() => {
    setSelectionByQuestion(initialSelectionByQuestion);
  }, [initialSelectionByQuestion]);

  // Several questions are answered one step at a time; the step resets only
  // when the request itself changes, not when the parent re-renders.
  const questionSetKey = questions.map(getQuestionKey).join("\u0000");
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [questionSetKey]);

  const formRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const customFieldRefs = useRef(
    new Map<string, HTMLTextAreaElement | HTMLInputElement>(),
  );
  const advanceTimerRef = useRef<number | null>(null);
  // Arrow keys move the checked radio natively; that is browsing, not a
  // decision, so it must not advance to the next question.
  const arrowNavigationRef = useRef(false);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer]);

  // The card takes the prompt input's place, so the input's focus is lost when
  // it appears. Reclaim only that lost focus so number keys work at once,
  // without pulling focus away from a terminal or editor the user is typing in.
  const claimsLostFocus = !readOnly && presentation === "composer";
  useEffect(() => {
    if (!claimsLostFocus) {
      return;
    }
    const active = document.activeElement;
    if (active === null || active === document.body) {
      formRef.current?.focus({ preventScroll: true });
    }
  }, [claimsLostFocus, questionSetKey]);

  const compiledAnswers = useMemo(
    () =>
      Object.fromEntries(
        questions.flatMap((question) => {
          const questionKey = getQuestionKey(question);
          if (question.inputType === "url_notice") {
            return [];
          }
          const selection = selectionByQuestion[questionKey] ?? EMPTY_SELECTION;
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

  const hasAnswer = (question: UserInputQuestion) =>
    Boolean(compiledAnswers[getQuestionKey(question)]?.trim());
  const isQuestionSatisfied = (question: UserInputQuestion) =>
    question.inputType === "url_notice" ||
    question.required === false ||
    hasAnswer(question);
  const isReady = questions.every(isQuestionSatisfied);

  if (
    (!readOnly && presentation === "summary") ||
    state === "input-denied" ||
    state === "input-interrupted"
  ) {
    return <UserInputSummary questions={questions} state={state} />;
  }

  const stepped = !readOnly && questions.length > 1;
  const lastIndex = questions.length - 1;
  const currentIndex = stepped ? Math.min(activeIndex, lastIndex) : 0;
  const currentQuestion = questions[currentIndex];
  const onLastStep = !stepped || currentIndex === lastIndex;
  const visibleQuestionIndexes = stepped
    ? [currentIndex]
    : questions.map((_, index) => index);

  // A control inside the question panel unmounts when the step changes; park
  // focus on the form first so number keys keep working on the next step.
  const keepFocusInForm = () => {
    const active = document.activeElement;
    if (active && panelRef.current?.contains(active)) {
      formRef.current?.focus({ preventScroll: true });
    }
  };

  const goToQuestion = (index: number) => {
    clearAdvanceTimer();
    keepFocusInForm();
    setActiveIndex(index);
  };

  const scheduleAdvance = (fromIndex: number) => {
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      keepFocusInForm();
      setActiveIndex((current) =>
        current === fromIndex ? fromIndex + 1 : current,
      );
    }, AUTO_ADVANCE_DELAY_MS);
  };

  const selectOption = (
    question: UserInputQuestion,
    questionIndex: number,
    optionValue: string,
    autoAdvance: boolean,
  ) => {
    const questionKey = getQuestionKey(question);
    setSelectionByQuestion((current) => {
      const previous = current[questionKey] ?? EMPTY_SELECTION;
      const wasSelected = previous.selected.includes(optionValue);
      const nextSelected = question.multiSelect
        ? wasSelected
          ? previous.selected.filter((value) => value !== optionValue)
          : [...previous.selected, optionValue]
        : [optionValue];
      return {
        ...current,
        [questionKey]: {
          selected: nextSelected,
          custom: question.multiSelect ? previous.custom : "",
        },
      };
    });
    if (
      autoAdvance &&
      stepped &&
      !question.multiSelect &&
      questionIndex < lastIndex
    ) {
      scheduleAdvance(questionIndex);
    }
  };

  const setCustomAnswer = (question: UserInputQuestion, value: string) => {
    const questionKey = getQuestionKey(question);
    setSelectionByQuestion((current) => {
      const previous = current[questionKey] ?? EMPTY_SELECTION;
      return {
        ...current,
        [questionKey]: {
          // Typing a different answer replaces a single choice.
          selected:
            question.multiSelect || value === "" ? previous.selected : [],
          custom: value,
        },
      };
    });
  };

  const advanceOrSubmit = () => {
    if (readOnly || disabled) {
      return;
    }
    clearAdvanceTimer();
    if (stepped && currentQuestion && currentIndex < lastIndex) {
      if (isQuestionSatisfied(currentQuestion)) {
        goToQuestion(currentIndex + 1);
      }
      return;
    }
    if (isReady) {
      onSubmit?.(compiledAnswers);
      return;
    }
    const firstMissing = questions.findIndex(
      (question) => !isQuestionSatisfied(question),
    );
    if (stepped && firstMissing >= 0) {
      goToQuestion(firstMissing);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (readOnly || disabled || event.defaultPrevented) {
      return;
    }
    if (
      event.nativeEvent.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    if (event.key.startsWith("Arrow")) {
      arrowNavigationRef.current = true;
      return;
    }
    arrowNavigationRef.current = false;
    const textEntry = isTextEntryTarget(event.target);
    if (event.key === "Enter") {
      if (
        event.target instanceof HTMLButtonElement ||
        event.target instanceof HTMLAnchorElement ||
        (textEntry && event.shiftKey)
      ) {
        return;
      }
      event.preventDefault();
      advanceOrSubmit();
      return;
    }
    if (textEntry || !currentQuestion || !/^[1-9]$/.test(event.key)) {
      return;
    }
    const optionIndex = Number(event.key) - 1;
    const option = currentQuestion.options[optionIndex];
    if (option) {
      event.preventDefault();
      selectOption(
        currentQuestion,
        currentIndex,
        getOptionValue(option),
        true,
      );
      return;
    }
    if (optionIndex === currentQuestion.options.length) {
      const field = customFieldRefs.current.get(
        getQuestionKey(currentQuestion),
      );
      if (field) {
        event.preventDefault();
        field.focus();
      }
    }
  };

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
  const compactTitles = readOnly || presentation === "inline";
  const Container = readOnly ? "section" : "form";
  const copy = getRequestStateCopy(state);
  const shortcutOptionCount = Math.min(
    currentQuestion?.options.length ?? 0,
    SHORTCUT_OPTION_LIMIT,
  );

  return (
    <Container
      ref={(node: HTMLElement | null) => {
        formRef.current = node;
      }}
      aria-labelledby={`${formId}-title`}
      className={sx(
        styles.formBase,
        formPresentationStyle,
        !readOnly && styles.formFocusTarget,
      )}
      data-user-input-state={state}
      tabIndex={readOnly ? undefined : -1}
      onKeyDown={readOnly ? undefined : handleKeyDown}
      onPointerDown={
        readOnly
          ? undefined
          : () => {
              arrowNavigationRef.current = false;
            }
      }
      onSubmit={(event) => {
        event.preventDefault();
        advanceOrSubmit();
      }}
    >
      {readOnly ? (
        <header className={sx(styles.header)}>
          <span className={sx(styles.headerBadge)}>
            <Check className={sx(styles.iconMd)} aria-hidden />
          </span>
          <div
            className={sx(styles.headerBody, focusRing.ring)}
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            <h3 id={`${formId}-title`} className={sx(styles.headerTitle)}>
              {copy.title}
            </h3>
            <p className={sx(styles.headerDetail)}>{copy.detail}</p>
          </div>
        </header>
      ) : (
        // The question itself is the visible title; this names the form for
        // assistive technology.
        <h3 id={`${formId}-title`} className={sx(styles.srOnly)}>
          {i18n.t("composer:userInputCard.userInputCard")}
        </h3>
      )}

      {stepped ? (
        <div
          className={sx(styles.steps)}
          role="group"
          aria-label={i18n.t("composer:userInputCard.stepsLabel")}
        >
          {questions.map((question, index) => {
            const answered = hasAnswer(question);
            const isCurrent = index === currentIndex;
            const label =
              question.header?.trim() ||
              i18n.t("composer:userInputCard.stepFallback", {
                index: index + 1,
              });
            return (
              <AdsButton
                key={getQuestionKey(question)}
                layout="host"
                type="button"
                xstyle={[styles.step, isCurrent && styles.stepCurrent]}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={i18n.t(
                  answered
                    ? "composer:userInputCard.stepAriaAnswered"
                    : "composer:userInputCard.stepAria",
                  { index: index + 1, total: questions.length, label },
                )}
                onClick={() => goToQuestion(index)}
              >
                <span
                  className={sx(
                    styles.stepMark,
                    answered && styles.stepMarkAnswered,
                  )}
                  aria-hidden
                >
                  {answered ? (
                    <Check className={sx(styles.iconXs)} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={sx(styles.stepLabel)}>{label}</span>
              </AdsButton>
            );
          })}
        </div>
      ) : null}

      {questions.length > 0 ? (
        <div
          ref={panelRef}
          className={sx(
            styles.questionsWrap,
            readOnly && styles.questionsWrapAfterHeader,
            // The composer is height-capped, so long question sets have to scroll
            // here instead of pushing the footer actions out of the viewport.
            questionsWrapComposerStyle,
          )}
        >
          {visibleQuestionIndexes.map((questionIndex, position) => {
            const question = questions[questionIndex]!;
            const questionKey = getQuestionKey(question);
            const selections = readOnly
              ? initialSelectionByQuestion
              : selectionByQuestion;
            const selection = selections[questionKey] ?? EMPTY_SELECTION;
            const inputType = question.inputType ?? "text";
            const numeric = inputType === "number" || inputType === "integer";
            const supportsCustom =
              question.allowCustom !== false &&
              inputType !== "boolean" &&
              inputType !== "url_notice";
            const hasOptions = question.options.length > 0;
            const hasCustom = selection.custom.trim().length > 0;
            const customLabel = i18n.t("composer:userInputCard.ariaLabel", {
              value1: question.question,
            });
            const registerCustomField = (
              node: HTMLTextAreaElement | HTMLInputElement | null,
            ) => {
              if (node) {
                customFieldRefs.current.set(questionKey, node);
              } else {
                customFieldRefs.current.delete(questionKey);
              }
            };

            const eyebrow: ReactNode[] = [];
            const header = question.header?.trim();
            if (header && !stepped) {
              eyebrow.push(
                <span key="header" className={sx(styles.eyebrowHeader)}>
                  {header}
                </span>,
              );
            }
            if (!readOnly && question.multiSelect) {
              eyebrow.push(
                <span key="hint">
                  {i18n.t("composer:userInputCard.selectionHint")}
                </span>,
              );
            } else if (!readOnly && question.required === false) {
              eyebrow.push(
                <span key="hint">
                  {i18n.t("composer:userInputCard.selectionHint3")}
                </span>,
              );
            }

            return (
              <div
                key={questionKey}
                className={sx(position > 0 && styles.questionBlockDivided)}
              >
                <fieldset className={sx(styles.fieldset)}>
                  <legend className={sx(styles.legend)}>
                    {eyebrow.length > 0 ? (
                      <span className={sx(styles.eyebrow)}>
                        {eyebrow.flatMap((part, index) =>
                          index === 0
                            ? [part]
                            : [
                                <span key={`separator-${index}`} aria-hidden>
                                  ·
                                </span>,
                                part,
                              ],
                        )}
                      </span>
                    ) : null}
                    <span
                      className={sx(
                        styles.questionTitle,
                        compactTitles && styles.questionTitleCompact,
                      )}
                    >
                      {question.question}
                    </span>
                  </legend>

                  {hasOptions ? (
                    <div className={sx(styles.optionList)}>
                      {question.options.map((option, optionIndex) => {
                        const optionValue = getOptionValue(option);
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
                              styles.optionRow,
                              optionIndex > 0 && styles.optionRowDivided,
                              focusRing.ringWithin,
                              styles.optionRowFocusInset,
                              isSelected && styles.optionRowSelected,
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
                                const autoAdvance = !arrowNavigationRef.current;
                                arrowNavigationRef.current = false;
                                selectOption(
                                  question,
                                  questionIndex,
                                  optionValue,
                                  autoAdvance,
                                );
                              }}
                            />
                            <span
                              className={sx(
                                styles.optionIndex,
                                isSelected && styles.optionIndexSelected,
                              )}
                              aria-hidden
                            >
                              {isSelected ? (
                                <Check className={sx(styles.iconXs)} />
                              ) : (
                                optionIndex + 1
                              )}
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

                      {!readOnly && supportsCustom ? (
                        <label
                          className={sx(
                            styles.optionRow,
                            styles.optionRowDivided,
                            styles.customRow,
                            focusRing.ringWithin,
                            styles.optionRowFocusInset,
                            hasCustom && styles.optionRowSelected,
                            disabled && styles.optionDisabled,
                          )}
                        >
                          <span
                            className={sx(
                              styles.optionIndex,
                              hasCustom && styles.optionIndexSelected,
                            )}
                            aria-hidden
                          >
                            <PencilLine className={sx(styles.iconXs)} />
                          </span>
                          {numeric ? (
                            <input
                              ref={registerCustomField}
                              type="number"
                              className={sx(styles.customInlineField)}
                              value={selection.custom}
                              disabled={disabled}
                              aria-label={customLabel}
                              placeholder={
                                question.placeholder ||
                                i18n.t(
                                  "composer:userInputCard.numberPlaceholder",
                                )
                              }
                              onChange={(event) =>
                                setCustomAnswer(question, event.target.value)
                              }
                            />
                          ) : (
                            <textarea
                              ref={registerCustomField}
                              rows={1}
                              className={sx(
                                styles.customInlineField,
                                styles.customInlineTextarea,
                              )}
                              value={selection.custom}
                              disabled={disabled}
                              aria-label={customLabel}
                              placeholder={
                                question.placeholder ||
                                (question.multiSelect
                                  ? i18n.t("composer:userInputCard.copy3")
                                  : i18n.t("composer:userInputCard.copy4"))
                              }
                              onChange={(event) =>
                                setCustomAnswer(question, event.target.value)
                              }
                            />
                          )}
                        </label>
                      ) : null}
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

                  {!readOnly && supportsCustom && !hasOptions ? (
                    <div className={sx(styles.customInputWrap)}>
                      {numeric ? (
                        <Input
                          ref={registerCustomField}
                          type="number"
                          value={selection.custom}
                          disabled={disabled}
                          aria-label={customLabel}
                          onChange={(event) =>
                            setCustomAnswer(question, event.target.value)
                          }
                          placeholder={
                            question.placeholder ||
                            i18n.t("composer:userInputCard.numberPlaceholder")
                          }
                        />
                      ) : (
                        <Textarea
                          ref={registerCustomField}
                          value={selection.custom}
                          disabled={disabled}
                          aria-label={customLabel}
                          className={sx(styles.customTextarea)}
                          onChange={(event) =>
                            setCustomAnswer(question, event.target.value)
                          }
                          placeholder={
                            question.placeholder ||
                            i18n.t("composer:userInputCard.placeholder2")
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
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={sx(styles.declineButton)}
            disabled={disabled}
            onClick={onDeny}
          >
            {i18n.t("composer:userInputCard.userInputCard3")}
          </Button>
          <div className={sx(styles.footerActions)}>
            {shortcutOptionCount >= 2 ? (
              <span className={sx(styles.keyboardHint)} aria-hidden>
                <Trans
                  i18n={i18n}
                  ns="composer"
                  i18nKey={
                    onLastStep
                      ? "userInputCard.keyboardHint"
                      : "userInputCard.keyboardHintNext"
                  }
                  values={{ last: shortcutOptionCount }}
                  components={{ key: <Kbd /> }}
                />
              </span>
            ) : null}
            {onLastStep ? (
              // Distinct keys keep React from turning the Next button into a
              // submit button during its own click.
              <Button
                key="continue"
                type="submit"
                size="sm"
                disabled={disabled || !isReady}
              >
                {i18n.t("composer:userInputCard.userInputCard2")}
              </Button>
            ) : (
              <Button
                key="next"
                type="button"
                size="sm"
                disabled={
                  disabled ||
                  !currentQuestion ||
                  !isQuestionSatisfied(currentQuestion)
                }
                onClick={advanceOrSubmit}
              >
                {i18n.t("composer:userInputCard.next")}
              </Button>
            )}
          </div>
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
