import type { IDockviewPanelProps } from "dockview-react";
import { CompareRunPanel } from "@/components/compare/CompareRunPanel";
import { parsePanePanelId } from "@/lib/panes/types";

/** Dockview panel wrapper rendering a compare run surface. */
export function CompareRunSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "compare-run") {
    return null;
  }
  return <CompareRunPanel compareRunId={surface.compareRunId} />;
}
