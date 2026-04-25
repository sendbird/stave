const BLOCKED_SCHEME_RE = /^(file|chrome|javascript|data|vbscript):/i;
const LOCAL_HTTP_HOST_RE =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
const HAS_PROTOCOL_RE = /^[a-z]+:\/\//i;

export function normalizeLensUrl(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) {
    return url;
  }

  if (BLOCKED_SCHEME_RE.test(url)) {
    throw new Error(`Blocked protocol: ${url}`);
  }

  if (HAS_PROTOCOL_RE.test(url)) {
    return url;
  }

  if (LOCAL_HTTP_HOST_RE.test(url)) {
    return `http://${url}`;
  }

  return `https://${url}`;
}
