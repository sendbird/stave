import { ToastHost } from "../ads/components/ToastHost";
import { toastManager } from "@/lib/notifications/toast";

/**
 * The app's one toast stack: bottom-right, three cards at most. Notifications,
 * workspace results and failures all land here, so no notice is split across
 * two corners and the top of the window stays clear for the Fleet band and
 * the tab strip.
 *
 * Chrome a toast must never sit on carries `data-toast-avoid` (the composer
 * frame, the status bar). The stack rises above a match only when the two
 * share a column.
 */
function Toaster() {
  return (
    <ToastHost
      toastManager={toastManager}
      position="bottom-right"
      avoid="[data-toast-avoid]"
    />
  );
}

export { Toaster };
export { toast } from "@/lib/notifications/toast";
