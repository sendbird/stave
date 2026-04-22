import { cn } from "@/lib/utils";

export interface PromptInputRuntimeStatusItem {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "warning";
}

interface PromptInputRuntimeBarProps {
  statusItems?: readonly PromptInputRuntimeStatusItem[];
  className?: string;
  withBorder?: boolean;
}

function statusPillToneClass(tone: PromptInputRuntimeStatusItem["tone"]) {
  if (tone === "warning") {
    return "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15";
  }
  return "border-border/70 bg-background/60 text-foreground";
}

function RuntimeStatusPill(args: { label: string; value: string; tone?: PromptInputRuntimeStatusItem["tone"] }) {
  return (
    <div
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs",
        statusPillToneClass(args.tone),
      )}
    >
      <span className="shrink-0 text-muted-foreground">{args.label}</span>
      <span className="truncate font-medium">{args.value}</span>
    </div>
  );
}

export function PromptInputRuntimeBar(args: PromptInputRuntimeBarProps) {
  const statusItems = args.statusItems ?? [];

  if (statusItems.length === 0) {
    return null;
  }

  return (
    <div className={cn(args.withBorder !== false && "border-t border-border/70 pt-3", args.className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Runtime
        </span>
        {statusItems.map((item) => (
          <RuntimeStatusPill key={item.id} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}
