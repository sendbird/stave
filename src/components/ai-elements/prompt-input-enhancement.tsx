import { i18n, useTranslation } from "@/i18n";
import { WandSparkles } from "lucide-react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Loader,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { PROMPT_TOOLBAR_ICON_BUTTON } from "./prompt-input-toolbar-parts";
import {
  getPromptEnhancementRevealSegments,
  getPromptEnhancementRevealTimings,
} from "./prompt-input.utils";
import type { PromptEnhancementRevealSegment } from "./prompt-input.utils";
import type { PromptLexicalEditorHandle } from "./prompt-lexical-editor";

/*
 * Typography the enhancement reveal has to mirror exactly. The overlay is a
 * plain `div` drawn on top of the Lexical editable, so any difference in font,
 * size, leading or tracking would make it wrap on different words than the
 * editor it is standing in for.
 */
export const PROMPT_EDITOR_TYPOGRAPHY_MINIMAL = promptInputStyles.editorTypographyMinimal;
export const PROMPT_EDITOR_TYPOGRAPHY_DEFAULT = promptInputStyles.editorTypographyDefault;
// Icon-only reservation. The busy chip overlays the draft instead of growing
// this inset — expanding to a label-width pad reflowed the first line twice
// (enter busy, leave busy) on top of the reveal animation.
export const PROMPT_ENHANCEMENT_EDITOR_INSET = promptInputStyles.enhancementEditorInset;

/**
 * Drives the enhancement reveal.
 *
 * Enhancement is a single request/response - nothing streams - so there is no
 * honest progress to replay. What the reveal shows instead is the *diff*: the
 * words the rewrite left alone are already on screen, and only the new ones
 * fade in with an accent afterglow. That is the question the user actually
 * has after pressing Enhance ("what did it change?"), and it finishes in about
 * a second instead of holding the composer hostage for a typewriter.
 *
 * Returns `null` whenever nothing should be overlaid, which is also the
 * reduced-motion path: the enhanced draft is simply there, immediately.
 */
export function usePromptEnhancementReveal(args: {
  active: boolean;
  revealVersion: number;
  sourceText: string;
  value: string;
  onComplete?: () => void;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reveal, setReveal] = useState<{
    segments: readonly PromptEnhancementRevealSegment[];
    stepMs: number;
  } | null>(null);
  const onCompleteRef = useRef(args.onComplete);
  onCompleteRef.current = args.onComplete;
  const targetValueRef = useRef(args.value);
  targetValueRef.current = args.value;
  const sourceTextRef = useRef(args.sourceText);
  sourceTextRef.current = args.sourceText;
  const { active, revealVersion } = args;

  useEffect(() => {
    if (!active) {
      setReveal(null);
      return;
    }

    const targetValue = targetValueRef.current;
    if (prefersReducedMotion || !targetValue) {
      setReveal(null);
      onCompleteRef.current?.();
      return;
    }

    const segments = getPromptEnhancementRevealSegments({
      previous: sourceTextRef.current,
      next: targetValue,
    });
    const changedSegmentCount = segments.reduce(
      (count, segment) => (segment.changed ? count + 1 : count),
      0,
    );
    const { stepMs, durationMs } =
      getPromptEnhancementRevealTimings(changedSegmentCount);
    setReveal({ segments, stepMs });

    const timeoutId = window.setTimeout(() => {
      setReveal(null);
      onCompleteRef.current?.();
    }, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [active, revealVersion, prefersReducedMotion]);

  return reveal;
}

/**
 * Puts the top of the enhanced prompt in view for the reveal.
 *
 * The overlay cannot scroll with the editor (it is not the editor), and the
 * changed words are worth reading from the start anyway, so both are pinned to
 * the top for the duration. Lexical does not do this itself: it scrolls the
 * caret into view only while the editable is editable, and it is not during an
 * enhancement.
 */
export function usePromptEnhancementScrollReset(args: {
  editorRef: RefObject<PromptLexicalEditorHandle | null>;
  revealing: boolean;
}) {
  const { editorRef, revealing } = args;

  useEffect(() => {
    if (!revealing) {
      return;
    }
    // The enhanced text is written by a child effect and reconciled by Lexical
    // asynchronously, so the scroll box only exists next frame.
    const frameId = window.requestAnimationFrame(() => {
      const element = editorRef.current?.getRootElement();
      if (element) {
        element.scrollTop = 0;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editorRef, revealing]);
}

/**
 * The reveal itself: a non-interactive mirror of the enhanced prompt, drawn
 * over the (hidden, locked) editor so the changed words can be individual
 * animated spans. Lexical owns its own DOM and renders prompt tokens as chips,
 * so per-word animation cannot live inside the editable.
 */
export function PromptEnhancementRevealOverlay(args: {
  segments: readonly PromptEnhancementRevealSegment[];
  stepMs: number;
  className?: string;
}) {
  useTranslation();
  return (
    <div
      aria-hidden="true"
      data-prompt-enhancement-reveal="true"
      className={cx(sx(promptInputStyles.revealOverlay), args.className)}
      style={{ "--prompt-diff-step": `${args.stepMs}ms` } as CSSProperties}
    >
      {args.segments.map((segment, index) =>
        segment.changed ? (
          <span
            key={index}
            className={sx(promptInputStyles.revealWord)}
            style={{ "--prompt-diff-i": segment.order } as CSSProperties}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}

/**
 * The Enhance prompt button over the editor's top-right corner. While an
 * enhancement runs or its reveal plays, it widens into a labelled busy chip
 * and announces the state to screen readers.
 */
export function PromptEnhancementControl(args: {
  promptEnhancementState: "enhancing" | "applying" | "idle";
  promptEnhancementBusy: boolean;
  promptEnhancementPending: boolean;
  promptEnhancementRevealing: boolean;
  promptEnhancementLabel: string;
  minimal: boolean;
  interactionsDisabled: boolean;
  onEnhancePrompt?: () => void | Promise<void>;
}) {
  useTranslation();
  const {
    promptEnhancementState,
    promptEnhancementBusy,
    promptEnhancementPending,
    promptEnhancementRevealing,
    promptEnhancementLabel,
    minimal,
    interactionsDisabled,
    onEnhancePrompt,
  } = args;
  return (
    <div
      data-prompt-enhancement-state={promptEnhancementState}
      className={cx(
        sx(promptInputStyles.enhanceOverlay),
        UI_LAYER_CLASS.floatingChrome,
        promptEnhancementBusy
          ? sx(
              minimal
                ? promptInputStyles.enhanceGradientMinimal
                : promptInputStyles.enhanceGradientDefault,
            )
          : undefined,
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={promptEnhancementBusy ? "sm" : "icon-sm"}
              disabled={
                interactionsDisabled || promptEnhancementBusy
              }
              aria-label={promptEnhancementLabel}
              aria-busy={promptEnhancementBusy}
              onClick={() => void onEnhancePrompt?.()}
              className={cx(
                PROMPT_TOOLBAR_ICON_BUTTON,
                sx(
                  promptInputStyles.enhanceButtonBase,
                  promptEnhancementBusy
                    ? minimal
                      ? promptInputStyles.enhanceBusyMinimal
                      : promptInputStyles.enhanceBusyDefault
                    : promptInputStyles.enhanceIdle,
                ),
              )}
            />
          }
        >
          {promptEnhancementPending ? (
            <Loader
              aria-hidden
              className={sx(promptInputStyles.loaderPrimary)}
              size="xs"
              variant="orbit"
            />
          ) : (
            <WandSparkles
              aria-hidden="true"
              className={sx(
                promptInputStyles.icon35Shrink,
                promptEnhancementRevealing &&
                  promptInputStyles.pulseAnimation,
              )}
            />
          )}
          {promptEnhancementBusy ? (
            <span aria-hidden="true">
              {promptEnhancementPending
                ? i18n.t("composer:promptInput.composerCard2")
                : i18n.t("composer:promptInput.composerCard3")}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="top" className={sx(promptInputStyles.maxW64)}>
          {promptEnhancementBusy
            ? promptEnhancementLabel
            : i18n.t("composer:promptInput.composerCard4")}
        </TooltipContent>
      </Tooltip>
      {promptEnhancementBusy ? (
        <span
          className={sx(promptInputStyles.srOnly)}
          role="status"
          aria-live="polite"
        >
          {promptEnhancementPending
            ? i18n.t("composer:promptInput.composerCard5")
            : i18n.t("composer:promptInput.composerCard6")}
        </span>
      ) : null}
    </div>
  );
}
