import { useMemo } from "react";
import { i18n } from "@/i18n";
import { toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { LensChromePageLinks } from "@/components/panes/surfaces/lens/LensChrome";

/**
 * Hand the page a Lens session shows to the rest of the desktop: its address
 * on the clipboard, or the page itself in the user's default browser.
 *
 * Main refuses any scheme other than http, https and mailto, so an address the
 * user typed cannot launch an arbitrary handler from here.
 */
export function useLensPageLinks(url: string): LensChromePageLinks {
  return useMemo(() => {
    const pageUrl = url && url !== "about:blank" ? url : null;
    return {
      copyAddress: () => {
        if (!pageUrl) return;
        void copyTextToClipboard(pageUrl).then(
          () => toast.success(i18n.t("lens:lensSurfacePanel.pageAddressCopied")),
          () => toast.error(i18n.t("lens:lensSurfacePanel.couldNotCopyPageAddress")),
        );
      },
      openInBrowser: () => {
        if (!pageUrl) return;
        void window.api?.shell?.openExternal?.({ url: pageUrl }).then((result) => {
          if (!result?.ok) {
            toast.error(i18n.t("lens:lensSurfacePanel.couldNotOpenInBrowser"), {
              description: result?.stderr,
            });
          }
        });
      },
    };
  }, [url]);
}
