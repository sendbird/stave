import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, FileText } from "lucide-react";
import { resolveAgentRunPrompt, type AgentRunPromptView } from "@/lib/agent-runs/agent-run-status";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app.store";
import { useAgentRunForTurn } from "@/store/agent-runs-store";
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

/**
 * Splits the user message that started a turn of an agent run, so the bubble
 * shows the assignment and the compiled prompt stays one click away. A row the
 * host marked splits on its own; an older one waits for the run that started
 * its turn. Null for every other message.
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
  const marked = Boolean(args.provenance || args.pending);
  const run = useAgentRunForTurn(workspaceId, args.taskId, marked ? undefined : args.turnId);
  const runAssignment = run?.assignment;
  return useMemo(
    () =>
      resolveAgentRunPrompt({
        text: args.text,
        provenance: args.provenance,
        runAssignment,
        pending: args.pending,
      }),
    [args.pending, args.provenance, args.text, runAssignment],
  );
}

/**
 * How a host draws a message: whether the user's bubble shows, and which
 * prompt row follows it. The bubble holds only what the person wrote, so a run
 * prompt with no words of theirs draws no bubble, only its row. One answer for
 * every host (the conversation and the run's turn dialog).
 */
export function agentRunPromptLayout(prompt: AgentRunPrompt | null): {
  bubble: boolean;
  row: "assignment" | "followUp" | null;
} {
  if (!prompt) return { bubble: true, row: null };
  return prompt.assignment ? { bubble: true, row: "assignment" } : { bubble: false, row: "followUp" };
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
export function AgentRunPromptRow({ text, kind }: { text: string | null; kind: "assignment" | "followUp" }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  if (text === null) {
    return (
      // The static arm of the same row: one glyph column, one label style.
      <div role="status" className={sx(agentSurface.row, styles.promptPending)}>
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
      <div className={sx(styles.promptHeader)}>
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
