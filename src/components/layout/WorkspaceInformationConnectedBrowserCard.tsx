import { Globe2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import type { WorkspaceConnectedBrowserTab } from "@/lib/provider-browser";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { workspaceConnectedBrowserCardStyles as styles } from "./workspace-information-connected-browser-card.styles";

const PROVIDER_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
} as const;

const STATUS_LABELS = {
  connecting: "Connecting",
  connected: "Connected",
  failed: "Unavailable",
} as const;

export function WorkspaceInformationConnectedBrowserCard(props: {
  tab: WorkspaceConnectedBrowserTab | null;
}) {
  if (!props.tab) {
    return null;
  }

  return (
    <section
      aria-label="Connected browser tab"
      className={sx(styles.root)}
    >
      <div className={sx(styles.row)}>
        <span className={sx(styles.iconBox)}>
          <Globe2 className={sx(styles.icon)} />
        </span>
        <div className={sx(styles.body)}>
          <div className={sx(styles.titleRow)}>
            <h3 className={sx(styles.title)}>
              Connected browser tab
            </h3>
            <Badge
              variant="outline"
              className={sx(styles.chip)}
            >
              {PROVIDER_LABELS[props.tab.providerId]}
            </Badge>
            <Badge
              variant="outline"
              className={sx(styles.chip)}
            >
              {STATUS_LABELS[props.tab.status]}
            </Badge>
          </div>
          <p className={sx(styles.note)}>
            {props.tab.status === "connected"
              ? "The AI can use page content through the provider's native browser tools."
              : props.tab.status === "connecting"
                ? "Waiting for the provider's native browser extension."
                : "The provider could not confirm a native browser connection."}
          </p>
          <p className={sx(styles.note)}>
            Last updated {formatTaskUpdatedAt({ value: props.tab.lastUpdatedAt })}.
            Live tab lifecycle and site approvals remain provider-owned.
          </p>
        </div>
      </div>
    </section>
  );
}
