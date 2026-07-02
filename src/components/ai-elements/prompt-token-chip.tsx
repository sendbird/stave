import { Info, Sparkles, Terminal } from "lucide-react";
import type { PromptTokenDescriptor } from "@/lib/prompt-token-chips";
import { cn } from "@/lib/utils";

export function PromptTokenChip(args: {
  descriptor: PromptTokenDescriptor;
  compact?: boolean;
  showDetail?: boolean;
  className?: string;
}) {
  const { descriptor, compact, className } = args;
  const showDetail = args.showDetail ?? !compact;
  const Icon =
    descriptor.kind === "information"
      ? Info
      : descriptor.kind === "skill"
        ? Sparkles
        : Terminal;
  const toneClassName =
    descriptor.kind === "information"
      ? "border-primary/25 bg-primary/10 text-primary"
      : descriptor.kind === "skill"
        ? "border-prompt-role-thinking/30 bg-prompt-role-thinking/10 text-prompt-role-thinking"
        : "border-border/80 bg-muted/55 text-foreground";
  const detailToneClassName =
    descriptor.kind === "information"
      ? "text-primary/70"
      : descriptor.kind === "skill"
        ? "text-prompt-role-thinking/70"
        : "text-muted-foreground";

  return (
    <span
      contentEditable={false}
      title={descriptor.detail ?? descriptor.token}
      className={cn(
        "inline-flex max-w-full select-none items-center rounded-sm border align-baseline font-medium leading-none",
        compact
          ? "h-[1.45em] gap-[0.3em] px-[0.35em] text-[0.78em]"
          : "gap-1.5 px-2 py-1 text-[0.8125em]",
        toneClassName,
        className,
      )}
    >
      <Icon className={cn("shrink-0", compact ? "size-[0.9em]" : "size-3.5")} />
      <span className="min-w-0 truncate">{descriptor.label}</span>
      {showDetail && descriptor.detail ? (
        <span className={cn("min-w-0 truncate font-normal", detailToneClassName)}>
          {descriptor.detail}
        </span>
      ) : null}
    </span>
  );
}
