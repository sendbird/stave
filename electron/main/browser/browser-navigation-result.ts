import type { WebContents } from "electron";

const NAVIGATE_TIMEOUT_MS = 30_000;

/** A guest's initial about:blank load can resolve loadURL before our commit. */
export async function navigateLensGuest(
  guest: WebContents,
  target: string,
  timeoutMs = NAVIGATE_TIMEOUT_MS,
): Promise<{ ok: true; url: string; title: string }> {
  const requestedUrl = new URL(target).href;
  let started = false;
  let committed = false;
  let resolveCommit!: (url: string) => void;
  let rejectCommit!: (error: Error) => void;
  const commit = new Promise<string>((resolve, reject) => {
    resolveCommit = resolve;
    rejectCommit = reject;
  });
  const onStart = (
    _event: Electron.Event,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => {
    if (!isMainFrame || committed) return;
    if (started && !isInPlace) {
      rejectCommit(new Error("Lens navigation was superseded by another load."));
      return;
    }
    if (url === requestedUrl) started = true;
  };
  const onCommit = (_event: Electron.Event, url: string) => {
    if (!started || (url === "about:blank" && url !== requestedUrl)) return;
    committed = true;
    resolveCommit(url);
  };
  const onInPage = (event: Electron.Event, url: string, isMainFrame: boolean) => {
    if (isMainFrame && url === requestedUrl) onCommit(event, url);
  };
  const onDestroyed = () => {
    rejectCommit(new Error("Lens guest closed during navigation."));
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Lens navigation timed out after ${timeoutMs / 1000}s waiting for the requested page.`));
    }, timeoutMs);
  });
  guest.on("did-start-navigation", onStart);
  guest.on("did-navigate", onCommit);
  guest.on("did-navigate-in-page", onInPage);
  guest.once("destroyed", onDestroyed);
  try {
    const [url] = await Promise.race([
      Promise.all([commit, guest.loadURL(requestedUrl)]),
      deadline,
    ]);
    return { ok: true, url, title: guest.getTitle() };
  } finally {
    clearTimeout(timer);
    guest.off("did-start-navigation", onStart);
    guest.off("did-navigate", onCommit);
    guest.off("did-navigate-in-page", onInPage);
    guest.off("destroyed", onDestroyed);
  }
}
