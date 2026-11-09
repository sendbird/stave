import { ToastHost } from "../aui/components/ToastHost";
import { toastManager, workspaceToastManager } from "@/lib/notifications/toast";

/** General notifications stay above the task; workspace status clears its controls. */
function Toaster() {
  return (
    <>
      <ToastHost toastManager={toastManager} position="top-center" />
      <ToastHost
        toastManager={workspaceToastManager}
        position="bottom-end"
        avoid="[data-toast-avoid]"
      />
    </>
  );
}

export { Toaster };
export { toast } from "@/lib/notifications/toast";
