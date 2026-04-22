import { cn } from "@/lib/utils";

export function WaveIndicator(args: { className?: string; barClassName?: string; animate?: boolean }) {
  const { className, barClassName, animate = true } = args;
  const barBase = "h-4 w-1 origin-bottom rounded-sm bg-current";
  const barState = animate ? "animate-message-wave" : "scale-y-[0.35] opacity-45";

  return (
    <span className={cn("inline-flex items-end gap-0.5", className)} aria-hidden="true">
      <span className={cn(barBase, barState, barClassName)} style={animate ? { animationDelay: "-0.24s" } : undefined} />
      <span className={cn(barBase, barState, barClassName)} style={animate ? { animationDelay: "-0.12s" } : undefined} />
      <span className={cn(barBase, barState, barClassName)} />
    </span>
  );
}
