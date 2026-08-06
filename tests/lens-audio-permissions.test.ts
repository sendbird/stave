import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Session, WebContents } from "electron";
import {
  enableLensPageAudioOutput,
  installLensAudioPermissionHandlers,
  shouldGrantLensPermissionCheck,
  shouldGrantLensPermissionRequest,
} from "../electron/main/browser/browser-media-permissions";

describe("Lens audio permission policy", () => {
  test("grants microphone and speaker selection only to an owned Lens page", () => {
    expect(
      shouldGrantLensPermissionRequest({
        isOwnedLensPage: true,
        permission: "media",
        mediaTypes: ["audio"],
      }),
    ).toBe(true);
    expect(
      shouldGrantLensPermissionRequest({
        isOwnedLensPage: true,
        permission: "speaker-selection",
      }),
    ).toBe(true);

    for (const request of [
      {
        isOwnedLensPage: false,
        permission: "media",
        mediaTypes: ["audio"],
      },
      {
        isOwnedLensPage: true,
        permission: "media",
        mediaTypes: ["video"],
      },
      {
        isOwnedLensPage: true,
        permission: "media",
        mediaTypes: ["audio", "video"],
      },
      {
        isOwnedLensPage: true,
        permission: "media",
      },
      {
        isOwnedLensPage: true,
        permission: "notifications",
      },
    ]) {
      expect(shouldGrantLensPermissionRequest(request)).toBe(false);
    }
  });

  test("allows owned audio preflight checks while rejecting explicit video", () => {
    for (const mediaType of ["audio", "unknown", undefined]) {
      expect(
        shouldGrantLensPermissionCheck({
          isOwnedLensPage: true,
          permission: "media",
          mediaType,
        }),
      ).toBe(true);
    }

    for (const check of [
      {
        isOwnedLensPage: false,
        permission: "media",
        mediaType: "audio",
      },
      {
        isOwnedLensPage: true,
        permission: "media",
        mediaType: "video",
      },
      {
        isOwnedLensPage: true,
        permission: "geolocation",
        mediaType: "audio",
      },
    ]) {
      expect(shouldGrantLensPermissionCheck(check)).toBe(false);
    }
  });

  test("unmutes the Lens page and installs request and check handlers", () => {
    let muted: boolean | undefined;
    enableLensPageAudioOutput({
      setAudioMuted(value) {
        muted = value;
      },
    });
    expect(muted).toBe(false);

    let requestHandler: Parameters<
      Session["setPermissionRequestHandler"]
    >[0] = null;
    let checkHandler: Parameters<Session["setPermissionCheckHandler"]>[0] =
      null;
    const session = {
      setPermissionRequestHandler(handler) {
        requestHandler = handler;
      },
      setPermissionCheckHandler(handler) {
        checkHandler = handler;
      },
    } as Pick<
      Session,
      "setPermissionCheckHandler" | "setPermissionRequestHandler"
    >;

    installLensAudioPermissionHandlers(
      session,
      (webContents) => webContents?.id === 7,
    );
    expect(requestHandler).not.toBeNull();
    expect(checkHandler).not.toBeNull();

    const ownedWebContents = { id: 7 } as WebContents;
    const popupWebContents = { id: 8 } as WebContents;
    let granted: boolean | undefined;
    requestHandler?.(
      ownedWebContents,
      "media",
      (value) => {
        granted = value;
      },
      {
        isMainFrame: true,
        requestingUrl: "https://voice.example.com",
        securityOrigin: "https://voice.example.com",
        mediaTypes: ["audio"],
      },
    );
    expect(granted).toBe(true);

    requestHandler?.(
      popupWebContents,
      "speaker-selection",
      (value) => {
        granted = value;
      },
      {
        isMainFrame: true,
        requestingUrl: "https://voice.example.com",
      },
    );
    expect(granted).toBe(false);

    expect(
      checkHandler?.(ownedWebContents, "media", "https://voice.example.com", {
        isMainFrame: true,
        mediaType: "audio",
        requestingUrl: "https://voice.example.com",
        securityOrigin: "https://voice.example.com",
      }),
    ).toBe(true);
    expect(
      checkHandler?.(null, "media", "https://frame.example.com", {
        isMainFrame: false,
        mediaType: "audio",
        embeddingOrigin: "https://voice.example.com",
        securityOrigin: "https://frame.example.com",
      }),
    ).toBe(false);
  });
});

describe("Lens microphone packaging", () => {
  const repoRoot = path.join(import.meta.dirname, "..");

  test("declares the macOS usage string and audio-input entitlements", () => {
    const config = readFileSync(
      path.join(repoRoot, "electron-builder.yml"),
      "utf8",
    );
    const mainEntitlements = readFileSync(
      path.join(repoRoot, "build", "entitlements.mac.plist"),
      "utf8",
    );
    const inheritedEntitlements = readFileSync(
      path.join(repoRoot, "build", "entitlements.mac.inherit.plist"),
      "utf8",
    );

    expect(config).toContain(
      "NSMicrophoneUsageDescription: Stave uses the microphone when a page in Lens requests audio input.",
    );
    expect(config).toContain("entitlements: build/entitlements.mac.plist");
    expect(config).toContain(
      "entitlementsInherit: build/entitlements.mac.inherit.plist",
    );
    expect(mainEntitlements).toContain(
      "<key>com.apple.security.device.audio-input</key>",
    );
    expect(inheritedEntitlements).toContain(
      "<key>com.apple.security.device.audio-input</key>",
    );
  });
});
