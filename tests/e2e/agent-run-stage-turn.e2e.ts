import { expect, test } from "@playwright/test";

const fixture = "/tests/e2e/fixtures/agent-run-stage-turn.html";

for (const theme of ["light", "dark"])
  test(`a run turn Stave wrote draws no copy or time, in ${theme} theme`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?theme=${theme}`, {
      waitUntil: "domcontentloaded",
    });
    const row = (id: string) => page.locator(`[data-message-id="${id}"]`);
    const copy = { name: "Copy", exact: true };
    const details = { name: "Message details", exact: true };

    // The first stage carries the person's words: their bubble keeps copy and time.
    await expect(row("user-first-stage").getByRole("button", copy)).toHaveCount(
      1,
    );
    await expect(
      row("user-first-stage").getByRole("button", details),
    ).toHaveCount(1);

    // A later stage's card and the reminder to report are Stave's: neither action.
    const stage = row("user-later-stage");
    await expect(stage.getByTestId("agent-run-stage-card")).toBeVisible();
    await expect(stage.getByRole("button", copy)).toHaveCount(0);
    await expect(stage.getByRole("button", details)).toHaveCount(0);
    const followUp = row("user-follow-up");
    await expect(
      followUp.getByRole("button", { name: "Stave's follow-up to the agent" }),
    ).toBeVisible();
    await expect(followUp.getByRole("button", copy)).toHaveCount(0);
    await expect(followUp.getByRole("button", details)).toHaveCount(0);

    // With no action row, the full-prompt row closes the stage turn: no empty line below it.
    const promptTrigger = stage.getByRole("button", {
      name: "Full prompt sent to the agent",
    });
    const [rowBox, triggerBox] = await Promise.all([
      stage.boundingBox(),
      promptTrigger.boundingBox(),
    ]);
    expect(rowBox && triggerBox).toBeTruthy();
    expect(
      rowBox!.y + rowBox!.height - (triggerBox!.y + triggerBox!.height),
    ).toBeLessThanOrEqual(1);
  });
