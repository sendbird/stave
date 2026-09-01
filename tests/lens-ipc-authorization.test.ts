import { describe, expect, it, test } from "bun:test";
import { isTrustedLensRenderer } from "../electron/main/ipc/lens-ipc-authorization";

function renderer(overrides?: {
  id?: number;
  destroyed?: boolean;
  processId?: number;
  routingId?: number;
}) {
  return {
    id: overrides?.id ?? 10,
    isDestroyed: () => overrides?.destroyed ?? false,
    mainFrame: {
      processId: overrides?.processId ?? 20,
      routingId: overrides?.routingId ?? 30,
    },
  };
}

describe("Lens annotation IPC authorization", () => {
  it("accepts only the current renderer main frame", () => {
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer(),
      ),
    ).toBe(true);
  });

  it("rejects a subframe, another renderer, and a destroyed renderer", () => {
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 31 },
        },
        renderer(),
      ),
    ).toBe(false);
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 11 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer(),
      ),
    ).toBe(false);
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer({ destroyed: true }),
      ),
    ).toBe(false);
  });
});

describe("Lens IPC registration", () => {
  /*
   * A static assertion, because the failure mode is silence.
   *
   * The sender check used to be written inside each handler, and it was present
   * in eleven of forty-four — the missing ones including `lens:evaluate`
   * (arbitrary JavaScript in any Lens session), `lens:close-session`,
   * `lens:clear-session-data`, and the saved-account channels. Nothing failed;
   * the guard simply was not there. Registration now goes through a wrapper that
   * cannot be forgotten, and this is what keeps it that way when the next
   * channel is added.
   */
  test("every Lens invoke channel is registered through the authorized wrapper", async () => {
    const source = await Bun.file(
      new URL("../electron/main/ipc/browser.ts", import.meta.url),
    ).text();

    const registrations = [
      ...source.matchAll(/ipcMain\.handle\(\s*\n?\s*"([^"]+)"/g),
    ].map((match) => match[1]);
    expect(registrations).toEqual([]);

    const guarded = [...source.matchAll(/handleLens\(\s*\n?\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(guarded.length).toBeGreaterThan(40);
    expect(guarded.filter((channel) => !channel.startsWith("lens:"))).toEqual(
      [],
    );

    // The two one-way channels cannot use the wrapper (`ipcMain.on` has no
    // reply), so they carry the check inline and must keep carrying it.
    const oneWay = [...source.matchAll(/ipcMain\.on\(\s*\n?\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    for (const channel of oneWay) {
      const body = source.slice(
        source.indexOf(`"${channel}"`),
        source.indexOf(`"${channel}"`) + 900,
      );
      expect(body).toContain("isTrustedLensRenderer");
    }
  });
});
