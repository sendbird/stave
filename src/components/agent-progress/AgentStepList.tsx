import { memo, useMemo, useState } from "react";
import { Bot, Brain, ChevronRight, Info } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import type { AgentStepState } from "@/components/aui/components/agent-state";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { ToolRun } from "@/components/aui/components/ToolRun";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { sx } from "@/components/aui/utils/stylex";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { getToolIcon } from "@/components/session/message/tool-icon";
import { TraceOutput } from "@/components/session/message/turn-event-rows";
import {
  boundStepDetail,
  firstLine,
  foldAgentSteps,
  STEP_DETAIL_MAX_CHARS,
  type AgentStep,
  type AgentStepBlock,
} from "@/lib/agent-progress";
import { agentProgressStyles as s } from "./agent-progress.styles";

const RUN_STATE: Record<AgentStep["status"], AgentStepState> = {
  running: "running",
  done: "done",
  error: "failed",
};

/** File changes Codex reports as one call draw the edit glyph, like Claude's edits. */
const FILE_CHANGE_TOOLS: ReadonlySet<string> = new Set(["filechange", "file_change", "apply_patch"]);

function stepIcon(toolName: string | undefined) {
  const name = toolName ?? "";
  return getToolIcon(FILE_CHANGE_TOOLS.has(name.toLowerCase()) ? "Edit" : name);
}

/**
 * One detail section of an opened row, bounded. It renders only when its
 * row opens (`ToolRun` mounts its body lazily), so a long payload costs
 * nothing until someone asks for it.
 */
function StepDetailText(props: { label: string; text: string; alreadyCut?: boolean }) {
  useTranslation();
  const bounded = boundStepDetail(props.text);
  const cut = bounded.truncated || props.alreadyCut;
  return (
    <TraceOutput
      capped
      label={props.label}
      text={bounded.text}
      note={cut ? i18n.t("session:agentProgress.panel.truncated", { count: STEP_DETAIL_MAX_CHARS }) : undefined}
    />
  );
}

/** A tool call or a thought: a quiet row that opens to its input and output. */
const StepRow = memo(function StepRow(props: { step: AgentStep }) {
  useTranslation();
  const { step } = props;
  const status = RUN_STATE[step.status];
  const title = step.status === "running" ? step.doing : step.done;
  if (step.kind === "thinking") {
    return (
      <ToolRun
        data-step-id={step.id}
        data-step-status={step.status}
        icon={<Brain size={controlIconSizes.md} />}
        status={status}
        title={title}
        durationMs={step.durationMs}
        output={step.text ? <StepDetailText label={title} text={step.text} /> : undefined}
      />
    );
  }
  const detail = step.detail;
  const output = detail?.output?.trim() ? detail.output : undefined;
  return (
    <ToolRun
      data-step-id={step.id}
      data-step-status={step.status}
      icon={stepIcon(step.toolName)}
      status={status}
      title={title}
      durationMs={step.durationMs}
      input={detail?.input?.trim()
        ? <StepDetailText label={i18n.t("session:agentProgress.panel.input")} text={detail.input} alreadyCut={detail.truncated} />
        : undefined}
      output={output && step.status !== "error"
        ? <StepDetailText label={i18n.t("session:agentProgress.panel.output")} text={output} alreadyCut={detail?.truncated} />
        : undefined}
      error={output && step.status === "error"
        ? <StepDetailText label={i18n.t("session:agentProgress.panel.output")} text={output} alreadyCut={detail?.truncated} />
        : undefined}
    />
  );
});

/** Consecutive calls and thoughts as one folded block; running and failed rows stay in view. */
function QuietBlock(props: { block: Extract<AgentStepBlock, { type: "quiet" }> }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const { steps, pinned } = props.block;
  if (steps.length === 1) return <StepRow step={steps[0]!} />;
  return (
    <div data-testid="agent-step-group" data-open={open || undefined}>
      <ToolRun.Group
        rollUp
        open={open}
        onOpenChange={setOpen}
        runs={steps.map((step) => ({ status: RUN_STATE[step.status], durationMs: step.durationMs }))}
        summary={i18n.t("session:agentProgress.panel.quietSummary", { count: steps.length })}
        aria-label={i18n.t("session:agentProgress.panel.steps")}
      >
        {/* The panel mounts its rows only once it opens. */}
        {steps.map((step) => <StepRow key={step.id} step={step} />)}
      </ToolRun.Group>
      {!open && pinned.length > 0 ? (
        <div data-testid="agent-step-pinned">
          {pinned.map((step) => <StepRow key={step.id} step={step} />)}
        </div>
      ) : null}
    </div>
  );
}

function NoteRow(props: { step: AgentStep }) {
  const { step } = props;
  return (
    <p className={sx(s.note)} data-step-id={step.id} data-step-status={step.status}>
      <span className={sx(s.noteMark)}>
        {step.status === "running"
          ? <StateMark state="working" size="sm" />
          : <Info aria-hidden size={controlIconSizes.sm} />}
      </span>
      <span className={sx(s.noteText)}>{step.text ?? step.done}</span>
    </p>
  );
}

function ChildRow(props: { step: AgentStep; onOpen?: (step: AgentStep) => void }) {
  useTranslation();
  const { step } = props;
  const title = step.child?.title ?? step.done;
  // What it was asked, under its name; the "started an agent" sentence would repeat it.
  const asked = step.text ? firstLine(step.text) : "";
  const state = step.status === "running" ? "working" : step.status === "error" ? "failed" : "ready";
  const body = (
    <>
      <Bot aria-hidden className={sx(s.childIcon)} />
      <span className={sx(s.childBody)}>
        <span className={sx(s.childTitle)}>{title}</span>
        {asked && asked !== title ? <span className={sx(s.childSentence)}>{asked}</span> : null}
      </span>
      <StateMark state={state} size="sm" />
      {props.onOpen ? <ChevronRight aria-hidden className={sx(s.childIcon)} /> : null}
    </>
  );
  if (!props.onOpen) {
    return <div className={sx(s.child)} data-step-id={step.id} data-step-status={step.status}>{body}</div>;
  }
  return (
    <Button
      variant="quiet"
      layout="host"
      xstyle={s.child}
      data-step-id={step.id}
      data-step-status={step.status}
      aria-label={i18n.t("session:agentProgress.panel.openSubagent", { title })}
      onClick={() => props.onOpen?.(step)}
    >
      {body}
    </Button>
  );
}

function StandaloneStep(props: { step: AgentStep; onOpenChild?: (step: AgentStep) => void }) {
  const { step } = props;
  switch (step.kind) {
    case "subagent":
      return <ChildRow step={step} onOpen={step.child ? props.onOpenChild : undefined} />;
    case "note":
      return <NoteRow step={step} />;
    case "user":
      return (
        <div className={sx(s.user)} data-step-id={step.id}>
          <CollapsibleResponse text={step.text ?? step.done} />
        </div>
      );
    case "text":
    case "message":
      return (
        <div className={sx(s.text)} data-step-id={step.id}>
          <CollapsibleResponse text={step.text ?? step.done} />
        </div>
      );
    case "tool":
    case "thinking":
      return <StepRow step={step} />;
  }
}

/**
 * The steps in start order: calls and thoughts folded into quiet blocks,
 * everything the agent said and every subagent it started on its own line.
 */
export function AgentStepList(props: { steps: readonly AgentStep[]; onOpenChild?: (step: AgentStep) => void }) {
  useTranslation();
  const blocks = useMemo(() => foldAgentSteps(props.steps), [props.steps]);
  return (
    <ol className={sx(s.steps)} aria-label={i18n.t("session:agentProgress.panel.steps")} data-testid="agent-step-list">
      {blocks.map((block) => (
        <li key={block.id} className={sx(s.stepItem)}>
          {block.type === "quiet"
            ? <QuietBlock block={block} />
            : <StandaloneStep step={block.step} onOpenChild={props.onOpenChild} />}
        </li>
      ))}
    </ol>
  );
}
