import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { InlineDisclosureIcon } from "@/components/ads/components/inline-disclosure-icon";
import { useSettleDisclosure } from "@/components/ads/components/Thinking.parts";
import {
  CollapsibleRoot,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ads/headless/collapsible";
import {
  agentStatusWord,
  agentSurface,
} from "@/components/ads/recipes/agent-surface";
import {
  controlHeights,
  controlIconSizes,
} from "@/components/ads/recipes/control-metrics";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { inlineDisclosure } from "@/components/ads/recipes/inline-disclosure";
import { transition } from "@/components/ads/recipes/transition";
import { cx, sx } from "@/components/ads/utils/stylex";

import { turnEventDecisionStyles as styles } from "./turn-event-decisions.styles";

/**
 * A runtime notice on the rail: a compaction boundary, a provider error, a
 * capacity failure, a stop reason.
 *
 * ## Why this is a recipe composition and not a component call
 *
 * ADS has no notice surface for this kind, and the two candidates are both the
 * wrong shape. `ToolRun` would name a runtime event a "tool call", which is
 * exactly the two-names-for-one-state bug the shared `AgentRunState` exists to
 * prevent. `Callout` is authored prose in a reading column — it draws a tint
 * and has no disclosure — and a transcript notice is neither authored nor
 * short: the payload is a stack trace or a recovery action.
 *
 * So the row is assembled from the primitives ADS publishes for exactly this
 * purpose: `agentSurface.row` for the row, the `inlineDisclosure` recipe for
 * the trigger/panel/body rungs, `InlineDisclosureIcon` for the one leading
 * slot that swaps the glyph for the chevron, and `useSettleDisclosure` for the
 * lifecycle. Every token, every rung and every curve therefore comes from ADS,
 * and nothing here re-derives a rule — which is the difference between
 * composing the system and forking it.
 *
 * ## The state matrix, for a kind with no run
 *
 * A notice has no clock and no request to the reader, so it stays closed.
 * The header still names a failure; the payload is behind the disclosure.
 */
export function TraceSystemNotice(args: {
  /** Ignored. Notices stay closed; the header still names a failure. */
  attention?: boolean;
  children?: ReactNode;
  /** The one semantic word, or nothing. A word saying "Notice" says nothing. */
  status?: "failed";
  title: ReactNode;
}) {
  const { children, status, title } = args;
  const hasPayload = children != null;

  const { open, setOpen } = useSettleDisclosure({
    live: false,
  });

  const summary = (
    <>
      <span className={sx(agentSurface.rowLabel, styles.noticeTitle)}>
        {title}
      </span>
      {status === "failed" ? (
        <span className={sx(styles.noticeStatus, agentStatusWord.danger)}>
          Failed
        </span>
      ) : null}
    </>
  );

  const glyph = <Info size={controlIconSizes.md} />;

  /* A notice with nothing behind it is a line, not a disclosure: a chevron
     that opens an empty panel is an affordance that does nothing. */
  if (!hasPayload) {
    return (
      <div className={sx(agentSurface.row, styles.notice)}>
        <InlineDisclosureIcon disclosure={false}>{glyph}</InlineDisclosureIcon>
        {summary}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      className={sx(inlineDisclosure.root)}
      onOpenChange={setOpen}
      open={open}
    >
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
          ),
          "atelier-inline-disclosure-trigger",
        )}
      >
        <InlineDisclosureIcon open={open}>{glyph}</InlineDisclosureIcon>
        {summary}
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}
        keepMounted
      >
        <div
          className={cx(
            sx(inlineDisclosure.body, styles.noticeBody),
            "atelier-motion-panel-inner",
          )}
        >
          {children}
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}
