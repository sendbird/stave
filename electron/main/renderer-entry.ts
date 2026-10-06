import path from "node:path";

/**
 * The packaged renderer is served from a privileged standard scheme instead of
 * `file://`. Chromium only persists V8 bytecode for http(s) and for custom
 * schemes registered with `codeCache`, so a `file://` renderer recompiles its
 * whole bundle on every launch. Serving the same files from this origin lets
 * the third and later launches start from cached bytecode.
 *
 * Keep the host stable: it is part of the origin, and the origin owns the
 * renderer's localStorage.
 */
export const RENDERER_SCHEME = "stave-app";
export const RENDERER_HOST = "renderer";
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;
export const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`;

export const RENDERER_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  codeCache: true,
} as const;

export type RendererEntryKind = "scheme" | "file";

/**
 * Map a renderer-scheme request to a file inside the renderer output directory.
 * Returns null for another scheme or host, an undecodable path, or anything
 * that would resolve outside the renderer directory.
 */
export function resolveRendererAssetPath(
  rendererRoot: string,
  requestUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${RENDERER_SCHEME}:` || url.host !== RENDERER_HOST) {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // No built asset contains a NUL or a backslash, and a backslash would be a
  // separator on Windows but a file name character elsewhere.
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return null;
  }
  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const root = path.resolve(rendererRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

/** Whether a navigation target is the app document this window loaded. */
export function isRendererAppUrl(args: {
  url: string;
  entryKind: RendererEntryKind;
  devServerOrigin: string | null;
}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(args.url);
  } catch {
    return false;
  }
  if (args.devServerOrigin) {
    return parsed.origin === args.devServerOrigin;
  }
  if (args.entryKind === "scheme") {
    return (
      parsed.protocol === `${RENDERER_SCHEME}:` &&
      parsed.host === RENDERER_HOST
    );
  }
  return parsed.protocol === "file:";
}
