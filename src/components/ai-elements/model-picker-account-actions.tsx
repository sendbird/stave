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
 * heading. A usage limit is the composer's line, not the picker's.
 */
function pickerBlocker(blocker: ProviderAccountBlocker | null) {
  return blocker && blocker.kind !== "limit-reached" ? blocker : null;
}

/**
 * The composer model selector's foot: why Claude Code or Codex is missing,
 * a way to add gateway models when there is no API connection, and the way
 * into Settings > Accounts. `onNavigate` closes the picker first.
 */
export function ModelPickerAccountFooter(props: { onNavigate: () => void }) {
  const claude = useProviderAccountBlocker("claude-code");
  const codex = useProviderAccountBlocker("codex");
  const hasConnection = useProviderAccounts((state) => state.profiles.some((profile) => Boolean(profile.apiConnection)));
  return (
    <ModelPickerAccountFooterView
      blockers={[claude, codex]}
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
  const [claude, codex] = props.blockers.map(pickerBlocker);
  const hasConnection = props.hasConnection;
  const go = props.onGo;
  return (
    <div className={sx(styles.footer)} data-testid="model-picker-accounts">
      {[claude, codex].map((blocker) =>
        blocker ? (
          <div key={blocker.providerId} className={sx(styles.notice)} data-provider={blocker.providerId} data-kind={blocker.kind}>
            <AlertCircle aria-hidden className={sx(styles.noticeIcon)} />
            <span className={sx(styles.noticeText)} title={describeProviderAccountBlocker(blocker)}>
              {describeProviderAccountBlocker(blocker)}
            </span>
            <Button size="xs" variant="outline" onClick={() => go(blocker.focus)}>
              {providerAccountBlockerActionLabel(blocker)}
            </Button>
          </div>
        ) : null,
      )}
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
export function ModelGroupEditButton(props: { providerId: ProviderId; onNavigate: () => void }) {
  useTranslation();
  const selectedId = useAppStore((state) => selectedProviderAccount(props.providerId, state.settings));
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
