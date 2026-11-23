import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { navigateLensGuest } from "../electron/main/browser/browser-navigation-result";

const TARGET = "http://localhost:5733/?stavePreview=composer-frame";

class Guest extends EventEmitter {
  loadURL(url: string) {
    this.emit("did-start-navigation", {}, url, false, true);
    return Promise.resolve();
  }

  getTitle() {
    return "Lens fixture";
  }

  get contents() {
    return this as unknown as WebContents;
  }
}

test("an early blank load does not complete navigation and redirects return their committed URL", async () => {
  const guest = new Guest();
  const result = navigateLensGuest(guest.contents, TARGET);
  guest.emit("did-navigate", {}, "about:blank");
  guest.emit("did-navigate-in-page", {}, TARGET, false);
  let settled = false;
  void result.then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);

  const redirected = "http://localhost:5733/preview";
  guest.emit("did-navigate", {}, redirected);
  await expect(result).resolves.toEqual({
    ok: true,
    url: redirected,
    title: "Lens fixture",
  });
  expect(guest.eventNames()).toEqual([]);
});

test("a requested fragment can commit in the same main-frame document", async () => {
  const guest = new Guest();
  const target = `${TARGET}#section`;
  const result = navigateLensGuest(guest.contents, target);
  guest.emit("did-navigate-in-page", {}, target, true);
  await expect(result).resolves.toMatchObject({ ok: true, url: target });
});

test("an unrelated main-frame navigation supersedes the request", async () => {
  const guest = new Guest();
  const result = navigateLensGuest(guest.contents, TARGET);
  guest.emit("did-start-navigation", {}, "http://localhost:5733/other", false, true);
  await expect(result).rejects.toThrow("superseded");
  expect(guest.eventNames()).toEqual([]);
});

test("navigation without a commit times out and removes its listeners", async () => {
  const guest = new Guest();
  await expect(navigateLensGuest(guest.contents, TARGET, 10)).rejects.toThrow("timed out");
  expect(guest.eventNames()).toEqual([]);
});
