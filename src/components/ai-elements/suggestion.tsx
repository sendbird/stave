import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { useCallback } from "react";
import { Button } from "@/components/ui";
import { coreStyles } from "./ai-element-core.styles";
import { cx, sx } from "../ads/utils/stylex";

type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      className={cx(sx(coreStyles.suggestionList), className)}
      {...props}
    />
  );
}

type SuggestionButtonProps = Omit<ComponentProps<typeof Button>, "children" | "onClick">;

interface SuggestionProps extends SuggestionButtonProps {
  suggestion: string;
  children?: ReactNode;
  onClick?: (suggestion: string) => void;
}

export function Suggestion({
  suggestion,
  children,
  className,
  onClick,
  type = "button",
  variant = "outline",
  size = "sm",
  ...props
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cx(sx(coreStyles.suggestionButton), className)}
      onClick={handleClick}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}

export const PromptSuggestions = Suggestions;
export const PromptSuggestion = Suggestion;
