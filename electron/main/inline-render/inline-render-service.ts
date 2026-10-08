import path from "node:path";
import { app, protocol } from "electron";
import { INLINE_RENDER_SCHEME } from "../../../src/lib/inline-render/inline-render";
import { createInlineRenderStore, type InlineRenderStore } from "./inline-render-store";
import { respondToInlineRenderRequest } from "./inline-render-protocol";

let store: InlineRenderStore | null = null;

/** The app's render store under the user data directory. */
export function getInlineRenderStore(): InlineRenderStore {
  store ??= createInlineRenderStore({
    rootDir: () => path.join(app.getPath("userData"), "inline-renders"),
  });
  return store;
}

let installed = false;

/**
 * Serves inline render pages on the default session, which only the Stave
 * window uses. Lens guests run in their own partitions and never see the
 * scheme. Must run after the app is ready; idempotent.
 */
export function installInlineRenderProtocol() {
  if (installed) return;
  installed = true;
  protocol.handle(INLINE_RENDER_SCHEME, (request) =>
    respondToInlineRenderRequest({
      url: request.url,
      method: request.method,
      store: getInlineRenderStore(),
    }),
  );
}

/** Removes a workspace's pages; called when the workspace is archived. */
export async function removeWorkspaceInlineRenders(workspaceId: string) {
  try {
    await getInlineRenderStore().removeWorkspace(workspaceId);
  } catch (error) {
    console.warn("[inline-render] could not remove a workspace's renders", {
      error: String(error),
    });
  }
}
