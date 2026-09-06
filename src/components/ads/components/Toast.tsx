import { useState } from "react";
import type * as React from "react";

import type { ToastProviderProps } from "../headless/toast";
import { Button } from "./Button";
import {
  ToastHost,
  useToast,
  type ToastPosition,
  type ToastTone,
} from "./ToastHost";

export type ToastProps = Omit<ToastProviderProps, "children"> & {
  actionLabel?: React.ReactNode;
  description?: React.ReactNode;
  onAction?: React.MouseEventHandler<HTMLButtonElement>;
  /** Where the toast viewport is anchored. @default "bottom-right" */
  position?: ToastPosition;
  priority?: "high" | "low";
  title?: React.ReactNode;
  tone?: ToastTone;
  trigger?: React.ReactNode;
};

/**
 * Demo-shaped notification toast: a `ToastHost` plus a trigger button that
 * pushes the configured toast via `useToast()`. Use it to preview toast
 * anatomy (tones, positions, actions, the persistent `loading` tone). For
 * app code, mount `ToastHost` once at the app root and push toasts
 * imperatively with `useToast()` instead.
 */
export function Toast({
  actionLabel,
  description = "Dataset catalog is now in sync.",
  limit = 3,
  onAction,
  position = "bottom-right",
  priority = "low",
  timeout = 5000,
  title = "Records updated",
  tone = "success",
  trigger = "Show toast",
}: ToastProps) {
  return (
    <ToastHost limit={limit} position={position} timeout={timeout}>
      <ToastButton
        actionLabel={actionLabel}
        description={description}
        onAction={onAction}
        priority={priority}
        title={title}
        tone={tone}
        trigger={trigger}
      />
    </ToastHost>
  );
}

type ToastButtonProps = Required<
  Pick<ToastProps, "description" | "priority" | "title" | "tone" | "trigger">
> &
  Pick<ToastProps, "actionLabel" | "onAction">;

function ToastButton({
  actionLabel,
  description,
  onAction,
  priority,
  title,
  tone,
  trigger,
}: ToastButtonProps) {
  const toast = useToast();
  const [count, setCount] = useState(0);

  function createToast() {
    const nextCount = count + 1;

    setCount(nextCount);
    toast.push({
      ...(actionLabel && onAction ? { actionLabel, onAction } : null),
      description,
      id: `ui-toast-${nextCount}`,
      priority,
      title,
      tone,
    });
  }

  return (
    <Button onClick={createToast} size="sm" variant="secondary">
      {trigger}
    </Button>
  );
}
