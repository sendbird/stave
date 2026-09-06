import { useEffect, useState } from "react";

import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge, Textarea } from "@/components/ui";
import type {
  ProviderBrowserConnectionStatus,
  WorkspaceConnectedBrowserTab,
} from "@/lib/provider-browser";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS } from "@/lib/provider-browser";
import { sx } from "@/components/ads/utils/stylex";
import { SettingsCard, SwitchField } from "./settings-dialog.shared";
import { providerBrowserAccessSettingsCardStyles as styles } from "./ProviderBrowserAccessSettingsCard.styles";

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
} as const satisfies Record<
  ManagedExecutionProviderId,
  { label: string; setup: string }
>;

const STATUS_LABELS = {
  connecting: "Connecting",
  connected: "Connected",
  failed: "Unavailable",
  unchecked: "Not checked",
  superseded: "No recent result",
} as const;

type SettingsBrowserStatus =
  ProviderBrowserConnectionStatus | "unchecked" | "superseded";

function resolveSettingsBrowserStatus(args: {
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
  tab: WorkspaceConnectedBrowserTab | null;
}) {
  const provider = PROVIDER_BROWSER_SETUP[args.providerId];
  const status = resolveSettingsBrowserStatus(args);
  const checkedTab = args.tab?.providerId === args.providerId ? args.tab : null;

  return (
    <article
      aria-label={`${provider.label} browser access: ${STATUS_LABELS[status]}`}
      className={sx(styles.statusCard)}
    >
      <div className={sx(styles.statusHead)}>
        <span className={sx(styles.statusMark)}>
          <ModelIcon
            providerId={args.providerId}
            className={sx(styles.statusIcon)}
          />
        </span>
        <div className={sx(styles.statusBody)}>
          <p className={sx(styles.statusName)}>{provider.label}</p>
          {checkedTab ? (
            <p className={sx(styles.statusMeta)}>
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
      <p className={sx(styles.statusDescription)}>
        {statusDescription({ providerLabel: provider.label, status })}
      </p>
      <p className={sx(styles.statusSetup)}>
        <span className={sx(styles.emphasis)}>Setup:</span> {provider.setup}
      </p>
    </article>
  );
}

function AutoFallbackDomainsField(args: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(args.value);
  useEffect(() => setDraft(args.value), [args.value]);
  return (
    <div className={sx(styles.domainsField)}>
      <label
        htmlFor="settings-field-browser-auto-fallback-domains"
        className={sx(styles.domainsLabel)}
      >
        Additional auto-arm hosts
      </label>
      <Textarea
        id="settings-field-browser-auto-fallback-domains"
        value={draft}
        rows={2}
        placeholder="wiki.corp.example, docs.corp.example"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== args.value) {
            args.onCommit(draft);
          }
        }}
      />
      <p className={sx(styles.domainsHint)}>
        Comma- or space-separated; subdomains match. Always included:{" "}
        {PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS.join(", ")}.
      </p>
    </div>
  );
}

export function ProviderBrowserAccessSettingsCard(args: {
  tab: WorkspaceConnectedBrowserTab | null;
  autoFallback: boolean;
  onAutoFallbackChange: (enabled: boolean) => void;
  autoFallbackDomains: string;
  onAutoFallbackDomainsChange: (value: string) => void;
}) {
  return (
    <SettingsCard
      id="settings-field-browser-access"
      tabIndex={-1}
      title="Browser access"
      description="Use the active provider's native Chrome extension to reference existing tabs and signed-in page state. Stave requests access only for an interactive prompt containing @web."
      titleAccessory={<Badge variant="outline">Per prompt</Badge>}
    >
      <div className={sx(styles.grid)}>
        <ProviderBrowserStatusCard providerId="claude-code" tab={args.tab} />
        <ProviderBrowserStatusCard providerId="codex" tab={args.tab} />
      </div>
      <SwitchField
        title="Automatic browser fallback"
        description="Without an explicit @web, arm the browser up front for hosts a plain fetch cannot read, and retry once with it after a fetch is blocked by a login wall or bot check."
        checked={args.autoFallback}
        onCheckedChange={args.onAutoFallbackChange}
      />
      {args.autoFallback ? (
        <AutoFallbackDomainsField
          value={args.autoFallbackDomains}
          onCommit={args.onAutoFallbackDomainsChange}
        />
      ) : null}
      <div className={sx(styles.noteCard)}>
        <p>
          <span className={sx(styles.emphasis)}>Recheck:</span> send a new
          interactive prompt containing <code>@web</code>. Connection and site
          approval remain in the provider&apos;s extension; Stave cannot
          install, enable, or grant access on its behalf.
        </p>
        <p className={sx(styles.noteSpacer)}>
          Plan mode, unattended automation, and secondary analysis keep
          provider-native browser access off, and automatic fallback never
          overrides them. With fallback off, a prompt without <code>@web</code>{" "}
          also keeps it off.
        </p>
      </div>
    </SettingsCard>
  );
}
