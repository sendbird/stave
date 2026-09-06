import type { MouseEventHandler, ReactNode } from "react";
import { createToastManager } from "@/components/ads/headless/toast";

export const notificationToastManager = createToastManager();
export const workspaceToastManager = createToastManager();

type NoticeOptions = {
  id?: string;
  position?: "top-center" | "bottom-right";
  description?: ReactNode;
  duration?: number;
  action?: { label: ReactNode; onClick: MouseEventHandler<HTMLButtonElement> };
};

function notice(type: string) {
  return (title: ReactNode, options: NoticeOptions = {}) => {
    const id = options.id ?? crypto.randomUUID();
    const manager =
      options.position === "bottom-right"
        ? workspaceToastManager
        : notificationToastManager;
    return manager.add({
      id,
      title,
      type,
      description: options.description,
      timeout: options.duration,
      priority: type === "danger" ? "high" : "low",
      actionProps: options.action
        ? {
            children: options.action.label,
            onClick: (event) => {
              options.action?.onClick(event);
              if (!event.defaultPrevented) manager.close(id);
            },
          }
        : undefined,
    });
  };
}

export const toast = Object.assign(notice("neutral"), {
  message: notice("neutral"),
  success: notice("success"),
  warning: notice("warning"),
  error: notice("danger"),
  info: notice("info"),
  dismiss: (id?: string) => {
    notificationToastManager.close(id);
    workspaceToastManager.close(id);
  },
});
