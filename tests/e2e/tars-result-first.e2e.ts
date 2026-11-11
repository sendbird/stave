import { expect, test } from "@playwright/test";

for (const width of [360, 800]) for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const density of ["regular", "compact"]) {
  test(`summary, outputs and details: ${width} ${lang} ${theme} ${density}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/tests/e2e/fixtures/tars-result-first.html?case=long&lang=${lang}&theme=${theme}&density=${density}`);
    await page.evaluate(() => document.fonts.ready);
    for (const surface of ["result", "report"]) {
      const root = page.locator(`[data-surface="${surface}"]`);
      await expect(root.locator('[data-tars-completion-summary]')).toBeVisible();
      await expect(root.locator('[data-tars-completion-outputs] a')).toBeVisible();
      await expect(root.locator('[data-tars-completion-warnings]')).toContainText(lang === 'ko' ? '실제 운영 데이터' : 'production data');
      await expect(root.locator('[data-tars-completion-warnings]')).toContainText(lang === 'ko' ? '미검증' : 'Unverified');
      await expect(root.locator('[data-tars-full-summary]').last()).toBeHidden();
      const trigger = root.locator('[data-tars-result-details] button');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(root.locator('[data-tars-full-summary]').last()).toBeVisible();
      await expect(root.locator('[data-tars-evidence-group]')).not.toHaveCount(0);
      // Actual descendants, including unbroken text, stay inside their owning surface.
      const geometry = await root.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const children = [...node.querySelectorAll<HTMLElement>('p, li, a, button')].filter((item) => item.getBoundingClientRect().height > 0);
        return { overflow: node.scrollWidth - node.clientWidth, escaped: children.filter((item) => {
          const rect = item.getBoundingClientRect(); return rect.left < box.left - 1 || rect.right > box.right + 1;
        }).map((item) => item.tagName) };
      });
      expect(geometry).toEqual({ overflow: 0, escaped: [] });
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
    const card = page.locator('[data-tars-result-card]');
    const padding = await card.evaluate((node) => ({ actual: getComputedStyle(node).paddingLeft, expected: parseFloat(getComputedStyle(node).getPropertyValue('--aui-space-16')) * parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    expect(Math.abs(parseFloat(padding.actual) - padding.expected)).toBeLessThanOrEqual(0.5);
  });
}

test('opens artifacts through the existing shell bridge and report through the existing callback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'api', { configurable: true, value: { shell: { openExternal: async ({ url }: { url: string }) => {
      document.documentElement.dataset.external = url; return { ok: true };
    } } } });
  });
  await page.goto('/tests/e2e/fixtures/tars-result-first.html');
  for (const surface of ['result', 'report']) {
    await page.locator(`[data-surface="${surface}"] [data-tars-completion-outputs] a`).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('html')).toHaveAttribute('data-external', 'https://example.com/invoice.csv');
    await page.evaluate(() => { delete document.documentElement.dataset.external; });
  }
  await page.locator('[data-surface="report"] [data-tars-output="changes"] button').click();
  await expect(page.locator('html')).toHaveAttribute('data-opened', 'changes');
  await page.locator('[data-tars-result-open="report"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-opened', 'report');
});

test('missing summary is explicit; unverified accepted completion is not disguised', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/tars-result-first.html?case=missing');
  await expect(page.locator('[data-tars-completion-summary]').first()).toContainText('No final summary');
  await page.goto('/tests/e2e/fixtures/tars-result-first.html?case=reported');
  await expect(page.locator('[data-tars-completion-warnings]').first()).toContainText('without a Stave-verified check');
});


for (const [lang, theme] of [['en', 'light'], ['ko', 'dark']]) test(`standalone absence statements do not warn or hide real limitations: ${lang} ${theme}`, async ({ page }) => {
  await page.goto(`/tests/e2e/fixtures/tars-result-first.html?case=none&lang=${lang}&theme=${theme}`);
  for (const surface of ['result', 'report']) {
    const root = page.locator(`[data-surface="${surface}"]`);
    await expect(root.locator('[data-tars-completion-summary]')).toHaveText('Completed regression checks.…');
    await expect(root.locator('[data-tars-completion-warnings]')).toHaveCount(0);
    await root.locator('[data-tars-result-details] button').click();
    await expect(root.locator('[data-tars-full-summary]').last()).toContainText('No known limitations.');
  }
  await page.goto(`/tests/e2e/fixtures/tars-result-first.html?case=none-with-caveat&lang=${lang}&theme=${theme}`);
  for (const surface of ['result', 'report']) {
    const warnings = page.locator(`[data-surface="${surface}"] [data-tars-completion-warnings]`);
    await expect(warnings).toContainText('Production deployment was skipped.');
    await expect(warnings).toContainText('Release remains pending.');
    await expect(warnings).not.toContainText('No known limitations.');
  }
});

test('earlier limitations are visible as historical notes and heading bodies lead', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/tars-result-first.html?case=history');
  for (const surface of ['result', 'report']) {
    const root = page.locator(`[data-surface="${surface}"]`);
    await expect(root.locator('[data-tars-completion-summary]')).toHaveText('Completed regression checks.…');
    await expect(root.locator('[data-tars-completion-warnings]')).toContainText('Production deployment was skipped.');
    await expect(root.locator('[data-tars-completion-warnings]')).toContainText('Release remains pending.');
    await expect(root.locator('[data-tars-completion-warnings]')).not.toContainText('Packaged Electron');
    await expect(root.locator('[data-tars-completion-earlier]')).toContainText('Earlier stage note · Work · may be superseded');
    await expect(root.locator('[data-tars-completion-earlier]')).toContainText('Packaged Electron was skipped.');
  }
});

for (const outcome of ['stopped', 'cancelled']) test(`${outcome} report explains the interruption before the summary`, async ({ page }) => {
  await page.goto(`/tests/e2e/fixtures/tars-result-first.html?case=${outcome}`);
  const root = page.locator('[data-surface="report"]');
  const reason = await root.locator('[data-tars-report-reason]').boundingBox();
  const summary = await root.locator('[data-tars-completion-summary]').boundingBox();
  expect(reason!.y + reason!.height).toBeLessThanOrEqual(summary!.y);
});

test('no criteria count for an empty set; pending report has no empty overview section', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/tars-result-first.html?case=zero');
  await expect(page.locator('[data-tars-completion-count]')).toHaveCount(0);
  await page.goto('/tests/e2e/fixtures/tars-result-first.html?case=pending');
  await expect(page.locator('[data-surface="report"] [data-tars-report-unmet]')).toHaveCount(0);
});

for (const size of [16, 20]) test(`Result uses chat scale and Report keeps panel fonts at message size ${size}`, async ({ page }) => {
  await page.goto(`/tests/e2e/fixtures/tars-result-first.html?case=long&messageFontSize=${size}`);
  await page.evaluate(() => document.fonts.ready);
  for (const surface of ['result', 'report']) {
    const root = page.locator(`[data-surface="${surface}"]`);
    await root.locator('[data-tars-result-details] button').click();
    for (const selector of ['[data-tars-completion-summary]', '[data-tars-completion-count]', '[data-tars-completion-warnings]', '[data-tars-result-details] button', '[data-tars-full-summary]']) {
      const expected = surface === 'result' ? size === 20 ? 18 : 14 : selector.includes('summary') ? 14 : 13;
      expect(await root.locator(selector).first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBe(expected);
    }
  }
});
