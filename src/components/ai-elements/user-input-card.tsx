import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";
import type { UserInputQuestion } from "@/types/chat";

interface UserInputCardProps {
  toolName: string;
  questions: UserInputQuestion[];
  state: "input-requested" | "input-responded" | "input-interrupted" | "input-denied";
  answers?: Record<string, string>;
  onSubmit?: (answers: Record<string, string>) => void;
  onDeny?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

function getQuestionKey(question: UserInputQuestion) {
  return question.key?.trim() || question.question;
}

function parseAnswerValue(args: { value?: string; multiSelect?: boolean; optionLabels: string[] }) {
  const raw = args.value?.trim() ?? "";
  if (!raw) {
    return { selected: [] as string[], custom: "" };
  }
  const parts = args.multiSelect ? raw.split(",").map((part) => part.trim()).filter(Boolean) : [raw];
  const selected = parts.filter((part) => args.optionLabels.includes(part));
  const custom = parts.filter((part) => !args.optionLabels.includes(part)).join(", ");
  return { selected, custom };
}

export function UserInputCard(args: UserInputCardProps) {
  const { toolName, questions, state, answers, onSubmit, onDeny, disabled, disabledReason } = args;
  const initialSelectionByQuestion = useMemo(() => Object.fromEntries(
    questions.map((question) => {
      const parsed = parseAnswerValue({
        value: answers?.[getQuestionKey(question)] ?? question.defaultValue,
        multiSelect: question.multiSelect,
        optionLabels: question.options.map((option) => option.label),
      });
      return [getQuestionKey(question), parsed];
    }),
  ), [answers, questions]);
  const [selectionByQuestion, setSelectionByQuestion] = useState(initialSelectionByQuestion);

  useEffect(() => {
    setSelectionByQuestion(initialSelectionByQuestion);
  }, [initialSelectionByQuestion]);

  const compiledAnswers = useMemo(() => Object.fromEntries(
    questions.flatMap((question) => {
      const questionKey = getQuestionKey(question);
      if (question.inputType === "url_notice") {
        return [];
      }
      const selection = selectionByQuestion[questionKey] ?? { selected: [], custom: "" };
      const values = [...selection.selected];
      if (selection.custom.trim()) {
        values.push(selection.custom.trim());
      }
      if (values.length === 0) {
        return [];
      }
      return [[questionKey, values.join(", ")]];
    }),
  ) as Record<string, string>, [questions, selectionByQuestion]);

  const isReady = questions.every((question) => {
    if (question.inputType === "url_notice") {
      return true;
    }
    if (question.required === false) {
      return true;
    }
    return Boolean(compiledAnswers[getQuestionKey(question)]?.trim());
  });

  return (
    <div className="rounded-md border bg-card p-3 text-[0.875em]">
      <p className="font-semibold text-foreground">Input requested: {toolName}</p>
      {state === "input-requested" ? (
        <>
          <div className="mt-3 space-y-4">
            {questions.map((question) => {
              const questionKey = getQuestionKey(question);
              const selection = selectionByQuestion[questionKey] ?? { selected: [], custom: "" };
              const inputType = question.inputType ?? "text";
              const supportsCustom = question.allowCustom !== false && inputType !== "boolean" && inputType !== "url_notice";
              return (
                <div key={questionKey} className="space-y-2">
                  <div>
                    <p className="text-[0.75em] font-medium uppercase tracking-wide text-muted-foreground">{question.header}</p>
                    <p className="mt-1 text-foreground">{question.question}</p>
                  </div>
                  {question.options.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {question.options.map((option) => {
                          const isSelected = selection.selected.includes(option.label);
                          return (
                            <Button
                              key={option.label}
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              disabled={disabled}
                              onClick={() => {
                                setSelectionByQuestion((current) => {
                                  const prev = current[questionKey] ?? { selected: [], custom: "" };
                                  const nextSelected = question.multiSelect
                                    ? (isSelected
                                      ? prev.selected.filter((label) => label !== option.label)
                                      : [...prev.selected, option.label])
                                    : [option.label];
                                  return {
                                    ...current,
                                    [questionKey]: {
                                      ...prev,
                                      selected: nextSelected,
                                    },
                                  };
                                });
                              }}
                              title={option.description}
                            >
                              {option.label}
                            </Button>
                          );
                        })}
                      </div>
                      <p className="text-[0.75em] text-muted-foreground">
                        {question.multiSelect
                          ? (supportsCustom ? "Choose one or more options. Add custom text if needed." : "Choose one or more options.")
                          : (supportsCustom ? "Choose one option or provide custom text." : "Choose one option.")}
                      </p>
                    </>
                  ) : null}
                  {inputType === "url_notice" && question.linkUrl ? (
                    <div className="space-y-2">
                      <div className="rounded-md border bg-muted/30 p-3 text-[0.8em] text-muted-foreground">
                        {question.linkUrl}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => void window.api?.shell?.openExternal?.({ url: question.linkUrl! })}
                      >
                        Open link
                      </Button>
                    </div>
                  ) : null}
                  {supportsCustom ? (
                    <Input
                      type={inputType === "number" || inputType === "integer" ? "number" : "text"}
                      value={selection.custom}
                      disabled={disabled}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectionByQuestion((current) => ({
                          ...current,
                          [questionKey]: {
                            ...(current[questionKey] ?? { selected: [], custom: "" }),
                            custom: value,
                          },
                        }));
                      }}
                      placeholder={question.placeholder || (question.options.length > 0 ? "Other" : "Answer")}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" disabled={disabled || !isReady} onClick={() => onSubmit?.(compiledAnswers)}>
              Submit answers
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onDeny}>
              Decline
            </Button>
          </div>
          {disabledReason ? (
            <p className="mt-2 text-[0.75em] text-muted-foreground">{disabledReason}</p>
          ) : null}
        </>
      ) : state === "input-denied" ? (
        <p className="mt-2 text-muted-foreground">Decision: user declined to answer.</p>
      ) : state === "input-interrupted" ? (
        <p className="mt-2 text-muted-foreground">Request expired because the turn was interrupted.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {questions.map((question) => (
            <div key={getQuestionKey(question)}>
              <p className="text-[0.75em] font-medium uppercase tracking-wide text-muted-foreground">{question.header}</p>
              <p className="mt-1 text-foreground">{question.question}</p>
              <p className="mt-1 text-muted-foreground">
                {answers?.[getQuestionKey(question)] ?? (question.inputType === "url_notice" ? "Accepted." : "No answer provided.")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
