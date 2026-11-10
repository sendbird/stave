import { useId } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { MessageCircleQuestion } from "lucide-react";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { promptInputStyles } from "@/components/ai-elements/prompt-input.styles";
import {
  PROMPT_TOOLBAR_ICON_BUTTON,
  tooltipTriggerButtonClassName,
} from "@/components/ai-elements/prompt-input-toolbar-parts";
import { openTaskSideQuestion } from "@/components/panes/task-surface-entry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";

const styles = stylex.create({
  /** The tooltip names the control first, then says what it does. */
  tooltipBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
  tooltipHint: { fontWeight: vars["--aui-font-weight-regular"] },
});

/**
 * The composer's way into a side question: it opens the question panel and
 * leaves the draft alone, so nothing typed here is sent, queued or steered.
 * Offered while a turn runs too, which is when a side question is most useful.
 *
 * A glyph at every width, the same borderless icon button as Attach beside
 * it. Its accessible name is the control's name, the tooltip leads with that
 * same name, and what it does is the tooltip's second line and the button's
 * description.
 */
export function SideQuestionComposerControl(props: { taskId: string }) {
  useTranslation();
  const hintId = useId();
  const name = i18n.t("session:sideChat.title");
  const hint = i18n.t("session:sideChat.hint");
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={tooltipTriggerButtonClassName({
            size: "icon-sm",
            className: PROMPT_TOOLBAR_ICON_BUTTON,
          })}
          aria-label={name}
          aria-describedby={hintId}
          data-testid="composer-side-question"
          onClick={() => openTaskSideQuestion(props.taskId)}
        >
          <MessageCircleQuestion className={sx(promptInputStyles.icon35)} aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className={sx(styles.tooltipBody)}>
            <span>{name}</span>
            <span className={sx(styles.tooltipHint)}>{hint}</span>
          </span>
        </TooltipContent>
      </Tooltip>
      <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
    </>
  );
}
