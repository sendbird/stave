import { BookOpen } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { openExternalUrl } from "@/lib/external-links";
import { accountStyles as styles } from "./provider-accounts.styles";

/** Opens a section of the accounts guide in the browser; the text names where it goes. */
export function AccountsGuideButton({ url, children }: { url: string; children: string }) {
  return <Button type="button" size="xs" variant="link" flushInline onClick={() => { void openExternalUrl({ url }); }}>
    <BookOpen aria-hidden className={sx(styles.guideIcon)} />{children}
  </Button>;
}
