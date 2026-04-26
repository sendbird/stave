import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { MESSAGE_BODY_LINE_HEIGHT } from "./message-styles";

export function ZenMessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const messageFontSize = useAppStore((state) => state.settings.messageFontSize);
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-2 font-mono text-foreground",
        className,
      )}
      style={{ fontSize: `${messageFontSize}px`, lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
      {...props}
    />
  );
}
