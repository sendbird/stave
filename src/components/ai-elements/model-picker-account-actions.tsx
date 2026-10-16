import { i18n, useTranslation } from "@/i18n";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { apiConnectionFocus, type AccountsSettingsFocus } from "@/lib/providers/accounts-guide";
import { openAccountsSettings } from "@/lib/providers/accounts-navigation";
import {
  describeProviderAccountBlocker,
  providerAccountBlockerActionLabel,
  type ProviderAccountBlocker,
} from "@/lib/providers/provider-account-blocker";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useProviderAccountBlocker } from "@/lib/providers/use-provider-account-blocker";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { modelPickerAccountStyles as styles } from "./model-picker-account-actions.styles";

/**
 * The picker has no tab for a provider that cannot run (its options are
 * filtered out), so its state and fix sit in the foot instead of a group
 * heading. Only a provider someone set up and that stopped working is named:
 * installed but signed out, or a connection whose key Stave cannot read. A
 * CLI that is not installed is left out (most people do not use every
 * provider); the composer line covers the task's own provider, and Getting
 * started and "Manage accounts and connections…" cover installing. A usage
 * limit is the composer's line too.
 */
export function isModelPickerBlocker(blocker: ProviderAccountBlocker | null): blocker is ProviderAccountBlocker {
  return blocker?.kind === "signed-out" || blocker?.kind === "key-unreadable";
}

/**
 * The composer model selector's foot: why a set-up provider is missing from it,
 * a way to add gateway models when there is no API connection, and the way
 * into Settings > Accounts. `onNavigate` closes the picker first.
 */
export function ModelPickerAccountFooter(props: { onNavigate: () => void }) {
  const claude = useProviderAccountBlocker("claude-code");
  const codex = useProviderAccountBlocker("codex");
  const cursor = useProviderAccountBlocker("cursor");
  const kiro = useProviderAccountBlocker("kiro");
  const opencode = useProviderAccountBlocker("opencode");
  const hasConnection = useProviderAccounts((state) => state.profiles.some((profile) => Boolean(profile.apiConnection)));
  return (
    <ModelPickerAccountFooterView
      blockers={[claude, codex, cursor, kiro, opencode]}
      hasConnection={hasConnection}
      onGo={(focus) => {
        props.onNavigate();
        openAccountsSettings(focus);
      }}
    />
  );
}

/** The foot for given blockers; the connected form is `ModelPickerAccountFooter`. */
export function ModelPickerAccountFooterView(props: {
  blockers: ReadonlyArray<ProviderAccountBlocker | null>;
  hasConnection: boolean;
  onGo: (focus?: AccountsSettingsFocus) => void;
}) {
  useTranslation();
  const blockers = props.blockers.filter(isModelPickerBlocker);
  const hasConnection = props.hasConnection;
  const go = props.onGo;
  return (
    <div className={sx(styles.footer)} data-testid="model-picker-accounts">
      {blockers.map((blocker) => (
        <div key={blocker.providerId} className={sx(styles.notice)} data-provider={blocker.providerId} data-kind={blocker.kind}>
          <AlertCircle aria-hidden className={sx(styles.noticeIcon)} />
          <span className={sx(styles.noticeText)} title={describeProviderAccountBlocker(blocker)}>
            {describeProviderAccountBlocker(blocker)}
          </span>
          <Button size="xs" variant="outline" onClick={() => go(blocker.focus)}>
            {providerAccountBlockerActionLabel(blocker)}
          </Button>
        </div>
      ))}
      {!hasConnection ? (
        <Button size="sm" variant="quiet" xstyle={styles.link} onClick={() => go("api-connection-new")}>
          {i18n.t("composer:modelPickerAccounts.addGatewayModels")}
        </Button>
      ) : null}
      <Button size="sm" variant="quiet" xstyle={styles.link} onClick={() => go()}>
        {i18n.t("composer:modelPickerAccounts.manage")}
      </Button>
    </div>
  );
}

/**
 * "Edit models" beside an API connection's group heading: opens that
 * connection's edit form. The group the picker shows is the provider's
 * selected account, so the selected account is the connection.
 */
/** "Edit models" for a connection's group: the one given, else the runtime's selected account. */
export function ModelGroupEditButton(props: { providerId: ProviderId; accountProfileId?: string; onNavigate: () => void }) {
  useTranslation();
  const selectedAccountId = useAppStore((state) => selectedProviderAccount(props.providerId, state.settings));
  const selectedId = props.accountProfileId ?? selectedAccountId;
  const isConnection = useProviderAccounts((state) =>
    state.profiles.some((profile) => profile.providerId === props.providerId && profile.id === selectedId && Boolean(profile.apiConnection)),
  );
  if (!isConnection) return null;
  return (
    <Button
      size="xs"
      variant="quiet"
      onClick={() => {
        props.onNavigate();
        openAccountsSettings(apiConnectionFocus(selectedId));
      }}
    >
      {i18n.t("composer:modelPickerAccounts.editModels")}
    </Button>
  );
}
