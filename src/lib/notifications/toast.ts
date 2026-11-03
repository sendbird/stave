import type { MouseEventHandler, ReactNode } from "react";
import { createToastManager } from "@/components/ads/headless/toast";
import {
  runToastPromise,
  type ToastPromiseOptions,
} from "@/components/ads/components/ToastHost.promise";
import type { ToastSecondaryAction } from "@/components/ads/components/ToastHost";

export const notificationToastManager = createToastManager();
export const workspaceToastManager = createToastManager();

type ToastManager = typeof notificationToastManager;

type NoticeOptions = {
  id?: string;
  position?: "top-center" | "bottom-right";
  description?: ReactNode;
  duration?: number;
  action?: { label: ReactNode; onClick: MouseEventHandler<HTMLButtonElement> };
  /**
   * A second, lesser action shown before `action` (for example "View changes"
   * beside "Undo"). It closes the toast too unless its handler calls
   * `event.preventDefault()`.
   */
  secondaryAction?: { label: ReactNode; onClick: MouseEventHandler<HTMLButtonElement> };
  /** Runs once the toast closes, whether dismissed, timed out or acted on. */
  onClose?: () => void;
};

/** A settled tone `update` can turn a toast into. */
type SettledKind = "neutral" | "success" | "warning" | "error" | "info";

type UpdateOptions = {
  title?: ReactNode;
  description?: ReactNode;
  /** A settled tone ends a loading toast and restarts its dismiss timer. */
  tone?: SettledKind;
  /** Overrides the timer; a settled tone otherwise gets the host default. */
  duration?: number;
};

/** The hosts' auto-dismiss delay, restored when a pinned loading toast settles. */
const DEFAULT_DURATION_MS = 5000;

const MANAGER_TYPE: Record<SettledKind, string> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  error: "danger",
  info: "info",
};

/** Which host shows each open toast, so `update` reaches the right stack. */
const managerById = new Map<string, ToastManager>();

function managerFor(position: NoticeOptions["position"]) {
  return position === "bottom-right" ? workspaceToastManager : notificationToastManager;
}

function notice(type: string) {
  return (title: ReactNode, options: NoticeOptions = {}) => {
    const id = options.id ?? crypto.randomUUID();
    const manager = managerFor(options.position);
    managerById.set(id, manager);
    return manager.add({
      id,
      title,
      type,
      description: options.description,
      // A loading toast stays until it is updated or dismissed: in-flight
      // work must not quietly disappear.
      timeout: type === "loading" ? 0 : options.duration,
      priority: type === "danger" ? "high" : "low",
      onClose: () => {
        managerById.delete(id);
        options.onClose?.();
      },
      actionProps: options.action
        ? {
            children: options.action.label,
            onClick: (event) => {
              options.action?.onClick(event);
              if (!event.defaultPrevented) manager.close(id);
            },
          }
        : undefined,
      data: options.secondaryAction
        ? {
            secondaryAction: {
              label: options.secondaryAction.label,
              onClick: (event: Parameters<MouseEventHandler<HTMLButtonElement>>[0]) => {
                options.secondaryAction?.onClick(event);
                if (!event.defaultPrevented) manager.close(id);
              },
            } satisfies ToastSecondaryAction,
          }
        : undefined,
    });
  };
}

/**
 * Rewrite an open toast in place: new words, a settled tone, a new timer. A
 * loading toast that settles this way becomes the result instead of a second
 * card stacked under it.
 */
function update(id: string, options: UpdateOptions) {
  const manager = managerById.get(id);
  const targets = manager ? [manager] : [notificationToastManager, workspaceToastManager];
  for (const target of targets) {
    target.update(id, {
      ...(options.title !== undefined ? { title: options.title } : null),
      ...(options.description !== undefined ? { description: options.description } : null),
      ...(options.tone !== undefined
        ? { type: MANAGER_TYPE[options.tone], priority: options.tone === "error" ? "high" : "low" }
        : null),
      ...(options.duration !== undefined
        ? { timeout: options.duration }
        : options.tone !== undefined
          ? { timeout: DEFAULT_DURATION_MS }
          : null),
    });
  }
}

const loading = notice("loading");

/**
 * Run an async action through one toast: a pinned loading toast that is
 * rewritten, on the same id, into success or error. It returns the promise's
 * own value and re-throws its rejection, so wrapping an existing `await`
 * changes nothing about the caller's control flow.
 */
function promise<Value>(
  work: Promise<Value>,
  messages: ToastPromiseOptions<Value>,
  options: Pick<NoticeOptions, "position" | "id"> = {},
): Promise<Value> {
  return runToastPromise(
    {
      loading: (title, description) => loading(title, { ...options, description }),
      update: (id, next) =>
        update(id, { title: next.title, tone: next.tone === "danger" ? "error" : next.tone }),
    },
    work,
    messages,
  );
}

export const toast = Object.assign(notice("neutral"), {
  message: notice("neutral"),
  success: notice("success"),
  warning: notice("warning"),
  error: notice("danger"),
  info: notice("info"),
  loading,
  update,
  promise,
  dismiss: (id?: string) => {
    notificationToastManager.close(id);
    workspaceToastManager.close(id);
  },
});
