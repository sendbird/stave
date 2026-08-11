import { Globe2 } from "lucide-react";
import { Badge } from "@/components/ui";
import type { WorkspaceConnectedBrowserTab } from "@/lib/provider-browser";
import { formatTaskUpdatedAt } from "@/lib/tasks";

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
      className="rounded-lg border border-border/70 bg-card/60 p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/50">
          <Globe2 className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              Connected browser tab
            </h3>
            <Badge
              variant="outline"
              className="h-5 rounded-full px-2 py-0 text-[11px] font-normal leading-none text-muted-foreground"
            >
              {PROVIDER_LABELS[props.tab.providerId]}
            </Badge>
            <Badge
              variant="outline"
              className="h-5 rounded-full px-2 py-0 text-[11px] font-normal leading-none text-muted-foreground"
            >
              {STATUS_LABELS[props.tab.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {props.tab.status === "connected"
              ? "The AI can use page content through the provider's native browser tools."
              : props.tab.status === "connecting"
                ? "Waiting for the provider's native browser extension."
                : "The provider could not confirm a native browser connection."}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Last updated {formatTaskUpdatedAt({ value: props.tab.lastUpdatedAt })}.
            Live tab lifecycle and site approvals remain provider-owned.
          </p>
        </div>
      </div>
    </section>
  );
}
