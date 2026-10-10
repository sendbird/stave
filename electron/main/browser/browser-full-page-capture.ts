import { nativeImage } from "electron";
import { sendCdpCommandIfAttached } from "./browser-cdp-controller";
import {
  assertLensScreenshotPng,
  assertLensScreenshotRect,
} from "./browser-screenshot-guard";

type Command = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;
type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

/** Capture actual viewport frames; oversized guest surfaces can repeat a tile. */
export async function captureFullPage(
  id: number,
  command: Command,
  assertDocument: () => void,
): Promise<string> {
  const tree = (await command("Page.getFrameTree")) as {
    frameTree: { frame: { id: string } };
  };
  const world = (await command("Page.createIsolatedWorld", {
    frameId: tree.frameTree.frame.id,
    worldName: "stave-capture",
  })) as { executionContextId: number };
  let objectId: string | undefined;
  const invoke = async <T>(
    functionDeclaration: string,
    args: unknown[] = [],
  ): Promise<T> => {
    const result = (await command("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: unknown };
    if (result.exceptionDetails || result.result?.value === undefined)
      throw new Error(
        "Lens page changed while assembling its full-page screenshot.",
      );
    return result.result.value;
  };
  try {
    const prepared = (await command("Runtime.evaluate", {
      contextId: world.executionContextId,
      expression: `(() => {
        const start = { x: scrollX, y: scrollY };
        const root = document.documentElement;
        const properties = ["scroll-behavior", "scroll-snap-type", "overflow-anchor"];
        const values = properties.map(p => [p, root.style.getPropertyValue(p), root.style.getPropertyPriority(p)]);
        const geometry = () => ({ x: scrollX, y: scrollY, width: root.scrollWidth, height: root.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight });
        return {
          geometry,
          prepare() {
            root.style.setProperty("scroll-behavior", "auto", "important");
            root.style.setProperty("scroll-snap-type", "none", "important");
            root.style.setProperty("overflow-anchor", "none", "important");
            return geometry();
          },
          async move(x, y) {
            scrollTo({ left: x, top: y, behavior: "instant" });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return geometry();
          },
          restore() {
            scrollTo({ left: start.x, top: start.y, behavior: "instant" });
            for (const [p, value, priority] of values) {
              if (value) root.style.setProperty(p, value, priority); else root.style.removeProperty(p);
            }
            return true;
          }
        };
      })()`,
      returnByValue: false,
    })) as { result?: { objectId?: string }; exceptionDetails?: unknown };
    objectId = prepared.result?.objectId;
    if (prepared.exceptionDetails || !objectId)
      throw new Error("Lens could not prepare the full-page screenshot.");
    const initial = await invoke<Geometry>(
      "function() { return this.prepare(); }",
    );
    const width = Math.ceil(initial.width),
      height = Math.ceil(initial.height);
    assertLensScreenshotRect({ x: 0, y: 0, width, height }, "full-page");
    const tileWidth = Math.floor(initial.viewportWidth),
      tileHeight = Math.floor(initial.viewportHeight);
    assertLensScreenshotRect(
      { x: 0, y: 0, width: tileWidth, height: tileHeight },
      "viewport",
    );
    if (Math.ceil(width / tileWidth) * Math.ceil(height / tileHeight) > 64)
      throw new Error(
        "Lens full-page screenshot needs too many frames; capture a smaller area.",
      );
    const pixels = Buffer.alloc(width * height * 4);
    for (let top = 0; top < height; top += tileHeight) {
      for (let left = 0; left < width; left += tileWidth) {
        const at = await invoke<Geometry>(
          "function(x, y) { return this.move(x, y); }",
          [left, top],
        );
        const stable = (g: Geometry) =>
          g.width === initial.width &&
          g.height === initial.height &&
          g.viewportWidth === initial.viewportWidth &&
          g.viewportHeight === initial.viewportHeight;
        if (!stable(at))
          throw new Error(
            "Lens page resized during full-page capture; retry after it settles.",
          );
        const result = (await command("Page.captureScreenshot", {
          format: "png",
        })) as { data: string };
        const after = await invoke<Geometry>(
          "function() { return this.geometry(); }",
        );
        if (!stable(after) || at.x !== after.x || at.y !== after.y)
          throw new Error(
            "Lens page moved during full-page capture; retry after it settles.",
          );
        const png = Buffer.from(result.data, "base64");
        assertLensScreenshotPng(png);
        const image = nativeImage.createFromBuffer(png);
        if (image.isEmpty())
          throw new Error("Lens screenshot returned no image.");
        // Compose in CSS pixels; page zoom and device scale are encoded in the
        // actual viewport bitmap, rather than inferred from the host display.
        const bitmap = image
          .resize({ width: tileWidth, height: tileHeight, quality: "best" })
          .toBitmap();
        const sourceX = Math.round(left - at.x),
          sourceY = Math.round(top - at.y);
        const copyWidth = Math.min(tileWidth, width - left),
          copyHeight = Math.min(tileHeight, height - top);
        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX + copyWidth > tileWidth ||
          sourceY + copyHeight > tileHeight
        )
          throw new Error(
            "Lens page could not scroll to the requested capture area.",
          );
        for (let row = 0; row < copyHeight; row++) {
          const source = ((sourceY + row) * tileWidth + sourceX) * 4;
          bitmap.copy(
            pixels,
            ((top + row) * width + left) * 4,
            source,
            source + copyWidth * 4,
          );
        }
      }
    }
    return `data:image/png;base64,${nativeImage.createFromBitmap(pixels, { width, height, scaleFactor: 1 }).toPNG().toString("base64")}`;
  } finally {
    if (objectId) {
      try {
        assertDocument();
        await sendCdpCommandIfAttached(id, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: "function() { return this.restore(); }",
          returnByValue: true,
        });
      } finally {
        await sendCdpCommandIfAttached(id, "Runtime.releaseObject", {
          objectId,
        }).catch(() => undefined);
      }
    }
  }
}
