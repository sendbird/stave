import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge } from "@/components/ui";
import type {
  ProviderBrowserConnectionStatus,
  WorkspaceConnectedBrowserTab,
} from "@/lib/provider-browser";
import type { ProviderId } from "@/lib/providers/provider.types";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { SettingsCard } from "./settings-dialog.shared";

const PROVIDER_BROWSER_SETUP = {
  "claude-code": {
    label: "Claude Code",
    setup:
      "Connect Claude Code's native Chrome extension to the profile you want to share, allow access to the target site, then try @web again.",
  },
  codex: {
    label: "Codex",
    setup:
      "Install and enable chrome@openai-bundled in the Codex CLI environment used by Stave, connect its Chrome extension, then try @web again.",
  },
} as const satisfies Record<ProviderId, { label: string; setup: string }>;

const STATUS_LABELS = {
  connecting: "Connecting",
  connected: "Connected",
  failed: "Unavailable",
  unchecked: "Not checked",
  superseded: "No recent result",
} as const;

type SettingsBrowserStatus =
  | ProviderBrowserConnectionStatus
  | "unchecked"
  | "superseded";

function resolveSettingsBrowserStatus(args: {
  providerId: ProviderId;
  tab: WorkspaceConnectedBrowserTab | null;
}): SettingsBrowserStatus {
  if (!args.tab) {
    return "unchecked";
  }
  return args.tab.providerId === args.providerId
    ? args.tab.status
    : "superseded";
}

function statusDescription(args: {
  providerLabel: string;
  status: SettingsBrowserStatus;
}) {
  if (args.status === "connected") {
    return `The last ${args.providerLabel} @web turn confirmed its native browser tools.`;
  }
  if (args.status === "connecting") {
    return `The latest ${args.providerLabel} @web request is waiting for its native browser extension.`;
  }
  if (args.status === "failed") {
    return `The last ${args.providerLabel} @web turn could not confirm its native browser tools.`;
  }
  if (args.status === "superseded") {
    return `The active workspace retains its latest @web result from the other provider. Run ${args.providerLabel} with @web to check it again.`;
  }
  return `Run an interactive ${args.providerLabel} turn with @web to check this connection.`;
}

function ProviderBrowserStatusCard(args: {
  providerId: ProviderId;
  tab: WorkspaceConnectedBrowserTab | null;
}) {
  const provider = PROVIDER_BROWSER_SETUP[args.providerId];
  const status = resolveSettingsBrowserStatus(args);
  const checkedTab = args.tab?.providerId === args.providerId ? args.tab : null;

  return (
    <article
      aria-label={`${provider.label} browser access: ${STATUS_LABELS[status]}`}
      className="rounded-lg border border-border/70 bg-muted/20 p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/70">
          <ModelIcon providerId={args.providerId} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {provider.label}
          </p>
          {checkedTab ? (
            <p className="text-xs text-muted-foreground">
              Last checked{" "}
              {formatTaskUpdatedAt({ value: checkedTab.lastUpdatedAt })}
            </p>
          ) : null}
        </div>
        <Badge
          variant={
            status === "connected"
              ? "secondary"
              : status === "failed"
                ? "destructive"
                : "outline"
          }
        >
          {STATUS_LABELS[status]}
        </Badge>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {statusDescription({ providerLabel: provider.label, status })}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Setup:</span>{" "}
        {provider.setup}
      </p>
    </article>
  );
}

export function ProviderBrowserAccessSettingsCard(args: {
  tab: WorkspaceConnectedBrowserTab | null;
}) {
  return (
    <SettingsCard
      id="settings-field-browser-access"
      tabIndex={-1}
      title="Browser access"
      description="Use the active provider's native Chrome extension to reference existing tabs and signed-in page state. Stave requests access only for an interactive prompt containing @web."
      titleAccessory={<Badge variant="outline">Per prompt</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ProviderBrowserStatusCard providerId="claude-code" tab={args.tab} />
        <ProviderBrowserStatusCard providerId="codex" tab={args.tab} />
      </div>
      <div className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Recheck:</span> send a
          new interactive prompt containing <code>@web</code>. Connection and
          site approval remain in the provider&apos;s extension; Stave cannot
          install, enable, or grant access on its behalf.
        </p>
        <p className="mt-1">
          Plan mode, unattended automation, secondary analysis, and prompts
          without <code>@web</code> keep provider-native browser access off.
        </p>
      </div>
    </SettingsCard>
  );
}
