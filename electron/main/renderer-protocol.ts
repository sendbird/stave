import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import {
  RENDERER_SCHEME,
  RENDERER_SCHEME_PRIVILEGES,
  resolveRendererAssetPath,
} from "./renderer-entry";
// temporary-migration: renderer-origin-storage
import { serveRendererMigrationPage } from "./renderer-origin-migration-electron";

/** Must run before the app is ready; Chromium reads scheme privileges at startup. */
export function registerRendererScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: RENDERER_SCHEME, privileges: RENDERER_SCHEME_PRIVILEGES },
  ]);
}

let installedRendererRoot: string | null = null;

/** Serve the built renderer directory from the renderer scheme. Idempotent. */
export function installRendererProtocol(rendererRoot: string) {
  if (installedRendererRoot !== null) return;
  installedRendererRoot = rendererRoot;
  protocol.handle(RENDERER_SCHEME, (request) => {
    // temporary-migration: renderer-origin-storage
    const migrationPage = serveRendererMigrationPage(request.url);
    if (migrationPage) return migrationPage;
    // end temporary-migration: renderer-origin-storage
    const filePath = resolveRendererAssetPath(rendererRoot, request.url);
    if (!filePath) {
      return new Response(null, { status: 404 });
    }
    // `net.fetch` keeps asar support and file MIME types for the packaged app.
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
