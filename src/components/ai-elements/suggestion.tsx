import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { useCallback } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 overflow-x-auto pb-1",
        className,
      )}
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
      className={cn(
        "max-w-full cursor-pointer rounded-full px-4 text-left",
        className,
      )}
      onClick={handleClick}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}

export const PromptSuggestions = Suggestions;
export const PromptSuggestion = Suggestion;
