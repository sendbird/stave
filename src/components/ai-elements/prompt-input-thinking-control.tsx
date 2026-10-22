import { i18n, useTranslation } from "@/i18n";
import { Brain } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import {
  CLAUDE_THINKING_MODE_HELP,
  DEFAULT_CLAUDE_THINKING_MODE,
  getClaudeThinkingModeHelp,
  type ClaudeThinkingMode,
} from "@/lib/providers/claude-thinking-mode";
import { cx, sx } from "../ads/utils/stylex";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
  useComposerControlIconOnly,
} from "./composer-control-density";
import { getPromptToolbarAccentStyle } from "./prompt-input-toolbar-parts";
import { promptInputStyles } from "./prompt-input.styles";
import { thinkingControlStyles as styles } from "./prompt-input-thinking-control.styles";

function isClaudeThinkingMode(value: unknown): value is ClaudeThinkingMode {
  return CLAUDE_THINKING_MODE_HELP.some((option) => option.value === value);
}

/**
 * The composer's Thinking control. Its label says the mode in use
 * ("Thinking · Adaptive", or "Adaptive" in a wing), and it opens a menu of the three modes with what
 * each does. The mode changes only when one is chosen: Esc, Tab or a click
 * outside closes the menu and leaves it as it was. The mode is the Claude
 * setting every task shares, and the menu says so.
 */
export function PromptInputThinkingControl(props: {
  mode: ClaudeThinkingMode | undefined;
  disabled: boolean;
  onChange: (mode: ClaudeThinkingMode) => void;
}) {
  useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const mode = props.mode ?? DEFAULT_CLAUDE_THINKING_MODE;
  const current = getClaudeThinkingModeHelp(mode);
  const label = i18n.t("composer:promptInput.thinkingValue", {
    value: current.label,
  });
  // A wing reveals at most a short label beside the glyph, so there the
  // label is the mode alone; the brain glyph, the name and the title still
  // say what it is.
  const visibleLabel = useComposerControlIconOnly() ? current.label : label;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // The composer lane owns the box and the glyph size, as for the
            // other host-layout controls in the wings.
            layout="host"
            disabled={props.disabled}
            {...composerControlAttributes}
            aria-label={label}
            title={i18n.t("composer:promptInput.thinkingTitle", {
              value: current.label,
            })}
            className={cx(
              COMPOSER_CONTROL_BUTTON,
              sx(
                mode === "enabled"
                  ? getPromptToolbarAccentStyle("thinking")
                  : mode === "disabled"
                    ? promptInputStyles.toneMutedHalf
                    : undefined,
                props.disabled && promptInputStyles.cursorDisabled,
              ),
            )}
          />
        }
      >
        <Brain
          className={sx(
            promptInputStyles.icon4,
            mode === "adaptive" && promptInputStyles.iconThinking,
          )}
        />
        <ComposerControlLabel>
          <span>{visibleLabel}</span>
        </ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={6}
        xstyle={styles.content}
        // Tab closes the menu without choosing and puts focus back on the
        // trigger, as Esc does, instead of moving on past the control.
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Tab") {
            return;
          }
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }}
      >
        <DropdownMenuLabel>
          {i18n.t("composer:promptInput.thinkingMenuTitle")}
        </DropdownMenuLabel>
        <p className={sx(styles.scope)}>
          {i18n.t("composer:promptInput.thinkingMenuScope")}
        </p>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isClaudeThinkingMode(value) && value !== mode) {
              props.onChange(value);
            }
          }}
        >
          {CLAUDE_THINKING_MODE_HELP.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              // Choosing a mode is the whole job of the menu.
              closeOnClick
              className={sx(styles.item)}
            >
              <span className={sx(styles.itemBody)}>
                <span>{option.label}</span>
                <span className={sx(styles.itemDescription)}>
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
