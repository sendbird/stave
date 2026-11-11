import { expect, test, type Locator, type Page } from "@playwright/test";

type Frame = { height: number; opacity: number; inputBottom: number };

async function watchToggle(page: Page) {
  await page.evaluate(() => {
    const toggle = document.querySelector<HTMLElement>("[data-tars-running-toggle]")!;
    const panel = toggle.nextElementSibling as HTMLElement;
    const content = panel.firstElementChild!;
    const input = toggle.closest("[data-tars-composer]")!.querySelector("form")!;
    const frames: Frame[] = [];
    const initialExpanded = toggle.getAttribute("aria-expanded");
    const read = () => frames.push({ height: panel.getBoundingClientRect().height,
      opacity: Number(getComputedStyle(content).opacity), inputBottom: input.getBoundingClientRect().bottom });
    const duration = parseFloat(getComputedStyle(panel).transitionDuration) * 1000;
    const pending = new Promise<Frame[]>((resolve) => {
      const observer = new MutationObserver(() => {
        if (toggle.getAttribute("aria-expanded") === initialExpanded) return;
        observer.disconnect();
        const start = performance.now();
        const tick = () => {
          read();
          if (performance.now() - start < duration + 160) requestAnimationFrame(tick);
          else resolve(frames);
        };
        tick();
      });
      observer.observe(toggle, { attributes: true, attributeFilter: ["aria-expanded"] });
    });
    Object.assign(window, { runningMotionFrames: pending });
  });
}

function frames(page: Page) {
  return page.evaluate(() => (window as unknown as { runningMotionFrames: Promise<Frame[]> }).runningMotionFrames);
}

function expectIntermediate(samples: Frame[], openHeight: number) {
  // An instantaneous toggle cannot pass: a real painted frame must lie between the endpoints.
  expect(samples.some((f) => f.height > 1 && f.height < openHeight - 1), JSON.stringify(samples)).toBe(true);
  expect(samples.some((f) => f.opacity > 0.01 && f.opacity < 0.99)).toBe(true);
  const bottoms = samples.map((f) => f.inputBottom);
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
}

async function settled(panel: Locator) {
  await panel.evaluate(async (node) => {
    await Promise.all(node.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
}

for (const state of [
  { lang: "en", theme: "light", density: "regular", width: 1440 },
  { lang: "en", theme: "dark", density: "compact", width: 390 },
  { lang: "ko", theme: "light", density: "compact", width: 1440 },
  { lang: "ko", theme: "dark", density: "regular", width: 390 },
]) {
  test(`running disclosure animates both ways without moving the input: ${JSON.stringify(state)}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: state.width, height: 900 });
    await page.goto(`/?stavePreview=tars&tray=true&live=true&lang=${state.lang}&theme=${state.theme}&density=${state.density}`);
    const toggle = page.locator("[data-tars-running-toggle]");
    const panel = toggle.locator("xpath=following-sibling::*[1]");
    await expect(toggle).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Initial theme changes temporarily replace every transition with color-only feedback.
    await expect(page.locator(".atelier-theme-transition, html.theme-changing")).toHaveCount(0);
    await watchToggle(page);
    await toggle.click();
    const opening = await frames(page);
    await settled(panel);
    const height = (await panel.boundingBox())!.height;
    expect(height).toBeGreaterThan(1);
    expectIntermediate(opening, height);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await watchToggle(page);
    await toggle.click();
    expectIntermediate(await frames(page), height);
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Reverse in mid-flight with keyboard input: native CSS transitions retarget instead of replaying a keyframe.
    await toggle.focus();
    await toggle.press("Enter");
    await expect.poll(() => panel.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(1);
    await toggle.press("Space");
    await toggle.press("Enter");
    await settled(panel);
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(height, 0);
    await expect(toggle).toBeFocused();
    await toggle.press("Space");
    await expect(panel).toBeHidden();
  });
}

test("running disclosure respects reduced motion and keeps live progress mounted while folded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?stavePreview=tars&tray=true&live=stale&lang=ko&theme=dark");
  const toggle = page.locator("[data-tars-running-toggle]");
  const panel = toggle.locator("xpath=following-sibling::*[1]");
  await expect(toggle.locator("[data-tars-running-stale]")).toBeVisible();
  await expect(page.locator(".atelier-theme-transition, html.theme-changing")).toHaveCount(0);
  await expect(panel.locator("[data-tars-running]")).toHaveCount(1);
  const motion = await panel.evaluate((node) => ({
    heightDuration: getComputedStyle(node).transitionDuration,
    innerDurations: getComputedStyle(node.firstElementChild!).transitionDuration.split(",").map(parseFloat),
  }));
  // The app's reduced-motion reset uses 0.01ms to retain transition-end events, with no visible travel.
  expect(parseFloat(motion.heightDuration)).toBeLessThanOrEqual(0.001);
  expect(motion.innerDurations[0]).toBeLessThanOrEqual(0.001);
  expect(motion.innerDurations.every((value) => value <= 0.08)).toBe(true);
  await toggle.focus();
  await watchToggle(page);
  await toggle.press("Enter");
  await expect(panel).toBeVisible();
  const opening = await frames(page);
  const height = (await panel.boundingBox())!.height;
  expect(opening.every((frame) => frame.height <= 1 || Math.abs(frame.height - height) <= 1)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(panel.locator("[data-tars-running-timeline]")).toBeFocused();
  await toggle.focus();
  await toggle.press("Space");
  await expect(panel).toBeHidden();
  await expect(toggle.locator("[data-tars-running-stale]")).toBeVisible();
});
