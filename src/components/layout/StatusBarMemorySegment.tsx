import { MemoryUsagePopover } from "@/components/layout/ResourcesPopover";

/**
 * Bottom status-bar home for the memory/CPU indicator that used to live in
 * the project sidebar rail. Kept as its own file so the bar's segment list
 * stays a flat, easy-to-scan set of imports.
 */
export function StatusBarMemorySegment() {
  return <MemoryUsagePopover variant="bar" />;
}
