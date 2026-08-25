import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  forgetAllLensSessionUrls,
  forgetLensSessionUrl,
  getLensSessionRecoveryUrl,
  isRestorableLensUrl,
  rememberLensSessionUrl,
  restoreLensSessionUrl,
} from "../electron/main/browser/browser-session-recovery";
import {
  getLensSecurityConfig,
  setLensSecurityConfig,
} from "../electron/main/browser/browser-security";

const WORKSPACE = "ws-1";
const SESSION = "default";

/**
 * A guest that records what it was asked to load.
 *
 * `loadURL` is where a restore either happens or does not, so the tests assert
 * on the calls rather than on a return value: a restore that reported a URL but
 * never issued the load would be exactly the bug worth catching.
 */
function fakeGuest(
  options: { destroyed?: boolean; reject?: boolean } = {},
): {
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
  loaded: string[];
} {
  const loaded: string[] = [];
  return {
    loaded,
    isDestroyed: () => options.destroyed === true,
    loadURL(url: string) {
      loaded.push(url);
      return options.reject
        ? Promise.reject(new Error("ERR_CONNECTION_REFUSED"))
        : Promise.resolve();
    },
  };
}

let originalSecurityConfig = getLensSecurityConfig();

beforeEach(() => {
  originalSecurityConfig = getLensSecurityConfig();
  forgetAllLensSessionUrls();
});

afterEach(() => {
  setLensSecurityConfig(originalSecurityConfig);
  forgetAllLensSessionUrls();
});

describe("restorable Lens URLs", () => {
  test("accepts the http(s) pages a session can actually be on", () => {
    expect(isRestorableLensUrl("https://example.com/app")).toBe(true);
    expect(isRestorableLensUrl("http://127.0.0.1:5173/")).toBe(true);
  });

  test("rejects everything that is not a page worth returning to", () => {
    // `about:blank` is the state being recovered *from*; the rest are either
    // refused on the way in or are artifacts of a failed load.
    for (const url of [
      "about:blank",
      "",
      "   ",
      "data:text/html,<h1>hi</h1>",
      "file:///etc/passwd",
      "chrome-error://chromewebdata/",
      "javascript:alert(1)",
      "not a url",
      null,
      undefined,
      42,
    ]) {
      expect(isRestorableLensUrl(url)).toBe(false);
    }
  });
});

describe("remembering where a Lens session was", () => {
  test("keeps the last page per session, isolated by key", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/one");
    rememberLensSessionUrl(WORKSPACE, "other", "https://example.com/two");
    rememberLensSessionUrl("ws-2", SESSION, "https://example.com/three");

    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/four");

    expect(getLensSessionRecoveryUrl(WORKSPACE, SESSION)).toBe(
      "https://example.com/four",
    );
    expect(getLensSessionRecoveryUrl(WORKSPACE, "other")).toBe(
      "https://example.com/two",
    );
    expect(getLensSessionRecoveryUrl("ws-2", SESSION)).toBe(
      "https://example.com/three",
    );
    expect(getLensSessionRecoveryUrl("ws-3", SESSION)).toBeNull();
  });

  test("a non-page URL does not erase the page before it", () => {
    // A guest that dies mid-load, or one navigated to `about:blank` on the way
    // out, must not cost the user the page they were actually on.
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/app");
    rememberLensSessionUrl(WORKSPACE, SESSION, "about:blank");
    rememberLensSessionUrl(WORKSPACE, SESSION, "");

    expect(getLensSessionRecoveryUrl(WORKSPACE, SESSION)).toBe(
      "https://example.com/app",
    );
  });

  test("forgetting a session drops only that session", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/one");
    rememberLensSessionUrl(WORKSPACE, "other", "https://example.com/two");

    forgetLensSessionUrl(WORKSPACE, SESSION);

    expect(getLensSessionRecoveryUrl(WORKSPACE, SESSION)).toBeNull();
    expect(getLensSessionRecoveryUrl(WORKSPACE, "other")).toBe(
      "https://example.com/two",
    );
  });

  test("evicts the least recently navigated session past the cap", () => {
    // 64 entries, so the 65th must push one out — and the one it pushes out is
    // the one nothing has touched, not the one that happens to be oldest by
    // first navigation.
    for (let index = 0; index < 64; index += 1) {
      rememberLensSessionUrl(WORKSPACE, `s-${index}`, `https://e.test/${index}`);
    }
    // Touch the first entry so recency, not insertion, decides.
    rememberLensSessionUrl(WORKSPACE, "s-0", "https://e.test/0-again");

    rememberLensSessionUrl(WORKSPACE, "s-64", "https://e.test/64");

    expect(getLensSessionRecoveryUrl(WORKSPACE, "s-0")).toBe(
      "https://e.test/0-again",
    );
    expect(getLensSessionRecoveryUrl(WORKSPACE, "s-1")).toBeNull();
    expect(getLensSessionRecoveryUrl(WORKSPACE, "s-64")).toBe(
      "https://e.test/64",
    );
  });
});

describe("restoring a rebuilt guest", () => {
  test("loads the page the session was on", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/app");
    const guest = fakeGuest();

    const restored = restoreLensSessionUrl({
      workspaceId: WORKSPACE,
      lensSessionId: SESSION,
      webContents: guest,
    });

    expect(restored).toBe("https://example.com/app");
    expect(guest.loaded).toEqual(["https://example.com/app"]);
  });

  test("keeps the record, so a second death restores too", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/app");
    const first = fakeGuest();
    const second = fakeGuest();

    restoreLensSessionUrl({
      workspaceId: WORKSPACE,
      lensSessionId: SESSION,
      webContents: first,
    });
    restoreLensSessionUrl({
      workspaceId: WORKSPACE,
      lensSessionId: SESSION,
      webContents: second,
    });

    expect(second.loaded).toEqual(["https://example.com/app"]);
  });

  test("does nothing for a session with no remembered page", () => {
    const guest = fakeGuest();

    expect(
      restoreLensSessionUrl({
        workspaceId: WORKSPACE,
        lensSessionId: SESSION,
        webContents: guest,
      }),
    ).toBeNull();
    expect(guest.loaded).toEqual([]);
  });

  test("does not load into a guest that is already gone", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/app");
    const guest = fakeGuest({ destroyed: true });

    expect(
      restoreLensSessionUrl({
        workspaceId: WORKSPACE,
        lensSessionId: SESSION,
        webContents: guest,
      }),
    ).toBeNull();
    expect(guest.loaded).toEqual([]);
  });

  test("re-checks site access, so a remembered URL cannot outlive the setting", () => {
    // The whole point of a remembered URL is that it is replayed later, which
    // means it can be replayed after the host was blocked in Settings. If the
    // restore trusted the earlier navigation it would be a way around the
    // block that the address bar does not have.
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://blocked.test/app");
    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: ["blocked.test"],
      developerModeCdp: false,
      cdpApprovedHosts: [],
    });
    const guest = fakeGuest();

    expect(
      restoreLensSessionUrl({
        workspaceId: WORKSPACE,
        lensSessionId: SESSION,
        webContents: guest,
      }),
    ).toBeNull();
    expect(guest.loaded).toEqual([]);
  });

  test("refuses a host outside an allowlist introduced since", () => {
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://elsewhere.test/app");
    setLensSecurityConfig({
      allowedHosts: ["intranet.test"],
      blockedHosts: [],
      developerModeCdp: false,
      cdpApprovedHosts: [],
    });
    const guest = fakeGuest();

    expect(
      restoreLensSessionUrl({
        workspaceId: WORKSPACE,
        lensSessionId: SESSION,
        webContents: guest,
      }),
    ).toBeNull();
    expect(guest.loaded).toEqual([]);
  });

  test("a failed restore load stays inside the restore", async () => {
    // The caller is `ensureBrowserSessionGuest`, which must resolve as soon as
    // the guest exists. An unhandled rejection here would take down a session
    // open because a page was unreachable.
    rememberLensSessionUrl(WORKSPACE, SESSION, "https://example.com/app");
    const guest = fakeGuest({ reject: true });

    expect(
      restoreLensSessionUrl({
        workspaceId: WORKSPACE,
        lensSessionId: SESSION,
        webContents: guest,
      }),
    ).toBe("https://example.com/app");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(guest.loaded).toEqual(["https://example.com/app"]);
  });
});
