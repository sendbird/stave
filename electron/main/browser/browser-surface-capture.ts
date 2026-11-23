import type { NativeImage, WebContents } from "electron";

/** Copy the current guest surface without asking CDP to force a new one. */
export async function captureLensSurface(guest: WebContents): Promise<NativeImage> {
  let onDestroyed!: () => void;
  const destroyed = new Promise<never>((_, reject) => {
    onDestroyed = () => reject(new Error("The Lens guest closed during capture."));
  });
  guest.once("destroyed", onDestroyed);
  try {
    // Only destruction can stand in for native completion. Navigation,
    // presentation and caller deadlines leave a living guest in the lane.
    const image = await Promise.race([
      destroyed,
      guest.capturePage(undefined, { stayHidden: true, stayAwake: true }),
    ]);
    if (image.isEmpty()) throw new Error("Lens screenshot returned no image.");
    return image;
  } finally {
    guest.off("destroyed", onDestroyed);
  }
}
