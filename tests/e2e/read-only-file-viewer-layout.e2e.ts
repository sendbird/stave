import { expect, test } from "@playwright/test";
import { createViewerPdf } from "../fixtures/viewer-pdf";

const modules = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  theme: "/src/components/aui/components/ThemeProvider.tsx",
  i18n: "/src/i18n/index.ts",
  pdf: "/src/components/panes/surfaces/PdfFileViewer.tsx",
  log: "/src/components/panes/surfaces/LogFileViewer.tsx",
};

for (const locale of ["en", "ko"] as const) {
  for (const appearance of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`read-only file view containment in ${locale}/${appearance}/${density}`, async ({ page }) => {
        await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
        await page.evaluate(async ({ modules, pdf, locale, appearance, density }) => {
          const { default: React } = await import(modules.react);
          const { default: { createRoot } } = await import(modules.client);
          const { ThemeProvider } = await import(modules.theme);
          const { applyAppLocale } = await import(modules.i18n);
          const { default: PdfFileViewer } = await import(modules.pdf);
          const { LogFileViewer } = await import(modules.log);
          const encoder = new TextEncoder();
          const reader = (text: string) => {
            const file = encoder.encode(text);
            return async ({ offset, length }: { offset: number; length: number }) =>
              ({ ok: true, revision: "fixture", size: file.length, bytes: file.slice(offset, offset + length) });
          };
          const host = document.createElement("div");
          host.id = "file-viewer-layout";
          host.style.cssText = "position: fixed; top: 0; left: 0; z-index: 10000;";
          document.body.append(host);
          applyAppLocale(locale);
          createRoot(host).render(React.createElement(ThemeProvider, { theme: appearance, density },
            React.createElement("div", { style: { height: 360 } },
              React.createElement(PdfFileViewer, { reader: reader(pdf) })),
            React.createElement("div", { style: { height: 290 } },
              React.createElement(LogFileViewer, {
                reader: reader("line with a long unbroken value " + "x".repeat(500) + "\n"),
                lineTarget: null,
                onLineTargetHandled: () => {},
              })),
          ));
          await document.fonts.ready;
        }, { modules, pdf: createViewerPdf(2), locale, appearance, density });

        const host = page.locator("#file-viewer-layout");
        await expect(host.getByRole("button", { name: locale === "en" ? "Fit width" : "너비 맞춤" })).toBeVisible();
        await expect(host.getByRole("searchbox", { name: locale === "en" ? "Find in file" : "파일에서 찾기" })).toBeVisible();
        const pdfViewport = host.getByTestId("pdf-file-viewer").getByRole("region");
        const logViewport = host.getByTestId("log-file-viewer").getByRole("region");

        for (const width of [340, 920]) {
          await host.evaluate((element, width) => { element.style.width = `${width}px`; }, width);
          // Width is a fractional CSS pixel after scaling. Allow rounding to
          // one device-independent pixel across the page and its two insets.
          await expect.poll(() => pdfViewport.evaluate((region) => {
            const paper = region.querySelector<HTMLElement>('[data-testid="pdf-page"]');
            if (!paper) return Infinity;
            const edge = region.getBoundingClientRect();
            const page = paper.getBoundingClientRect();
            const padding = getComputedStyle(paper.parentElement!);
            const left = parseFloat(padding.paddingLeft);
            const right = parseFloat(padding.paddingRight);
            return Math.max(
              Math.abs(page.left - edge.left - left),
              Math.abs(region.clientWidth - page.width - left - right),
              region.scrollWidth - region.clientWidth,
            );
          })).toBeLessThanOrEqual(1);
          await expect.poll(() => logViewport.evaluate((region) => region.scrollWidth - region.clientWidth)).toBe(0);
          await expect.poll(() => host.getByTestId("file-viewer-toolbar").evaluateAll((toolbars) =>
            Math.max(...toolbars.map((toolbar) => toolbar.scrollWidth - toolbar.clientWidth)),
          )).toBe(0);
        }

        const colors = await pdfViewport.evaluate((region) => ({
          canvas: getComputedStyle(region).backgroundColor,
          chrome: getComputedStyle(region.parentElement!).backgroundColor,
        }));
        expect(colors.canvas).not.toBe(colors.chrome);
      });
    }
  }
}
