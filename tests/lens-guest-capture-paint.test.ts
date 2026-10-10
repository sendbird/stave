import { expect, mock, test } from "bun:test";
mock.module("../src/lib/ui-layers", () => ({
  UI_LAYER_VALUE: { lensSurface: 10 },
}));
class ElementStub extends EventTarget {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  isConnected = true;
  id = "";
  wc = 31;
  setAttribute() {}
  getWebContentsId() {
    return this.wc;
  }
  append() {}
  insertBefore() {}
  remove() {
    this.isConnected = false;
  }
}
const elements: ElementStub[] = [];
const savedDocument = globalThis.document;
const savedElement = globalThis.HTMLElement;
const savedDiv = globalThis.HTMLDivElement;
Object.assign(globalThis, {
  HTMLElement: ElementStub,
  HTMLDivElement: ElementStub,
  document: {
    getElementById: () => null,
    body: new ElementStub(),
    createElement: () => {
      const e = new ElementStub();
      elements.push(e);
      return e;
    },
  },
});
const host = await import("../src/lib/lens/lens-guest-host");

test("paint leases survive parking, reject stale releases and preserve geometry", async () => {
  const identity = { workspaceId: "w", lensSessionId: "s" };
  try {
    const attached = host.ensureLensGuest({ ...identity, partition: "test" });
    const guest = elements[0]!;
    guest.dispatchEvent(new Event("did-attach"));
    await attached;
    const release = host.claimLensGuestPresenter(identity);
    host.setLensGuestPlacement(identity, {
      presented: true,
      rect: { x: 100, y: 60, width: 700, height: 500 },
    });
    const request = {
      ...identity,
      webContentsId: 31,
      requestId: "old",
      active: true,
    };
    expect(host.setLensGuestCapturePaint(request)).toBe(true);
    host.parkLensGuestsOutsideWorkspace("other");
    expect(guest.style.opacity).toBe("1");
    expect(guest.style.filter).toBe("opacity(0)");
    expect(guest.style.pointerEvents).toBe("none");
    expect([
      guest.style.left,
      guest.style.top,
      guest.style.width,
      guest.style.height,
    ]).toEqual(["100px", "60px", "700px", "500px"]);
    host.setLensGuestCapturePaint({ ...request, requestId: "new" });
    host.setLensGuestCapturePaint({ ...request, active: false });
    expect(guest.style.filter).toBe("opacity(0)");
    expect(
      host.setLensGuestCapturePaint({
        ...request,
        webContentsId: 99,
        requestId: "new",
        active: false,
      }),
    ).toBe(false);
    host.setLensGuestPlacement(identity, { presented: true });
    expect(guest.style.opacity).toBe("1");
    expect(guest.style.filter).toBe("");
    release();
    expect(guest.style.filter).toBe("opacity(0)");
    host.resetLensGuestCapturePaint();
    expect(guest.style.opacity).toBe("0");
    expect(guest.style.filter).toBe("");
    host.releaseLensGuest(identity);
    expect(host.setLensGuestCapturePaint(request)).toBe(false);
  } finally {
    Object.assign(globalThis, {
      document: savedDocument,
      HTMLElement: savedElement,
      HTMLDivElement: savedDiv,
    });
  }
});
