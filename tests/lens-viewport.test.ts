import { describe, expect, test } from "bun:test";
import {
  getLensViewportWidth,
  rememberLensViewportWidth,
} from "../electron/main/browser/browser-viewport-state";
import {
  resolveLensFixedGuestStyle,
  resolveLensGuestStyle,
} from "../src/lib/lens/lens-guest-placement";
import { LensViewportArgsSchema } from "../src/lib/lens/lens-viewport";

describe("Lens viewport width", () => {
  test("defaults to Fit and remembers widths by workspace and session until reset", () => {
    expect(getLensViewportWidth("workspace", "tab")).toBe("fit");
    rememberLensViewportWidth("workspace", "tab", 390);
    rememberLensViewportWidth("workspace", "other tab", 820);
    rememberLensViewportWidth("other workspace", "tab", 1280);
    expect(getLensViewportWidth("workspace", "tab")).toBe(390);
    expect(getLensViewportWidth("workspace", "other tab")).toBe(820);
    expect(getLensViewportWidth("other workspace", "tab")).toBe(1280);
    rememberLensViewportWidth("workspace", "tab", "fit");
    expect(getLensViewportWidth("workspace", "tab")).toBe("fit");
    expect(getLensViewportWidth("workspace", "other tab")).toBe(820);
  });

  test("scales a wide guest and centers a narrow guest within the pane", () => {
    const pane = resolveLensGuestStyle({
      rect: { x: 20, y: 40, width: 640, height: 500 },
      presented: true,
    });
    expect(resolveLensFixedGuestStyle(pane, 1280, 1)).toEqual({
      left: "20px",
      width: "1280px",
      transform: "scale(0.5)",
    });
    expect(resolveLensFixedGuestStyle(pane, 390, 1)).toEqual({
      left: "145px",
      width: "390px",
      transform: "",
    });
  });

  test("accounts for guest page zoom independently of presentation scale", () => {
    const pane = resolveLensGuestStyle({
      rect: { x: 0, y: 0, width: 800, height: 500 },
      presented: true,
    });
    expect(resolveLensFixedGuestStyle(pane, 1280, 1.25)).toEqual({
      left: "0px",
      width: "1600px",
      transform: "scale(0.5)",
    });
  });

  test("validates the MCP and IPC width presets without coercion", () => {
    for (const width of ["fit", 390, 820, 1280]) {
      expect(LensViewportArgsSchema.parse({ workspaceId: "workspace", width }).width).toBe(width);
    }
    for (const width of ["390", "Fit", 391, 0, -390, null, undefined, 390.5]) {
      expect(LensViewportArgsSchema.safeParse({ workspaceId: "workspace", width }).success).toBe(false);
    }
  });
});
