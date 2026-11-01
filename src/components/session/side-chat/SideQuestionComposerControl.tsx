import { i18n, useTranslation } from "@/i18n";
import { MessageCircleQuestion } from "lucide-react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { openTaskSideQuestion } from "@/components/panes/task-surface-entry";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";

/**
 * The composer's way into a side question: it opens the question panel and
 * leaves the draft alone, so nothing typed here is sent, queued or steered.
 * Offered while a turn runs too, which is when a side question is most useful.
 */
export function SideQuestionComposerControl(props: {
  taskId: string;
  /** A narrow row keeps the glyph; the tooltip and accessible name still say it. */
  iconOnly?: boolean;
}) {
  useTranslation();
  const hint = i18n.t("session:sideChat.hint");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={COMPOSER_CONTROL_BUTTON}
            {...composerControlAttributes}
            aria-label={hint}
            data-testid="composer-side-question"
            data-compact={props.iconOnly ? "true" : undefined}
            onClick={() => openTaskSideQuestion(props.taskId)}
          />
        }
      >
        <MessageCircleQuestion size={16} aria-hidden />
        {props.iconOnly ? null : (
          <ComposerControlLabel>{i18n.t("session:sideChat.title")}</ComposerControlLabel>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}
