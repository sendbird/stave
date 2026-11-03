import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useMemo, type ReactElement, type ReactNode } from "react";

import { CappedViewport } from "@/components/ads/components/CappedViewport";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { diffPromptWords, type PromptWordDiff } from "@/components/ai-elements/prompt-input.utils";
import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@/components/ui";

/** Enough lines to compare a prompt; a longer one scrolls. */
const DIFF_MAX_BLOCK_SIZE = 240;

/**
 * The word diff between the draft and the Enhance rewrite: what was removed
 * and what was added, with Keep and Revert. Removed words are struck through
 * and added words underlined, inside `<del>` and `<ins>` with a spoken
 * marker, so neither the change nor its direction rests on colour.
 */
export function PromptEnhancementDiffBody(props: {
  sourceText: string;
  enhancedPrompt: string;
}) {
  useTranslation();
  const diff = usePromptWordDiff(props.sourceText, props.enhancedPrompt);
  return (
    <>
      <p className={sx(styles.summary)} data-enhancement-diff-summary="">
        {diffSummary(diff)}
      </p>
      <PromptEnhancementDiffText diff={diff} />
    </>
  );
}

function usePromptWordDiff(sourceText: string, enhancedPrompt: string) {
  return useMemo(() => diffPromptWords(sourceText, enhancedPrompt), [enhancedPrompt, sourceText]);
}

/** The counts and how to read the marks; the popover's accessible description. */
function diffSummary(diff: PromptWordDiff): ReactNode {
  return (
    <>
      {i18n.t("session:promptEnhancementDiff.summary", {
        removed: diff.removedWords,
        added: diff.addedWords,
      })}
      <br />
      {i18n.t("session:promptEnhancementDiff.legend")}
    </>
  );
}

function PromptEnhancementDiffText(props: { diff: PromptWordDiff }) {
  useTranslation();
  const { diff } = props;
  return (
      <CappedViewport
        aria-label={i18n.t("session:promptEnhancementDiff.diffLabel")}
        maxBlockSize={DIFF_MAX_BLOCK_SIZE}
        role="region"
        tabIndex={0}
        xstyle={[styles.viewport, focusRing.ring]}
      >
        <p className={sx(styles.text)} data-enhancement-diff="">
          {diff.segments.map((segment, index) =>
            segment.kind === "removed" ? (
              <del className={sx(styles.removed)} key={index}>
                <VisuallyHidden>{i18n.t("session:promptEnhancementDiff.removedMarker")} </VisuallyHidden>
                {segment.text}
              </del>
            ) : segment.kind === "added" ? (
              <ins className={sx(styles.added)} key={index}>
                <VisuallyHidden>{i18n.t("session:promptEnhancementDiff.addedMarker")} </VisuallyHidden>
                {segment.text}
              </ins>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      </CappedViewport>
  );
}

/** One Enhance rewrite: the draft it replaced and what replaced it. */
export interface PromptEnhancementResult {
  targetTaskId: string;
  sourceText: string;
  enhancedPrompt: string;
}

/**
 * Makes `render` (the composer's measure box) the anchor of the diff popover
 * and shows the popover while `change` is set. The anchor is the existing
 * element, so the composer's layout does not change.
 */
export function PromptEnhancementDiffAnchor(props: {
  change: Pick<PromptEnhancementResult, "sourceText" | "enhancedPrompt"> | null;
  onClose: () => void;
  onKeep: () => void;
  onRevert: () => void;
  render: ReactElement;
  children: ReactNode;
}) {
  return (
    <Popover
      open={props.change !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverAnchor render={props.render}>{props.children}</PopoverAnchor>
      {props.change ? (
        <PromptEnhancementDiffPopover
          enhancedPrompt={props.change.enhancedPrompt}
          sourceText={props.change.sourceText}
          onKeep={props.onKeep}
          onRevert={props.onRevert}
        />
      ) : null}
    </Popover>
  );
}

/** The popover over the composer that "View changes" opens. */
export function PromptEnhancementDiffPopover(props: {
  sourceText: string;
  enhancedPrompt: string;
  onKeep: () => void;
  onRevert: () => void;
}) {
  useTranslation();
  const diff = usePromptWordDiff(props.sourceText, props.enhancedPrompt);
  return (
    <PopoverContent align="start" side="top" sideOffset={8} xstyle={styles.popover}>
      <PopoverTitle className={sx(styles.title)}>
        {i18n.t("session:promptEnhancementDiff.title")}
      </PopoverTitle>
      {/* Only the counts describe the popover; the diff is read on demand. */}
      <PopoverDescription className={sx(styles.summary)} data-enhancement-diff-summary="">
        {diffSummary(diff)}
      </PopoverDescription>
      <PromptEnhancementDiffText diff={diff} />
      <div className={sx(styles.actions)}>
        <Button type="button" size="sm" variant="outline" onClick={props.onRevert}>
          {i18n.t("session:promptEnhancementDiff.revert")}
        </Button>
        <Button type="button" size="sm" onClick={props.onKeep}>
          {i18n.t("session:promptEnhancementDiff.keep")}
        </Button>
      </div>
    </PopoverContent>
  );
}

const styles = stylex.create({
  popover: {
    width: "32rem",
    maxWidth: "var(--available-width)",
    gap: vars["--ads-space-8"],
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
  },
  summary: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  viewport: {
    borderRadius: vars["--ads-radius-control"],
  },
  text: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    color: vars["--ads-color-text"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  /* A removed run stands apart from the words around it: the new text's own
     spaces belong to the kept and added runs. */
  removed: {
    marginInline: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-2"],
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-diff-removed"],
    color: vars["--ads-color-diff-removed-text"],
    textDecorationLine: "line-through",
  },
  added: {
    paddingInline: vars["--ads-space-2"],
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-diff-added"],
    color: vars["--ads-color-diff-added-text"],
    textDecorationLine: "underline",
    textUnderlineOffset: "0.2em",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--ads-space-8"],
  },
});
