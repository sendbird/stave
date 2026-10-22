import { i18n, useTranslation } from "@/i18n";
import { SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import type { PromptInputRuntimeProfile } from "./prompt-input-runtime-bar";

export const PROMPT_SURFACE_PRIMARY_FOCUS = sx(promptInputStyles.surfacePrimaryFocus);
export const PROMPT_TOOLBAR_ICON_BUTTON = sx(promptInputStyles.toolbarIconButton);

export function tooltipTriggerButtonClassName(args: {
  variant?:
    "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?:
    "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  className?: string;
}) {
  return buttonVariants({
    variant: args.variant ?? "ghost",
    size: args.size ?? "sm",
    className: args.className,
  });
}

export function getPromptToolbarAccentStyle(_tone: "thinking") {
  return promptInputStyles.accentThinking;
}

export function getRuntimeProfileToneStyle(tone: PromptInputRuntimeProfile["tone"]) {
  if (tone === "warning") {
    return promptInputStyles.toneWarning;
  }
  if (tone === "accent") {
    return promptInputStyles.tonePrimary;
  }
  return promptInputStyles.toneSuccess;
}

export function PromptInputRuntimeTriggerIcon(args: {
  profile: PromptInputRuntimeProfile;
}) {
  useTranslation();
  return (
    <span className={sx(promptInputStyles.runtimeTriggerIcon)}>
      <SlidersHorizontal
        aria-hidden="true"
        className={sx(promptInputStyles.runtimeTriggerGlyph)}
      />
      <span
        aria-hidden="true"
        className={sx(
          promptInputStyles.runtimeTriggerDot,
          args.profile.tone === "warning"
            ? promptInputStyles.runtimeDotWarning
            : args.profile.tone === "accent"
              ? promptInputStyles.runtimeDotCustom
              : promptInputStyles.runtimeDotSuccess,
        )}
      />
      <span className={sx(promptInputStyles.srOnly)}>{i18n.t("composer:promptInput.sentence29", { value1: args.profile.label })}</span>
    </span>
  );
}
