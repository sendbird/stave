// Minimal Electron main for the real-guest harness.
//
// Deliberately not the Stave app: booting the product would drag workspace
// hydration and the host service into a test whose subject is the rendering
// primitive. What it does share with the product is the part under test — it
// installs the same `installLensWebviewAttachClamp` from
// `electron/main/browser/browser-webview-attach.ts`, bundled to ESM by the
// spec's setup, so a clamp change that breaks attachment fails here.
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clampModule = process.env.LENS_HARNESS_CLAMP_MODULE;
const guestPreloadPath =
  process.env.LENS_HARNESS_GUEST_PRELOAD ??
  path.join(here, "guest-preload.cjs");

const refusals = [];

async function createWindow() {
  const { installLensWebviewAttachClamp } = await import(clampModule);

  const window = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true,
    },
  });

  installLensWebviewAttachClamp({
    webContents: window.webContents,
    resolveGuestPreloadPath: () => guestPreloadPath,
    onRefused: (reason) => {
      refusals.push(reason);
    },
  });

  // Surfaced to the spec so a refusal can be asserted positively, rather than
  // inferred from a guest that failed to appear for some other reason.
  globalThis.__lensHarnessRefusals = refusals;

  await window.loadFile(path.join(here, "host.html"));
  return window;
}

app.whenReady().then(async () => {
  await createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
