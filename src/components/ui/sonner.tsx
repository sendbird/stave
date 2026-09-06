import { ToastHost } from "../ads/components/ToastHost";
import {
  notificationToastManager,
  workspaceToastManager,
} from "@/lib/notifications/toast";

function Toaster() {
  return (
    <>
      <ToastHost
        toastManager={notificationToastManager}
        position="top-center"
      />
      <ToastHost toastManager={workspaceToastManager} position="bottom-right" />
    </>
  );
}

export { Toaster };
export { toast } from "@/lib/notifications/toast";
