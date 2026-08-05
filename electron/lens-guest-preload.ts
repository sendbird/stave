import { webFrame } from "electron";
import { getLensConsoleGuardScript } from "../src/lib/lens/lens-console-guard";

// Preloads run before page scripts. Execute in world 0 so the page's own
// console calls are bounded before Electron constructs native console events.
void webFrame
  .executeJavaScriptInIsolatedWorld(0, [{ code: getLensConsoleGuardScript() }])
  .catch(() => undefined);
