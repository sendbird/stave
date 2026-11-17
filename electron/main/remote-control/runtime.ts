import { z } from "zod";
import type { RemoteControlStore } from "../../persistence/remote-control-store";
import {
  RemoteAdminResultSchema,
  RemoteAdminSchema,
  type RemoteAdminResult,
  type RemoteInterface,
} from "../../../src/lib/remote-control";
import { RemoteRendererBridge, type RemoteRendererTarget } from "./renderer-bridge";
import { RemoteConfigError, RemoteControlServer, RemotePairingUnavailableError } from "./server";

type RemoteStorePort = Pick<RemoteControlStore, "load" | "replace" | "loadConfig" | "saveConfig">;

export interface RemoteControlRuntimeArgs {
  store: RemoteStorePort;
  getTarget: () => RemoteRendererTarget | null;
  asset: (path: string) => Promise<{ body: Uint8Array; type: string } | null>;
  rendererTimeoutMs?: number;
  now?: () => number;
  interfaces?: () => RemoteInterface[];
}

/**
 * The production adapters around the HTTP boundary, without Electron: the
 * SQLite store for devices, audit and configuration, and the renderer bridge
 * for snapshots and answers. `service.ts` supplies the window and the copy.
 */
export function createRemoteControlRuntime(args: RemoteControlRuntimeArgs) {
  const bridge = new RemoteRendererBridge(args.getTarget, args.rendererTimeoutMs);
  const server = new RemoteControlServer(
    {
      snapshot: () => bridge.snapshot(),
      act: (action) => bridge.act(action),
      save: async (state) => args.store.replace(state),
      // The audit entry is already stored by `save`; nothing else listens yet.
      record: async () => undefined,
      asset: args.asset,
      ...(args.now ? { now: args.now } : {}),
      ...(args.interfaces ? { interfaces: args.interfaces } : {}),
    },
    args.store.load(),
  );

  const ok = (extra: Partial<Extract<RemoteAdminResult, { ok: true }>> = {}) =>
    RemoteAdminResultSchema.parse({ ok: true, status: server.status(), ...extra });
  const fail = (error: Extract<RemoteAdminResult, { ok: false }>["error"]) =>
    RemoteAdminResultSchema.parse({ ok: false, error, status: server.status() });

  return {
    server,
    bridge,

    /** Start the saved configuration, if it is on. A failure leaves it off with the reason in status. */
    async restore() {
      const config = args.store.loadConfig();
      if (!config.enabled) return;
      try {
        await server.configure(config);
      } catch (error) {
        server.markStartFailed(
          config,
          error instanceof RemoteConfigError && error.code === "bind-failed" ? "bind-failed" : "address-unavailable",
        );
      }
    },

    async admin(raw: unknown): Promise<RemoteAdminResult> {
      const parsed = RemoteAdminSchema.safeParse(raw);
      if (!parsed.success) return fail("invalid-request");
      const request = parsed.data;
      try {
        switch (request.kind) {
          case "status":
            return ok();
          case "configure":
            try {
              await server.configure(request.config);
              args.store.saveConfig(request.config);
              return ok();
            } catch (error) {
              if (error instanceof RemoteConfigError) {
                // A port already in use keeps the choice so the switch and the error agree.
                if (error.code === "bind-failed") args.store.saveConfig(request.config);
                return fail(error.code);
              }
              if (error instanceof z.ZodError) return fail("invalid-request");
              throw error;
            }
          case "pair":
            try {
              return ok({ pairing: server.pairing() });
            } catch (error) {
              if (error instanceof RemotePairingUnavailableError) return fail("pairing-unavailable");
              throw error;
            }
          case "revoke":
            await server.revoke(request.id);
            return ok();
        }
      } catch {
        return fail("failed");
      }
    },

    close() {
      return server.close();
    },
  };
}

export type RemoteControlRuntime = ReturnType<typeof createRemoteControlRuntime>;
