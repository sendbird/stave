import { useCallback, useMemo, useState } from "react";

import { Approval } from "@/components/ads/components/Approval";
import type { ApprovalOutcome } from "@/components/ads/components/Approval";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Clarification } from "@/components/ads/components/Clarification";
import type { ClarificationOutcome } from "@/components/ads/components/Clarification";
import { Plan } from "@/components/ads/components/Plan";
import type {
  PlanStepItem,
  PlanStepStatus,
} from "@/components/ads/components/Plan.parts";
import { RadioGroup } from "@/components/ads/components/RadioGroup";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import { getTodoProgress, type TodoStatus } from "@/components/ai-elements/todo";
import { useAppStore } from "@/store/app.store";
import type {
  ApprovalPart,
  ToolUsePart,
  UserInputPart,
  UserInputQuestion,
} from "@/types/chat";

import { deriveTodoTraceItems, getToolTitle } from "./assistant-trace.utils";
import { turnEventDecisionStyles as styles } from "./turn-event-decisions.styles";

/* ─── Plan ───────────────────────────────────────────────────────── */

/**
 * Stave's three todo states are exactly three of ADS `PlanStepStatus`'s five.
 *
 * The two that are missing are missing on purpose. `failed` cannot occur: a
 * TodoWrite call rewrites the whole list and has no vocabulary for a step that
 * went wrong, so a mapping onto it would be inventing a state the provider
 * never reports. `approval` is a *run* fact that lives on the row of the tool
 * call that is gated, not on a plan entry — the gate is rendered by
 * `TraceApproval` below, on its own step.
 */
const PLAN_STATUS: Record<TodoStatus, PlanStepStatus> = {
  completed: "done",
  in_progress: "running",
  pending: "pending",
};

/**
 * The turn's todo list, rendered through ADS `Plan`.
 *
 * `Plan` is the durable half of the reasoning story — the steps the agent
 * committed to, still readable after the thought that produced them closed —
 * and it owns three behaviours the host used to hand-roll: the morphing status
 * mark (one SVG whose ring never unmounts, so a step settles instead of
 * flickering through four swapped icons), the `done / total` count in the
 * machine register, and the delta announcer, which speaks only the steps that
 * moved rather than re-reading the whole list on every tick.
 *
 * The plan is the *payload* of a `ToolRun`, not a step in its own right, which
 * is what keeps §4's disclosure matrix true for this kind: the row settles and
 * collapses like every other tool call, and the collapsed row still carries the
 * progress count, so nothing is hidden by the collapse.
 *
 * `title` is dropped to `null`-adjacent duty: the `ToolRun` row above already
 * says "Update plan", so the plan's own header would state it twice. It keeps
 * only the count, which is the one thing the header adds.
 */
export function TracePlan(args: {
  input: string;
  state?: ToolUsePart["state"];
}) {
  const todos = useMemo(
    () => deriveTodoTraceItems({ input: args.input, state: args.state }),
    [args.input, args.state],
  );

  const steps = useMemo<PlanStepItem[]>(
    () =>
      todos.map((todo, index) => ({
        id: `${index}-${todo.content}`,
        status: PLAN_STATUS[todo.status],
        title: todo.content,
      })),
    [todos],
  );

  return <Plan steps={steps} title="Steps" />;
}

/** `done / total` for the collapsed `ToolRun` row, or `undefined`. */
export function planProgressCount(input: string): string | undefined {
  const progress = getTodoProgress({ input });
  if (progress.totalCount === 0) return undefined;
  return `${progress.completedCount} / ${progress.totalCount}`;
}

/* ─── Approval ───────────────────────────────────────────────────── */

/**
 * A recorded approval, or `null` while the gate is still open.
 *
 * The scope mapping is the interesting half. Stave persists *whether* a request
 * was answered (`approval-responded`) and not which grant was used, so the
 * record is ADS's `allowed` rather than `allow-once`: §5 forbids inventing the
 * precision, and both of the scoped values state a fact nobody wrote down —
 * one claims the grant was single-use, the other claims a standing grant that
 * may not exist. `approval-interrupted` is `lapsed`, which is neither a denial
 * nor a pending gate: the turn that asked ended, and the buttons would be an
 * affordance that can no longer do anything.
 */
function toApprovalOutcome(
  state: ApprovalPart["state"],
): ApprovalOutcome | null {
  switch (state) {
    case "approval-requested":
      return null;
    case "approval-responded":
      return { decision: "allowed" };
    case "output-denied":
      return { decision: "deny" };
    case "approval-interrupted":
      return { decision: "lapsed" };
  }
}

/**
 * A permission gate, rendered through ADS `Approval`.
 *
 * ADS is presentation only here: the three buttons call straight into the
 * store action Stave already used, with the same `scope` the previous surface
 * passed, so the IPC round trip is untouched. What moves into ADS is the part
 * that kept drifting — the status word and its tone, the focus hand-off when
 * the pressed button unmounts, and the rule that the decision is *preserved*
 * in the transcript rather than replaced by it.
 *
 * There is no disclosure. §4's "approval gate stays open" is absolute for this
 * kind: the payload is a question, and the resolved form is the audit record,
 * so neither state has anything worth collapsing to.
 */
export function TraceApproval(args: {
  messageId: string;
  part: ApprovalPart;
  taskId: string;
}) {
  const { messageId, part, taskId } = args;
  const resolveApproval = useAppStore((state) => state.resolveApproval);
  const outcome = toApprovalOutcome(part.state);

  const decide = useCallback(
    (decision: "allow-once" | "allow-always" | "deny") => {
      resolveApproval({
        approved: decision !== "deny",
        messageId,
        requestId: part.requestId,
        scope: decision === "allow-always" ? "always" : "once",
        taskId,
      });
    },
    [messageId, part.requestId, resolveApproval, taskId],
  );

  return (
    <Approval
      allowAlways={part.supportsAllowAlways === true}
      arguments={
        part.input
          ? [{ id: "input", label: "Arguments", value: part.input }]
          : undefined
      }
      data-pending-interaction={
        part.state === "approval-requested" ? "true" : undefined
      }
      data-pending-interaction-request-id={
        part.state === "approval-requested" ? part.requestId : undefined
      }
      description={part.description}
      onDecide={decide}
      outcome={outcome}
      tabIndex={part.state === "approval-requested" ? -1 : undefined}
      title={getToolTitle(part.toolName)}
    />
  );
}

/* ─── Clarification ──────────────────────────────────────────────── */

/** The answer key a question is filed under, matching `resolveUserInput`. */
function questionKey(question: UserInputQuestion, index: number): string {
  return question.key ?? question.header ?? `question-${index}`;
}

function toClarificationOutcome(
  part: UserInputPart,
): ClarificationOutcome | null {
  switch (part.state) {
    case "input-requested":
      return null;
    case "input-responded": {
      const answers = part.answers ?? {};
      const recorded = part.questions
        .map((question, index) => {
          const value = answers[questionKey(question, index)];
          return value == null || value.length === 0
            ? null
            : `${question.header}: ${value}`;
        })
        .filter((line): line is string => line !== null);
      return {
        content: recorded.length > 0 ? recorded.join("\n") : undefined,
        result: "answered",
      };
    }
    case "input-denied":
      return { result: "skipped" };
    case "input-interrupted":
      return { result: "lapsed" };
  }
}

/**
 * One question's control, chosen by what the provider actually asked for.
 *
 * ADS `Clarification` owns the frame and nothing inside it, which is the right
 * seam: the frame is the same for every question, and the control is not. A
 * single-select question is a `RadioGroup` because the options are mutually
 * exclusive and all visible; a multi-select is a column of `Checkbox`es for the
 * same reason in the plural; everything else is a `TextField`, including the
 * numeric types — the provider's `number`/`integer` distinction is a validation
 * rule it enforces itself, and a spinner control would imply a range nobody
 * stated.
 */
function ClarificationField(args: {
  disabled: boolean;
  onChange: (value: string) => void;
  question: UserInputQuestion;
  value: string;
}) {
  const { disabled, onChange, question, value } = args;

  if (question.options.length > 0) {
    if (question.multiSelect === true) {
      const selected = new Set(value.length > 0 ? value.split("\n") : []);
      return (
        <fieldset className={sx(styles.fieldset)}>
          <legend className={sx(styles.legend)}>{question.question}</legend>
          {question.options.map((option) => {
            const optionValue = option.value ?? option.label;
            return (
              <Checkbox
                checked={selected.has(optionValue)}
                description={option.description || undefined}
                disabled={disabled}
                key={optionValue}
                label={option.label}
                onCheckedChange={(next) => {
                  const updated = new Set(selected);
                  if (next) updated.add(optionValue);
                  else updated.delete(optionValue);
                  onChange(
                    question.options
                      .map((row) => row.value ?? row.label)
                      .filter((row) => updated.has(row))
                      .join("\n"),
                  );
                }}
              />
            );
          })}
        </fieldset>
      );
    }

    return (
      <RadioGroup
        disabled={disabled}
        label={question.question}
        onValueChange={(next) => onChange(String(next ?? ""))}
        options={question.options.map((option) => ({
          description: option.description || undefined,
          label: option.label,
          value: option.value ?? option.label,
        }))}
        value={value.length > 0 ? value : null}
      />
    );
  }

  return (
    <TextField
      disabled={disabled}
      label={question.question}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

/**
 * A clarification request, rendered through ADS `Clarification`.
 *
 * Deliberately one surface for the whole request rather than a wizard: Stave
 * submits every answer in one `resolveUserInput` call, so `currentStep` /
 * `totalSteps` would number pages that do not exist. `totalSteps` is instead
 * spent on the honest count — how many questions this request holds — only
 * when there is more than one, because `1 / 1` is a step readout for something
 * that has no steps.
 *
 * `Continue` stays disabled until every `required` question has a value, which
 * is the one piece of truth the host owns and ADS cannot: ADS knows the frame
 * is submittable, the provider knows what it asked to be filled in.
 */
export function TraceClarification(args: {
  messageId: string;
  part: UserInputPart;
  taskId: string;
}) {
  const { messageId, part, taskId } = args;
  const resolveUserInput = useAppStore((state) => state.resolveUserInput);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const outcome = toClarificationOutcome(part);
  const open = part.state === "input-requested";

  const missingRequired = part.questions.some((question, index) => {
    if (question.required !== true) return false;
    const value = answers[questionKey(question, index)];
    return value == null || value.length === 0;
  });

  return (
    <Clarification
      busy={busy}
      continueLabel="Submit"
      data-pending-interaction={open ? "true" : undefined}
      data-pending-interaction-request-id={open ? part.requestId : undefined}
      description={part.questions[0]?.question}
      onContinue={
        missingRequired
          ? undefined
          : () => {
              setBusy(true);
              resolveUserInput({
                answers,
                messageId,
                requestId: part.requestId,
                taskId,
              });
            }
      }
      onSkip={() => {
        setBusy(true);
        resolveUserInput({
          denied: true,
          messageId,
          requestId: part.requestId,
          taskId,
        });
      }}
      outcome={outcome}
      skipLabel="Decline"
      tabIndex={open ? -1 : undefined}
      title={getToolTitle(part.toolName)}
      totalSteps={part.questions.length > 1 ? part.questions.length : undefined}
    >
      {part.questions.map((question, index) => {
        const key = questionKey(question, index);
        return (
          <ClarificationField
            disabled={busy}
            key={key}
            onChange={(value) =>
              setAnswers((previous) => ({ ...previous, [key]: value }))
            }
            question={question}
            value={answers[key] ?? ""}
          />
        );
      })}
    </Clarification>
  );
}
