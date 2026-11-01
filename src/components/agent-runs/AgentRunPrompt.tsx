import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Target } from "lucide-react";
import {
  resolveAgentRunPrompt,
  resolveAgentRunPromptStage,
  type AgentRunPromptStage,
  type AgentRunPromptView,
} from "@/lib/agent-runs/agent-run-status";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app.store";
import { useAgentRunById, useAgentRunDetailForTurn } from "@/store/agent-runs-store";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentRun } from "@/lib/agent-runs/domain";
import type { AgentRunPromptProvenance } from "@/types/chat";
import { InlineDisclosureIcon } from "@/components/ads/components/inline-disclosure-icon";
import { Loader } from "@/components/ads/components/Loader";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/ads/headless/collapsible";
import { controlHeights, controlIconSizes } from "@/components/ads/recipes/control-metrics";
import { agentSurface } from "@/components/ads/recipes/agent-surface";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { inlineDisclosure } from "@/components/ads/recipes/inline-disclosure";
import { transition } from "@/components/ads/recipes/transition";
import { cx, sx } from "@/components/ads/utils/stylex";
import { MessageAction, MessageResponse } from "@/components/ai-elements/message";
import { MESSAGE_BODY_LINE_HEIGHT } from "@/components/ai-elements/message-styles";
import { MessageTextScaleContext, scaleMessageFontSize } from "@/components/ai-elements/message-text-scale";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** A user message an agent run started: the user's own words and Stave's instructions. */
export type AgentRunPrompt = AgentRunPromptView;

/** Whether a row's mark identifies both its stage and continuation, without reading events. */
export function agentRunPromptProvenanceNamesStage(provenance: AgentRunPromptProvenance | undefined | null): boolean {
  return Boolean(
    provenance && typeof provenance.isContinuation === "boolean" &&
    (provenance.stageId || typeof provenance.stageIndex === "number"),
  );
}

/**
 * Which store reads a row needs: the detail (events) of the run that started
 * its turn, and the run its mark names. A row needs the events unless its
 * mark already names the stage: an unmarked row for its assignment and
 * stage, a mark written before stages were recorded ({ agentRunId,
 * assignment } only) for its stage. A pending row needs neither. Pure, so
 * the choice is checked without React.
 */
export function agentRunPromptRowSources(args: {
  turnId: string | undefined;
  provenance?: AgentRunPromptProvenance;
  pending?: boolean;
}): { detailTurnId: string | undefined; markedRunId: string | undefined } {
  if (args.pending) return { detailTurnId: undefined, markedRunId: undefined };
  return {
    detailTurnId: agentRunPromptProvenanceNamesStage(args.provenance) ? undefined : args.turnId,
    markedRunId: args.provenance?.agentRunId,
  };
}

/**
 * The row's prompt view from what the stores hold: the run its mark names
 * (once loaded) and the detail of the run that started its turn. Pure; the
 * hook feeds it from its subscriptions.
 */
export function resolveAgentRunPromptRow(args: {
  text: string;
  turnId: string | undefined;
  provenance?: AgentRunPromptProvenance;
  pending?: boolean;
  markedRun: AgentRun | null;
  detail: AgentRunDetail | null;
}): AgentRunPrompt | null {
  const run = args.markedRun ?? args.detail?.agentRun ?? null;
  return resolveAgentRunPrompt({
    text: args.text,
    provenance: args.provenance,
    runAssignment: args.detail?.agentRun.assignment,
    pending: args.pending,
    stage: args.pending
      ? null
      : resolveAgentRunPromptStage({ run, provenance: args.provenance, turnId: args.turnId, events: args.detail?.events }),
  });
}

/**
 * Splits the user message that started a turn of an agent run, so the bubble
 * shows the assignment and the compiled prompt stays one click away. A row the
 * host marked splits on its own; an older one waits for the run that started
 * its turn. A stage after the first names its stage (from the mark, else from
 * the run's `turn-linked` event) so the host draws Stave's stage card instead
 * of repeating the assignment as the user's words. Null for every other
 * message.
 */
export function useAgentRunPrompt(args: {
  taskId: string;
  /** The turn the message started; undefined for any message that started none. */
  turnId: string | undefined;
  text: string;
  provenance?: AgentRunPromptProvenance;
  /** The send is still waiting on its run: the row the run will write, drawn early. */
  pending?: boolean;
}): AgentRunPrompt | null {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const sources = agentRunPromptRowSources(args);
  const detail = useAgentRunDetailForTurn(workspaceId, args.taskId, sources.detailTurnId);
  const markedRun = useAgentRunById(sources.markedRunId);
  return useMemo(
    () =>
      resolveAgentRunPromptRow({
        text: args.text,
        turnId: args.turnId,
        provenance: args.provenance,
        pending: args.pending,
        markedRun,
        detail,
      }),
    [args.pending, args.provenance, args.text, args.turnId, detail, markedRun],
  );
}

/**
 * How a host draws a message: whether the user's bubble shows, which prompt
 * row follows it, and whether Stave's stage card stands in for the bubble.
 * The bubble holds only what the person wrote, so a run prompt with no words
 * of theirs draws no bubble, only its row; a stage after the first draws the
 * stage card (what this stage asks) over the prompt row, since the person
 * wrote nothing at that point of the run. One answer for every host (the
 * conversation and the run's turn dialog).
 */
export function agentRunPromptLayout(prompt: AgentRunPrompt | null): {
  bubble: boolean;
  row: "assignment" | "followUp" | null;
  stage: AgentRunPromptStage | null;
} {
  if (!prompt) return { bubble: true, row: null, stage: null };
  if (prompt.stage) return { bubble: false, row: "assignment", stage: prompt.stage };
  return prompt.assignment ? { bubble: true, row: "assignment", stage: null } : { bubble: false, row: "followUp", stage: null };
}

/**
 * Stave's stage card: the turn a run started for a stage after the first.
 * Where the first turn shows the user's words, this one shows what the stage
 * asks (its position, title and done-when), with the stage instruction one
 * click away; the full prompt row follows it as for any run turn. It takes the
 * transcript's inline-disclosure grammar and sits on the agent's side, so it
 * never reads as something the person typed.
 */
export function AgentRunStageCard({ stage }: { stage: AgentRunPromptStage }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const title = i18n.t("agentRuns:agentRunPrompt.stageTitle", { index: stage.index + 1, total: stage.total, title: stage.title });
  return (
    <CollapsibleRoot className={sx(inlineDisclosure.root, styles.promptStageCard)} open={open} onOpenChange={setOpen} data-testid="agent-run-stage-card">
      <CollapsibleTrigger
        className={cx(
          sx(
            inlineDisclosure.trigger,
            inlineDisclosure.triggerIntrinsic,
            open && inlineDisclosure.triggerOpen,
            transition.colors,
            focusRing.ring,
            focusRing.ringInset,
            styles.promptStageTrigger,
          ),
          "atelier-inline-disclosure-trigger",
        )}
      >
        <InlineDisclosureIcon open={open}>
          <Target size={controlIconSizes.md} />
        </InlineDisclosureIcon>
        <span className={sx(styles.promptStageText)}>
          <span className={sx(styles.promptStageTitle)}>{title}</span>
          <span className={sx(styles.promptStageDoneWhen)}>{i18n.t("agentRuns:agentRunPrompt.stageDoneWhen", { value: stage.doneWhen })}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
        <div className={cx(sx(inlineDisclosure.body, styles.promptBody), "atelier-motion-panel-inner")}>
          <AgentRunPromptBody text={stage.instruction} />
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

/**
 * Keeps an agent run's user bubble at its own width when a prompt row follows
 * it, so opening the row (as wide as the column) does not stretch the bubble.
 * Any other message passes through untouched.
 */
export function AgentRunBubbleFrame({ framed, children }: { framed: boolean; children: ReactNode }) {
  return framed ? <div className={sx(styles.promptBubble)}>{children}</div> : <>{children}</>;
}

/**
 * The compiled prompt of an agent run's turn, as a row under the user's
 * bubble rather than inside it. The bubble is the one surface that holds only
 * what the person wrote (`agentSurface.bubble`); Stave's prompt is not theirs,
 * so it takes the transcript's inline-disclosure grammar instead, the same row
 * a runtime notice or a tool call uses: an object glyph that turns into the
 * chevron on hover or focus, a muted label, and a quiet wash once open.
 *
 * - `assignment`: the user's words are in the bubble above; the row folds the
 *   full prompt Stave built around them.
 * - `followUp`: a run prompt with no words of the user's (the reminder to
 *   report). The host draws no bubble at all, only this row.
 *
 * Until the run writes the prompt the row says so instead of offering a
 * disclosure that opens nothing.
 */
export function AgentRunPromptRow({
  text,
  kind,
  align = "end",
}: {
  text: string | null;
  kind: "assignment" | "followUp";
  /** `end` under the user's bubble; `start` under Stave's stage card, on the agent's side. */
  align?: "start" | "end";
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  if (text === null) {
    return (
      // The static arm of the same row: one glyph column, one label style.
      <div role="status" className={sx(agentSurface.row, styles.promptPending, align === "start" && styles.promptAlignStart)}>
        <InlineDisclosureIcon disclosure={false}>
          <Loader size="xs" tone="neutral" aria-hidden />
        </InlineDisclosureIcon>
        <span className={sx(styles.promptLabel)}>{i18n.t("agentRuns:agentRunPrompt.pending")}</span>
      </div>
    );
  }
  const label = i18n.t(kind === "followUp" ? "agentRuns:agentRunPrompt.followUp" : "agentRuns:agentRunPrompt.label");
  return (
    <CollapsibleRoot className={sx(inlineDisclosure.root, styles.promptRow)} open={open} onOpenChange={setOpen}>
      <div className={sx(styles.promptHeader, align === "start" && styles.promptAlignStart)}>
        {/* The verbatim text, for pasting elsewhere; only once the reader asked for it. */}
        {open ? <CopyPromptAction text={text} /> : null}
        <CollapsibleTrigger
          className={cx(
            sx(
              inlineDisclosure.trigger,
              inlineDisclosure.triggerIntrinsic,
              open && inlineDisclosure.triggerOpen,
              controlHeights.sm,
              transition.colors,
              focusRing.ring,
              focusRing.ringInset,
              styles.promptTrigger,
            ),
            "atelier-inline-disclosure-trigger",
          )}
        >
          <InlineDisclosureIcon open={open}>
            <FileText size={controlIconSizes.md} />
          </InlineDisclosureIcon>
          <span className={sx(styles.promptLabel)}>{label}</span>
        </CollapsibleTrigger>
      </div>
      <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
        <div className={cx(sx(inlineDisclosure.body, styles.promptBody), "atelier-motion-panel-inner")}>
          <AgentRunPromptBody text={text} />
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

/**
 * The prompt itself: Markdown, read with the conversation's own renderer at
 * the panel scale, as `CollapsibleResponse` quotes a subagent's assignment.
 * Shown whole once asked for, like that component's "Show all": a capped box
 * would nest a second scroller in the transcript, and its settled fade dims
 * the prompt's first heading before the reader has scrolled at all.
 */
function AgentRunPromptBody({ text }: { text: string }) {
  const fontSize = scaleMessageFontSize(
    "panel",
    useAppStore((state) => state.settings.messageFontSize),
  );
  return (
    <MessageTextScaleContext.Provider value="panel">
      <div className={sx(styles.promptMarkdown)} style={{ fontSize: `${fontSize}px`, lineHeight: MESSAGE_BODY_LINE_HEIGHT }}>
        <MessageResponse>{text}</MessageResponse>
      </div>
    </MessageTextScaleContext.Provider>
  );
}

function CopyPromptAction({ text }: { text: string }) {
  useTranslation();
  const [copied, setCopied] = useState(false);
  const label = i18n.t("agentRuns:agentRunPrompt.copy");
  return (
    <MessageAction
      label={label}
      tooltip={label}
      onClick={() => {
        void copyTextToClipboard(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check size={controlIconSizes.sm} /> : <Copy size={controlIconSizes.sm} />}
    </MessageAction>
  );
}
