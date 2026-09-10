import { useEffect, useState } from "react";

import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge, Textarea } from "@/components/ui";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";
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
      "Enable chrome@openai-bundled and unified-computer-use@openai-bundled in the Codex CLI environment used by Stave, connect its Chrome extension, then try @web again.",
  },
} as const satisfies Record<
  ManagedExecutionProviderId,
  { label: string; setup: string }
>;

function ProviderBrowserSetupCard(args: {
  providerId: ManagedExecutionProviderId;
}) {
  const provider = PROVIDER_BROWSER_SETUP[args.providerId];

  return (
    <article
      aria-label={`${provider.label} browser access setup`}
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
        </div>
      </div>
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
      description="Use the active provider's native external Chrome connection to reference existing tabs and signed-in page state. Stave requests access only for an interactive prompt containing @web."
      titleAccessory={<Badge variant="outline">Per prompt</Badge>}
    >
      <div className={sx(styles.grid)}>
        <ProviderBrowserSetupCard providerId="claude-code" />
        <ProviderBrowserSetupCard providerId="codex" />
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
          Send an interactive prompt containing <code>@web</code>. Chrome access
          is attempted for that turn, and any failure is reported in the
          conversation. Site approval remains in the provider&apos;s extension;
          Stave cannot install, enable, or grant access on its behalf.
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
