import { i18n, useTranslation } from "@/i18n";
import { memo } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { openAccountsSettings } from "@/lib/providers/accounts-navigation";
import {
  describeProviderAccountBlocker,
  providerAccountBlockerActionLabel,
  type ProviderAccountBlocker,
} from "@/lib/providers/provider-account-blocker";
import { shelfStyles as styles } from "./composer-shelf.styles";

/**
 * The shelf line for a composer that cannot send with its provider's selected
 * account: one sentence and the one button that fixes it in Settings >
 * Accounts. The shelf draws no line while sending works.
 */
export const ShelfAccountNotice = memo(function ShelfAccountNotice(props: { blocker: ProviderAccountBlocker }) {
  useTranslation();
  const { blocker } = props;
  const Icon = blocker.kind === "key-unreadable" ? KeyRound : UserRound;
  const text = describeProviderAccountBlocker(blocker);
  return (
    <div
      className={sx(styles.line)}
      role="group"
      aria-label={i18n.t("composer:accountNotice.ariaLabel")}
      data-testid="composer-shelf-account"
      data-kind={blocker.kind}
    >
      <span className={sx(styles.mark)}>
        <Icon aria-hidden className={sx(styles.markIcon, styles.labelWaiting)} />
      </span>
      <p className={sx(styles.text)} title={text}>
        <span className={sx(styles.label, styles.labelWaiting)}>{text}</span>
      </p>
      <span className={sx(styles.actions)}>
        <Button variant="quiet" size="xs" onClick={() => openAccountsSettings(blocker.focus)} xstyle={styles.itemAccent}>
          {providerAccountBlockerActionLabel(blocker)}
        </Button>
      </span>
    </div>
  );
});
