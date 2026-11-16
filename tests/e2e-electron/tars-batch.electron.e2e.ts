import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("Tars batch contract crosses preload, main and host and rejects forged confirmation", async () => {
  const stave = await launchStave();
  try {
    await stave.page.waitForFunction(() => Boolean(window.api?.tars?.batch));
    const preview = await stave.page.evaluate(() => window.api.tars!.batch!({ operation: "preview", action: { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false } }));
    expect(preview).toMatchObject({ state: "proposed", items: [] });
    expect(await stave.page.evaluate(() => window.api.tars!.batches!())).toContainEqual(preview);
    const confirmed = await stave.page.evaluate(id => window.api.tars!.batch!({ operation: "confirm", id }), preview.id);
    expect(confirmed.state).toBe("applied");
    const refused = await stave.page.evaluate(async () => {
      try { await window.api.tars!.batch!({ operation: "confirm", id: "forged" }); return false; } catch { return true; }
    });
    expect(refused).toBe(true);
    await stave.page.reload();
    await stave.page.waitForFunction(() => Boolean(window.api?.tars?.batch));
    expect(await stave.page.evaluate(() => window.api.tars!.batches!())).toContainEqual(confirmed);
  } finally { await stave.close(); }
});
