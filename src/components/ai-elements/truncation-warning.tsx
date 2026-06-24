import { AlertTriangle } from "lucide-react";
import type { HTMLAttributes } from "react";
import type { TruncationNotice } from "@/lib/truncation-visibility";
import { cn } from "@/lib/utils";

export function TruncationWarningBanner({
  notice,
  className,
  compact = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  notice: TruncationNotice;
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 text-warning dark:bg-warning/15",
        compact ? "px-2 py-1.5 text-[0.75em]" : "px-3 py-2 text-[0.875em]",
        className,
      )}
      {...props}
    >
      <AlertTriangle
        className={cn("mt-0.5 shrink-0", compact ? "size-3.5" : "size-4")}
      />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium leading-snug text-foreground">
          {notice.title}
        </p>
        <p className="leading-snug text-muted-foreground">
          {notice.description}
        </p>
      </div>
    </div>
  );
}
