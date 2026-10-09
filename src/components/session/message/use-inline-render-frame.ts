import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  clampInlineRenderHeight,
  parseInlineRenderFrameMessage,
} from "@/lib/inline-render/inline-render";
import {
  buildInlineRenderError,
  buildInlineRenderResult,
  canRequestInlineRenderMessage,
  deliverInlineRenderMessage,
  INLINE_RENDER_REQUEST_ERROR,
  type InlineRenderRequestId,
} from "@/lib/inline-render/inline-render-interaction";
import {
  inlineRenderFramePool,
  INLINE_RENDER_KEEP_MARGIN_PX,
  INLINE_RENDER_MOUNT_MARGIN_PX,
  resolveInlineRenderFrameNear,
} from "@/lib/inline-render/inline-render-frame-pool";
import { useAppStore } from "@/store/app.store";
import { inlineRenderContextRuntime } from "@/store/inline-render-context-runtime";

/**
 * Whether this block's frame may be mounted now, from the shared frame pool:
 * near the viewport and within the live cap, or pinned (expanded). Without
 * `IntersectionObserver` (server rendering) every frame is live.
 */
export function useInlineRenderFrameSlot(args: {
  slotRef: RefObject<HTMLElement | null>;
  scrollContainer: HTMLElement | null;
  pinned: boolean;
}) {
  const id = useId();
  const pool = inlineRenderFramePool;
  const observable = typeof IntersectionObserver === "function";
  useEffect(() => {
    pool.register(id);
    return () => pool.unregister(id);
  }, [id, pool]);
  useEffect(() => {
    pool.setPinned(id, args.pinned);
  }, [args.pinned, id, pool]);

  const { slotRef, scrollContainer } = args;
  useEffect(() => {
    if (!observable) {
      pool.setNear(id, true);
      return;
    }
    const element = slotRef.current;
    if (!element) return;
    let near = false;
    let inMountZone: boolean | undefined;
    let inKeepZone: boolean | undefined;
    const apply = () => {
      near = resolveInlineRenderFrameNear({ previous: near, inMountZone, inKeepZone });
      pool.setNear(id, near);
    };
    const root = scrollContainer ?? null;
    const mountObserver = new IntersectionObserver(
      (records) => {
        inMountZone = records[records.length - 1]?.isIntersecting;
        apply();
      },
      { root, rootMargin: `${INLINE_RENDER_MOUNT_MARGIN_PX}px 0px` },
    );
    const keepObserver = new IntersectionObserver(
      (records) => {
        inKeepZone = records[records.length - 1]?.isIntersecting;
        apply();
      },
      { root, rootMargin: `${INLINE_RENDER_KEEP_MARGIN_PX}px 0px` },
    );
    mountObserver.observe(element);
    keepObserver.observe(element);
    return () => {
      mountObserver.disconnect();
      keepObserver.disconnect();
    };
  }, [id, observable, pool, scrollContainer, slotRef]);

  const subscribe = useCallback((listener: () => void) => pool.subscribe(id, listener), [id, pool]);
  const live = useSyncExternalStore(
    subscribe,
    () => !observable || pool.isLive(id),
    () => true,
  );
  const waiting = useSyncExternalStore(
    subscribe,
    () => observable && pool.isWaiting(id),
    () => false,
  );
  const touch = useCallback(() => pool.touch(id), [id, pool]);
  return { live, waiting, touch };
}

/** Only one page may hold a confirm dialog open at a time, in any pane. */
let confirmInFlight = false;

export interface InlineRenderMessageRequest {
  id: InlineRenderRequestId;
  title: string;
  text: string;
}

/**
 * Answers what a page posts from its frame: its height, a link to open, a
 * scroll gesture, its model context, and a message to send. Messages from any
 * other window are ignored. A message needs the reader's recent action in this
 * frame, and is sent only after they confirm it (`messageRequest`, then
 * `confirmMessage` or `declineMessage`).
 */
export function useInlineRenderFrameBridge(args: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  renderId: string;
  taskId: string;
  title: string;
  onSize: (height: number) => void;
  onScrollIntent: (() => void) | undefined;
  onUse: () => void;
}) {
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });
  const [messageRequest, setMessageRequest] = useState<InlineRenderMessageRequest | null>(null);
  const pendingRef = useRef<{ request: InlineRenderMessageRequest; source: MessageEventSource } | null>(null);

  useEffect(() => {
    const reply = (source: MessageEventSource | null, message: unknown) => {
      // The frame has an opaque origin, so there is no origin to target.
      (source as Window | null)?.postMessage(message, "*");
    };
    const onMessage = (event: MessageEvent) => {
      const current = latest.current;
      const frame = current.frameRef.current;
      if (!frame || !event.source || event.source !== frame.contentWindow) return;
      const message = parseInlineRenderFrameMessage(event.data);
      if (!message) return;
      switch (message.kind) {
        case "size":
          current.onSize(clampInlineRenderHeight(message.height));
          return;
        case "scroll-intent":
          current.onScrollIntent?.();
          return;
        case "open-link": {
          // A page may only open a link the reader just clicked in this frame.
          const activation = navigator.userActivation;
          if (document.activeElement !== frame || (activation && !activation.isActive)) return;
          current.onUse();
          const openExternal = window.api?.shell?.openExternal;
          if (openExternal) {
            void openExternal({ url: message.url });
          } else {
            window.open(message.url, "_blank", "noopener,noreferrer");
          }
          return;
        }
        case "invalid-request":
          reply(
            event.source,
            buildInlineRenderError(message.id, INLINE_RENDER_REQUEST_ERROR.invalid, message.reason),
          );
          return;
        case "model-context":
          inlineRenderContextRuntime.update({
            renderId: current.renderId,
            taskId: current.taskId,
            title: current.title,
            context: message.context,
          });
          if (message.id !== null) reply(event.source, buildInlineRenderResult(message.id, {}));
          return;
        case "message": {
          if (
            !canRequestInlineRenderMessage({
              fromFrame: true,
              frameFocused: document.activeElement === frame,
              userActivationActive: navigator.userActivation?.isActive,
            })
          ) {
            reply(
              event.source,
              buildInlineRenderError(
                message.id,
                INLINE_RENDER_REQUEST_ERROR.noActivation,
                // i18n-ignore: protocol error for the page's script
                "sendMessage must be called from a click or key press in the page.",
              ),
            );
            return;
          }
          if (pendingRef.current || confirmInFlight) {
            reply(
              event.source,
              buildInlineRenderError(
                message.id,
                INLINE_RENDER_REQUEST_ERROR.busy,
                // i18n-ignore: protocol error for the page's script
                "Another message is waiting for the user's answer.",
              ),
            );
            return;
          }
          const request = { id: message.id, title: current.title, text: message.text };
          confirmInFlight = true;
          pendingRef.current = { request, source: event.source };
          current.onUse();
          setMessageRequest(request);
          return;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (pendingRef.current) {
        pendingRef.current = null;
        confirmInFlight = false;
      }
    };
  }, []);

  const settle = useCallback(async (confirmed: boolean) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    confirmInFlight = false;
    setMessageRequest(null);
    const source = pending.source as Window;
    if (!confirmed) {
      source.postMessage(
        buildInlineRenderError(
          pending.request.id,
          INLINE_RENDER_REQUEST_ERROR.declined,
          // i18n-ignore: protocol error for the page's script
          "The user did not send the message.",
        ),
        "*",
      );
      return;
    }
    let status: "queued" | "sent" | "blocked";
    try {
      status = await deliverInlineRenderMessage({
        sendUserMessage: (request) => useAppStore.getState().sendUserMessage(request),
        taskId: latest.current.taskId,
        text: pending.request.text,
      });
    } catch {
      status = "blocked";
    }
    source.postMessage(
      status === "blocked"
        ? buildInlineRenderError(
            pending.request.id,
            INLINE_RENDER_REQUEST_ERROR.unavailable,
            // i18n-ignore: protocol error for the page's script
            "The conversation could not take the message now.",
          )
        : buildInlineRenderResult(pending.request.id, { status }),
      "*",
    );
  }, []);

  const confirmMessage = useCallback(() => void settle(true), [settle]);
  const declineMessage = useCallback(() => void settle(false), [settle]);
  return { messageRequest, confirmMessage, declineMessage };
}
