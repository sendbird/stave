import { randomUUID } from "node:crypto";
import { webContents } from "electron";
import type { LensCapturePaintRequest } from "../../../src/lib/lens/lens.types";
import { getMainWindow } from "../window";
import { getSessionIdentityForWebContentsId } from "./browser-manager";

const pending = new Map<
  string,
  { rendererId: number; settle: (ok: boolean) => void }
>();

export function resolveLensCapturePaint(
  payload: unknown,
  rendererId: number,
): void {
  if (!payload || typeof payload !== "object") return;
  const result = payload as { requestId?: unknown; ok?: unknown };
  if (typeof result.requestId !== "string" || typeof result.ok !== "boolean")
    return;
  const request = pending.get(result.requestId);
  if (request?.rendererId === rendererId) request.settle(result.ok);
}

/** The caller owns this lease until native work settles, not its own timeout. */
export async function acquireLensCapturePaint(
  id: number,
  signal: AbortSignal,
): Promise<() => void> {
  const renderer = getMainWindow()?.webContents;
  const guest = webContents.fromId(id);
  const identity = getSessionIdentityForWebContentsId(id);
  if (
    !renderer ||
    renderer.isDestroyed() ||
    !guest ||
    guest.isDestroyed() ||
    !identity
  ) {
    throw new Error("No Lens host is available for screenshot preparation.");
  }
  if (signal.aborted) throw signal.reason;
  const payload: LensCapturePaintRequest = {
    ...identity,
    webContentsId: id,
    requestId: randomUUID(),
    active: true,
  };
  const throttled = guest.getBackgroundThrottling();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (!renderer.isDestroyed()) renderer.send("lens:capture-paint", { ...payload, active: false });
    } catch {
      // Renderer teardown already removes its guest elements and paint leases.
    }
    if (!guest.isDestroyed()) guest.setBackgroundThrottling(throttled);
  };
  try {
    guest.setBackgroundThrottling(false);
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        if (!pending.delete(payload.requestId)) return;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        guest.removeListener("destroyed", onDestroyed);
        renderer.removeListener("destroyed", onDestroyed);
        error ? reject(error) : resolve();
      };
      const onAbort = () =>
        finish(new Error("Lens screenshot preparation was cancelled."));
      const onDestroyed = () =>
        finish(new Error("Lens host closed during screenshot preparation."));
      const timer = setTimeout(
        () => finish(new Error("Lens screenshot paint preparation timed out.")),
        2000,
      );
      timer.unref?.();
      pending.set(payload.requestId, {
        rendererId: renderer.id,
        settle: (ok) =>
          finish(
            ok
              ? undefined
              : new Error("Lens guest could not prepare a screenshot."),
          ),
      });
      signal.addEventListener("abort", onAbort, { once: true });
      guest.once("destroyed", onDestroyed);
      renderer.once("destroyed", onDestroyed);
      try {
        renderer.send("lens:capture-paint", payload);
      } catch (error) {
        finish(error as Error);
      }
    });
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
