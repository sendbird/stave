import { expect, test, type Page } from "@playwright/test";

/**
 * Settings > Integrations > Remote control against a fake remote-control
 * bridge. The fake keeps the same rules main enforces for what the section
 * sends: a network address needs `confirmNetwork`, pairing needs a running
 * listener.
 */
function seed(page: Page, themeMode: "light" | "dark") {
  return page.addInitScript((mode) => {
    if (!localStorage.getItem("stave-store")) {
      localStorage.setItem("stave-store", JSON.stringify({ state: { settings: { language: "en", themeMode: mode } }, version: 0 }));
    }
    const now = Date.now();
    const state = {
      enabled: false,
      configured: false,
      address: "127.0.0.1",
      port: 6500,
      startError: null as string | null,
      pairingLocked: false,
      interfaces: [{ name: "en0", address: "192.168.1.20", family: "IPv4" }],
      devices: [
        { id: "22222222-2222-4222-8222-222222222222", name: "Test phone", createdAt: now - 86_400_000, lastSeen: now - 60_000 },
        { id: "33333333-3333-4333-8333-333333333333", name: "Test tablet", createdAt: now - 3_600_000, lastSeen: now - 3_600_000 },
      ],
      audit: [
        {
          id: "44444444-4444-4444-8444-444444444444", deviceId: "22222222-2222-4222-8222-222222222222", deviceName: "Test phone", time: now - 120_000,
          action: { kind: "approval", workspaceId: "w", taskId: "t", turnId: "turn", requestId: "r", messageId: "m", approved: true },
          result: { ok: true, reason: "applied" },
        },
        {
          id: "55555555-5555-4555-8555-555555555555", deviceId: "22222222-2222-4222-8222-222222222222", deviceName: "Test phone", time: now - 60_000,
          action: { kind: "question", workspaceId: "w", taskId: "t", turnId: null, requestId: "q", messageId: "m" },
          result: { ok: false, reason: "expired" },
        },
      ],
    };
    const calls: unknown[] = [];
    (window as unknown as { __remoteCalls: unknown[] }).__remoteCalls = calls;
    const snapshot = () => JSON.parse(JSON.stringify(state));
    const api = (window as unknown as { api?: Record<string, unknown> }).api ?? {};
    (window as unknown as { api: Record<string, unknown> }).api = {
      ...api,
      remoteControl: {
        invoke: async (args: { kind: string; config?: { enabled: boolean; address: string; port: number; confirmNetwork?: boolean }; id?: string }) => {
          calls.push(args);
          if (args.kind === "configure" && args.config) {
            const loopback = args.config.address === "127.0.0.1" || args.config.address === "::1";
            if (!loopback && !args.config.confirmNetwork) return { ok: false, error: "invalid-address", status: snapshot() };
            state.configured = args.config.enabled;
            state.enabled = args.config.enabled;
            state.address = args.config.address;
            state.port = args.config.port;
          }
          if (args.kind === "pair") {
            if (!state.enabled) return { ok: false, error: "pairing-unavailable", status: snapshot() };
            const host = state.address.includes(":") ? `[${state.address}]` : state.address;
            const code = "0123456789abcdef0123456789abcdef";
            return { ok: true, status: snapshot(), pairing: { code, url: `http://${host}:${state.port}/#${code}`, expiresAt: Date.now() + 300_000 } };
          }
          if (args.kind === "revoke") {
            state.devices = args.id ? state.devices.filter((device) => device.id !== args.id) : [];
          }
          return { ok: true, status: snapshot() };
        },
        onRequest: () => () => undefined,
        respond: async () => ({ ok: true }),
        setResponderReady: async () => ({ ok: true }),
      },
    };
  }, themeMode);
}

for (const themeMode of ["light", "dark"] as const) {
  test(`Settings > Remote control turns on, confirms a network address, pairs and revokes (${themeMode})`, async ({ page }, testInfo) => {
    page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
    await seed(page, themeMode);
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("button", { name: "Integrations", exact: true }).click();
    await settings.getByRole("tab", { name: "Remote control", exact: true }).click();

    const toggle = settings.getByRole("switch", { name: "Allow remote control" });
    await expect(toggle).not.toBeChecked();
    await expect(settings.getByText("Use remote control only on a trusted private network or VPN. The connection is not encrypted.")).toBeVisible();
    await expect(settings.getByRole("button", { name: "Pair a device" })).toBeDisabled();
    await expect(settings.getByText("Turn on remote control to pair a device.")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`remote-control-off-${themeMode}.png`), fullPage: true });

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(settings.getByText("Listening at http://127.0.0.1:6500")).toBeVisible();

    // A network address waits for confirmation; cancel keeps loopback.
    const address = settings.getByRole("combobox", { name: "Address" });
    await address.click();
    await page.getByRole("option", { name: "en0 (192.168.1.20)" }).click();
    const confirm = page.getByRole("dialog", { name: "Allow devices on this network?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(settings.getByText("Listening at http://127.0.0.1:6500")).toBeVisible();
    await address.click();
    await page.getByRole("option", { name: "en0 (192.168.1.20)" }).click();
    await confirm.getByRole("button", { name: "Use this address" }).click();
    await expect(settings.getByText("Listening at http://192.168.1.20:6500")).toBeVisible();
    const configureCalls = await page.evaluate(() =>
      (window as unknown as { __remoteCalls: Array<{ kind: string; config?: { address: string; confirmNetwork: boolean } }> }).__remoteCalls
        .filter((call) => call.kind === "configure")
        .map((call) => call.config),
    );
    expect(configureCalls.map((config) => config?.address)).toEqual(["127.0.0.1", "192.168.1.20"]);
    expect(configureCalls.at(-1)?.confirmNetwork).toBe(true);

    await settings.getByRole("button", { name: "Pair a device" }).click();
    const pairing = settings.locator("[data-remote-pairing]");
    await expect(pairing).toContainText("http://192.168.1.20:6500/#0123456789abcdef0123456789abcdef");
    await expect(pairing).toContainText("0123456789abcdef0123456789abcdef");
    await expect(settings.getByRole("timer")).toHaveText(/^Expires in [45]:\d\d$/);
    await expect(settings.getByRole("button", { name: "Create a new code" })).toBeVisible();

    const devices = settings.getByRole("list", { name: "Paired devices" });
    await expect(devices.getByRole("listitem")).toHaveCount(2);
    const actions = settings.getByRole("list", { name: "Recent remote actions" });
    await expect(actions.getByRole("listitem").first()).toContainText("Test phone answered a question");
    await expect(actions.getByRole("listitem").first()).toContainText("Already answered");
    await expect(actions.getByRole("listitem").nth(1)).toContainText("Test phone approved a request once");
    await page.screenshot({ path: testInfo.outputPath(`remote-control-on-${themeMode}.png`), fullPage: true });

    await settings.getByRole("button", { name: "Revoke Test tablet" }).click();
    await expect(devices.getByRole("listitem")).toHaveCount(1);
    await settings.getByRole("button", { name: "Revoke all" }).click();
    const revokeAll = page.getByRole("dialog", { name: "Revoke every paired device?" });
    await revokeAll.getByRole("button", { name: "Revoke all" }).click();
    await expect(settings.getByText("No device is paired.")).toBeVisible();

    // No horizontal overflow in the section at this width.
    const overflow = await settings.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
