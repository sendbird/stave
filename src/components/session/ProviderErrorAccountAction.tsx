import { i18n, useTranslation } from "@/i18n";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { cliProviderFocus } from "@/lib/providers/accounts-guide";
import { openAccountsSettings } from "@/lib/providers/accounts-navigation";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { providerErrorRecoveryStyles as styles } from "./provider-error-recovery.styles";

/**
 * Under a turn that ended on the account (sign-in refused, usage limit), the
 * one button that fixes it in Settings > Accounts: the provider's accounts
 * card, where "Account for new turns" switches, or its add form when there is
 * no other account to switch to. For Cursor, Kiro and OpenCode a sign-in
 * failure goes to the CLI's row, which copies its own login command.
 */
export function ProviderErrorAccountAction(props: { taskId: string; failure: "auth" | "usage-limit" }) {
  useTranslation();
  const providerId = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.provider);
  const accountCount = useProviderAccounts((state) =>
    state.profiles.filter((profile) => profile.providerId === providerId).length,
  );
  if (providerId === "cursor" || providerId === "kiro" || providerId === "opencode") {
    // These CLIs keep their own sign-in and have no account to switch to.
    if (props.failure !== "auth") return null;
    return (
      <div className={sx(styles.accountAction)}>
        <Button type="button" variant="outline" size="sm" onClick={() => openAccountsSettings(cliProviderFocus(providerId))}>
          <UserRound aria-hidden="true" />
          {i18n.t("session:providerErrorAccountAction.openAccounts")}
        </Button>
      </div>
    );
  }
  if (providerId !== "claude-code" && providerId !== "codex") return null;
  const switchable = accountCount > 1;
  const label =
    props.failure === "auth"
      ? i18n.t("session:providerErrorAccountAction.openAccounts")
      : switchable
        ? i18n.t("session:providerErrorAccountAction.switchAccount")
        : i18n.t("session:providerErrorAccountAction.addAccount");
  return (
    <div className={sx(styles.accountAction)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openAccountsSettings(props.failure === "usage-limit" && !switchable ? `${providerId}-add` : providerId)}
      >
        <UserRound aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}
