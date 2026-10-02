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
import { USE_SYSTEM_SETUP_LABEL } from "./ProviderAccountSetupSharing";
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
        .catch(() => ({ ok: false as const, message: "Could not update the shared setup." }));
      if (!shared.ok) problems.push(`Added ${trimmedLabel}, but could not share your setup. ${shared.message} Turn it on from the account.`);
    }
    try {
      await props.login(result.profile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(`Added ${trimmedLabel}, but its sign-in terminal did not open. ${reason} Then select Sign in on the account.`);
    }
    if (problems.length) throw new Error(problems.join(" "));
  });
  return <div className={sx(styles.stack)}>
    <span className={sx(styles.subheading)}>Add an account</span>
    <div className={sx(styles.stackTight)}>
      <label htmlFor={nameId} className={sx(styles.label)}>Name</label>
      <div className={sx(styles.row)}>
        <Input id={nameId} placeholder="For example, Work or Personal" value={label}
          onChange={e => setLabel(e.target.value)} xstyle={styles.field} />
        <Button size="sm" disabled={props.busy || !label.trim()} onClick={add}>
          {reuseFolder ? "Add account" : "Add and sign in"}
        </Button>
      </div>
    </div>
    {!reuseFolder && <Checkbox label={USE_SYSTEM_SETUP_LABEL} description={describeProviderAccountSetup(providerId, null)}
      checked={shareSetup} onCheckedChange={checked => setShareSetup(checked === true)} />}
    <p className={sx(styles.muted)}>
      Sign in once per account: the sign-in is saved in the account's own folder, so it keeps working in every task and CLI tab, whichever {name} binary runs it. Removing an account only forgets it in Stave; its folder and sign-in stay on disk.
    </p>
    <CollapsibleRoot open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <CollapsibleTrigger render={<Button size="sm" variant="quiet" flushInline />}>
        <ChevronRight aria-hidden className={sx(styles.advancedChevron, transition.transform, advancedOpen && styles.advancedChevronOpen)} />
        Advanced: reuse a folder you already use
      </CollapsibleTrigger>
      <CollapsiblePanel className={sx(styles.advancedPanel)}>
        <div className={sx(styles.stackTight)}>
          <label htmlFor={folderId} className={sx(styles.label)}>Existing {name} folder</label>
          <Input id={folderId} placeholder="Absolute folder path" value={directory}
            onChange={e => setDirectory(e.target.value)} />
          <p className={sx(styles.muted)}>
            Point Stave at a folder you already signed in to, such as one you use with {FOLDER_ENV[providerId]}. Stave uses the sign-in saved there and never moves or deletes the folder. Leave this empty and Stave creates a new folder for the account.
          </p>
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  </div>;
}
