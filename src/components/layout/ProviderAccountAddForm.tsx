import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/ads/headless/collapsible";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import type { ProviderAccountProfile, ProviderAccountProviderId } from "@/lib/providers/provider-accounts";
import { describeProviderAccountSetup } from "@/lib/providers/provider-account-setup";
import { USE_SYSTEM_SETUP_LABEL_KEY } from "./ProviderAccountSetupSharing";
import { accountStyles as styles } from "./provider-accounts.styles";

const FOLDER_ENV = { "claude-code": "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" } as const;

/**
 * Adding an account is one step: name it, and Stave creates its folder and
 * opens the sign-in terminal. Reusing a folder the user already signed in to
 * is the advanced path; it skips sign-in because that folder has one.
 */
export function ProviderAccountAddForm(props: {
  providerId: ProviderAccountProviderId;
  name: string;
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
  login: (profile: ProviderAccountProfile) => Promise<void>;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { providerId, name } = props;
  const nameId = useId();
  const folderId = useId();
  const [label, setLabel] = useState("");
  const [directory, setDirectory] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [shareSetup, setShareSetup] = useState(true);
  const reuseFolder = Boolean(directory.trim());
  const add = () => props.run(async () => {
    const trimmedLabel = label.trim();
    const result = await window.api!.providerAccounts!.create({
      providerId, label: trimmedLabel, ...(reuseFolder ? { configDirectory: directory.trim() } : {}),
    });
    if (!result.ok) throw new Error(result.message);
    setLabel(""); setDirectory("");
    if (reuseFolder) return;
    // Share before sign-in so the login runs in a folder that already has the setup. A failure here
    // must not stop sign-in; it is reported after, with the way to retry.
    const problems: string[] = [];
    if (shareSetup) {
      const shared = await window.api!.providerAccounts!.shareSetup({ providerId, id: result.profile.id, enabled: true })
        .catch(() => ({ ok: false as const, message: i18n.t("settingsConnections:providerAccountAddForm.couldNotUpdateTheSharedSetup") }));
      if (!shared.ok) problems.push(i18n.t("settingsConnections:providerAccountAddForm.addedButCouldNotShareYour", { value1: trimmedLabel, value2: shared.message }));
    }
    try {
      await props.login(result.profile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(i18n.t("settingsConnections:providerAccountAddForm.addedButItsSignInTerminal", { value1: trimmedLabel, value2: reason }));
    }
    if (problems.length) throw new Error(problems.join(" "));
  });
  return <div className={sx(styles.stack)}>
    <span className={sx(styles.subheading)}>{t("settingsConnections:providerAccountAddForm.addAnAccount")}</span>
    <div className={sx(styles.stackTight)}>
      <label htmlFor={nameId} className={sx(styles.label)}>{t("common:labels.name")}</label>
      <div className={sx(styles.row)}>
        <Input id={nameId} placeholder={t("settingsConnections:providerAccountAddForm.forExampleWorkOrPersonal")} value={label}
          onChange={e => setLabel(e.target.value)} xstyle={styles.field} />
        <Button size="sm" disabled={props.busy || !label.trim()} onClick={add}>
          {reuseFolder ? t("settingsConnections:providerAccountAddForm.addAccount") : t("settingsConnections:providerAccountAddForm.addAndSignIn")}
        </Button>
      </div>
    </div>
    {!reuseFolder && <Checkbox label={t(USE_SYSTEM_SETUP_LABEL_KEY)} description={describeProviderAccountSetup(providerId, null)}
      checked={shareSetup} onCheckedChange={checked => setShareSetup(checked === true)} />}
    <p className={sx(styles.muted)}>{t("settingsConnections:messages.accountLoginPersistence", { provider: name })}</p>
    <CollapsibleRoot open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <CollapsibleTrigger render={<Button size="sm" variant="quiet" flushInline />}>
        <ChevronRight aria-hidden className={sx(styles.advancedChevron, transition.transform, advancedOpen && styles.advancedChevronOpen)} />
        {t("settingsConnections:providerAccountAddForm.advancedReuseAFolderYouAlready")}</CollapsibleTrigger>
      <CollapsiblePanel className={sx(styles.advancedPanel)}>
        <div className={sx(styles.stackTight)}>
          <label htmlFor={folderId} className={sx(styles.label)}>{t("settingsConnections:messages.existingAccountFolder", { provider: name })}</label>
          <Input id={folderId} placeholder={t("settingsConnections:providerAccountAddForm.absoluteFolderPath")} value={directory}
            onChange={e => setDirectory(e.target.value)} />
          <p className={sx(styles.muted)}>{t("settingsConnections:messages.existingAccountFolderHelp", { env: FOLDER_ENV[providerId] })}</p>
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  </div>;
}
