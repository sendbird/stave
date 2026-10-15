import tls from "node:tls";

type TlsCertificateApi = Pick<typeof tls, "getCACertificates" | "setDefaultCACertificates">;

/**
 * Electron main runs Node, so its `fetch` and `https` trust only Node's
 * bundled Mozilla roots, not the OS trust store Chromium uses. Behind a
 * TLS-intercepting corporate proxy every main-process HTTPS call then fails
 * with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` while `curl`, the CLIs and the
 * renderer work: for example the Vercel AI Gateway model list and connection
 * check in Settings. The host-service child gets the same fix through
 * `--use-system-ca` (see `buildHostServiceSpawnArgs`).
 *
 * The OS store is added on top of the current defaults, so public CAs keep
 * working. Returns whether the trust list changed.
 */
export function trustSystemCertificateAuthorities(api: TlsCertificateApi = tls): boolean {
  try {
    const system = api.getCACertificates("system");
    if (system.length === 0) return false;
    const defaults = api.getCACertificates("default");
    const merged = [...new Set([...defaults, ...system])];
    if (merged.length === defaults.length) return false;
    api.setDefaultCACertificates(merged);
    return true;
  } catch {
    // An unreadable OS store must not stop the app from starting.
    return false;
  }
}
