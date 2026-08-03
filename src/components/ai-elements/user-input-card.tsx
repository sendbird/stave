import { useEffect, useId, useMemo, useState } from "react";
import { Check, CircleHelp, ExternalLink, PencilLine } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
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
  optionLabels: string[];
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
  const selected = parts.filter((part) => args.optionLabels.includes(part));
  const custom = parts
    .filter((part) => !args.optionLabels.includes(part))
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
      className="rounded-lg border border-border/70 bg-background/70 p-3 text-[0.8125rem]"
      role={args.state === "input-requested" ? undefined : "status"}
      aria-live={args.state === "input-requested" ? undefined : "polite"}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {args.state === "input-responded" ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <CircleHelp className="size-3.5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{copy.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {copy.detail}
          </p>
          {args.state === "input-requested" && firstQuestion ? (
            <p className="mt-2 line-clamp-2 text-foreground">
              {firstQuestion}
              {args.questions.length > 1 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · +{args.questions.length - 1} more
                </span>
              ) : null}
            </p>
          ) : null}
          {args.state === "input-responded" ? (
            <dl className="mt-2 space-y-1.5">
              {args.questions.map((question) => {
                const answer =
                  args.answers?.[getQuestionKey(question)] ??
                  (question.inputType === "url_notice"
                    ? "Accepted"
                    : "No answer");
                return (
                  <div
                    key={getQuestionKey(question)}
                    className="grid grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] gap-3"
                  >
                    <dt className="truncate text-muted-foreground">
                      {question.header}
                    </dt>
                    <dd className="min-w-0 text-foreground break-words">
                      {answer}
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
            optionLabels: question.options.map((option) => option.label),
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

  return (
    <form
      aria-labelledby={`${formId}-title`}
      className={cn(
        "text-sm",
        presentation === "inline" &&
          "rounded-lg border border-border/70 bg-background/80 p-3",
        presentation === "composer" &&
          "flex max-h-[min(60vh,34rem)] flex-col p-4 sm:p-5",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && isReady) {
          onSubmit?.(compiledAnswers);
        }
      }}
    >
      <header className="flex shrink-0 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CircleHelp className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={`${formId}-title`}
            className="text-sm font-semibold leading-5 text-foreground"
          >
            Agent needs your input
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {questionCountLabel}
          </p>
        </div>
      </header>

      {questions.length > 0 ? (
        <div
          className={cn(
            "mt-4",
            // The composer is height-capped, so long question sets have to scroll
            // here instead of pushing the footer actions out of the viewport.
            presentation === "composer" &&
              "-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1",
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
                className={cn(
                  questionIndex > 0 && "mt-4 border-t border-border/60 pt-4",
                )}
              >
                <fieldset className="min-w-0">
                  <legend className="w-full">
                    <span className="flex items-center justify-between gap-3 text-xs leading-4 text-muted-foreground">
                      <span className="truncate font-medium">
                        {question.header}
                      </span>
                      <span className="shrink-0">{selectionHint}</span>
                    </span>
                    <span className="mt-1.5 block max-w-3xl text-sm font-medium leading-6 text-foreground">
                      {question.question}
                    </span>
                  </legend>

                  {question.options.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {question.options.map((option) => {
                        const isSelected = selection.selected.includes(
                          option.label,
                        );
                        return (
                          <label
                            key={option.label}
                            className={cn(
                              "relative flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                              "bg-background/45 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                              "hover:border-foreground/20 hover:bg-background/75",
                              "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/30",
                              isSelected
                                ? "border-primary/45 bg-primary/6 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
                                : "border-border/80",
                              disabled &&
                                "pointer-events-none cursor-not-allowed opacity-45",
                            )}
                          >
                            <input
                              className="sr-only"
                              type={question.multiSelect ? "checkbox" : "radio"}
                              name={`${formId}-question-${questionIndex}`}
                              value={option.label}
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
                                          (label) => label !== option.label,
                                        )
                                      : [...previous.selected, option.label]
                                    : [option.label];
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
                              className={cn(
                                "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                                question.multiSelect
                                  ? "rounded-[4px]"
                                  : "rounded-full",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background",
                              )}
                              aria-hidden
                            >
                              {isSelected ? (
                                question.multiSelect ? (
                                  <Check className="size-3" />
                                ) : (
                                  <span className="size-1.5 rounded-full bg-primary-foreground" />
                                )
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium leading-5 text-foreground">
                                {option.label}
                              </span>
                              {option.description ? (
                                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
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
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center">
                      <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground break-all">
                        {question.linkUrl}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="self-start sm:self-auto"
                        disabled={disabled}
                        onClick={() =>
                          void window.api?.shell?.openExternal?.({
                            url: question.linkUrl!,
                          })
                        }
                      >
                        <ExternalLink className="size-3.5" />
                        Open link
                      </Button>
                    </div>
                  ) : null}

                  {supportsCustom && question.options.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2.5 -ml-2 text-xs"
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
                      <PencilLine className="size-3.5" />
                      {question.multiSelect
                        ? "Add another answer"
                        : "Write a different answer"}
                    </Button>
                  ) : null}

                  {supportsCustom && customOpen ? (
                    <div className="mt-2">
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
                          className="min-h-20 max-h-40 resize-y text-sm"
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

      <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 pt-4">
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
            className="basis-full text-xs leading-5 text-muted-foreground"
            role="status"
          >
            {disabledReason}
          </p>
        ) : null}
      </div>
    </form>
  );
}
