import { MemoryUsagePopover } from "@/components/layout/ResourcesPopover";
import type { ResourceLabelBreakpoint } from "@/components/layout/status-bar-shrink";
import { resourceLabelVisibility } from "@/components/layout/status-bar-shrink.styles";

/**
 * Bottom status-bar home for the memory/CPU indicator that used to live in
 * the project sidebar rail. Kept as its own file so the bar's segment list
 * stays a flat, easy-to-scan set of imports. Its label is the second thing
 * the bar gives up as it narrows (`STATUS_BAR_SHRINK_ORDER`).
 */
export function StatusBarMemorySegment(props: { labelBreakpoint: ResourceLabelBreakpoint }) {
  return (
    <MemoryUsagePopover
      variant="bar"
      barLabelXstyle={resourceLabelVisibility(props.labelBreakpoint)}
    />
  );
}
