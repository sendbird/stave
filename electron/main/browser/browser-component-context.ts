import { getLensElementContextScript } from "./browser-element-context";

/** Read page-owned development metadata without moving selection out of isolation. */
export function getLensComponentContextScript(selector: string): string {
  return `(() => {
    ${getLensElementContextScript()}
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    return staveReactContext(element, true);
  })()`;
}

export async function readLensComponentContext(
  target: Pick<Electron.WebContents, "executeJavaScript">,
  selector: string,
): Promise<{ debugSource?: unknown; componentNameChain?: unknown } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result: unknown = await Promise.race([
      target.executeJavaScript(getLensComponentContextScript(selector)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 500);
      }),
    ]);
    if (!result || typeof result !== "object") return null;
    const metadata = result as Record<string, unknown>;
    // The caller normalizes both fields as untrusted page evidence.
    return {
      debugSource: metadata.debugSource,
      componentNameChain: metadata.componentNameChain,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
