import type { IDockviewPanelProps } from "dockview-react";
import { CliSessionPanel } from "@/components/layout/CliSessionPanel";
import { parsePanePanelId } from "@/lib/panes/types";

/** Dockview panel wrapper rendering a CLI session terminal surface. */
export function CliSessionSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "cli-session") {
    return null;
  }
  return <CliSessionPanel cliSessionTabId={surface.cliSessionTabId} />;
}
