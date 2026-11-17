import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

/**
 * Tars writes short status lines one per line. With one newline between them
 * they shared one pre-wrap paragraph and stacked at the bare line pitch, so a
 * new statement looked the same as a long line wrapping. Each line is now its
 * own paragraph with the message's paragraph spacing (the shared Markdown block-gap token), while
 * a line that wraps by itself, lists and separate messages keep their spacing.
 */
const KOREAN_LINES = [
  "다음: 확인창·Clear 개선, 이미지 중복 첨부 수정, Jira 출력 여백 수정의 세 작업으로 나눠 진행하겠습니다.",
  "다음: 확인창·Clear 개선은 검증 후 PR까지 진행하고, 나머지는 원인 재현과 수정 검증을 진행하겠습니다.",
  "확인 필요: 기존 작업 정리는 확인 카드 승인 후 적용되며, 정리 조건에 맞지 않는 작업은 남습니다.",
];
const ENGLISH_LINES = [
  "Next: split the remaining work into three tasks, then reproduce each issue before changing the implementation.",
  "Next: verify the first task and prepare its changes for review, then investigate the remaining two tasks.",
  "Needs you: approve the confirmation card. Work that does not match the cleanup conditions will remain available.",
];

function conversation(lines: readonly string[]) {
  const settings = { providerId: "codex", model: "gpt-5.5", maxTurns: 30 };
  let minute = 0;
  const message = (id: string, text: string, reply: string) => {
    const at = new Date(
      Date.parse("2026-11-05T00:00:00.000Z") + minute++ * 60_000,
    ).toISOString();
    return {
      id,
      requestId: `request-${id}`,
      text,
      ...settings,
      state: "answered",
      revision: 2,
      reply,
      decision: { reply, actions: [] },
      error: null,
      createdAt: at,
      updatedAt: at,
    };
  };
  return {
    settings: null,
    receipts: [],
    activity: [],
    records: [],
    messages: [
      message("lines", "Status, one line each", lines.join("\n")),
      message("paragraphs", "Status, blank lines", lines.join("\n\n")),
      message(
        "list",
        "Status with a list",
        `Split into three.\n\n- ${lines[0]}\n- ${lines[1]}\n- short item\n\n${lines[2]}`,
      ),
      message("next", "Next message", lines[0]!),
    ],
  };
}

async function open(
  page: Page,
  query: string,
  width: number,
  lines: readonly string[],
) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(
    (value) => sessionStorage.setItem("stave-preview-conversation", value),
    JSON.stringify(conversation(lines)),
  );
  await page.goto(`/?stavePreview=tars${query}`);
  await expect(
    page.locator('[data-tars-message="next"] [data-tars-reply]'),
  ).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Each block of a reply: tag, top, bottom and right edge, plus the reply's own box. */
const blocksOf = (page: Page, id: string) =>
  page
    .locator(`[data-tars-message="${id}"] [data-tars-reply]`)
    .evaluate((reply) => ({
      reply: reply.getBoundingClientRect().toJSON() as DOMRect,
      lineHeight: parseFloat(
        getComputedStyle(reply.querySelector("p")!).lineHeight,
      ),
      blocks: [...reply.querySelectorAll(":scope p, :scope li")].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          top: box.top,
          bottom: box.bottom,
          right: box.right,
          text: node.textContent ?? "",
        };
      }),
    }));

for (const locale of ["en", "ko"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const density of ["regular", "compact"] as const)
      for (const width of [390, 1280]) {
        const linesText = locale === "ko" ? KOREAN_LINES : ENGLISH_LINES;
        const query = `&lang=${locale}&theme=${theme}&density=${density}`;
        const name = `${locale} ${theme} ${density}`;
        test(`Tars status lines are spaced as paragraphs, wraps and lists keep their pitch: ${name} ${width}px`, async ({
          page,
        }) => {
          await open(page, query, width, linesText);
          const tokens = await page.evaluate(async () => {
            const { vars } =
              await import("/src/components/aui/tokens/tokens.stylex.ts");
            const { MARKDOWN_BLOCK_GAP } =
              await import("/src/components/ai-elements/message-markdown.styles.ts");
            const probe = document.createElement("div");
            probe.style.paddingTop = MARKDOWN_BLOCK_GAP;
            probe.style.paddingBottom = vars["--aui-space-4"];
            document.body.append(probe);
            const style = getComputedStyle(probe);
            const result = {
              paragraph: parseFloat(style.paddingTop),
              list: parseFloat(style.paddingBottom),
            };
            probe.remove();
            return result;
          });
          expect(tokens.paragraph).toBeGreaterThan(0);
          expect(
            await page
              .locator("html")
              .evaluate((node) => node.classList.contains("dark")),
          ).toBe(theme === "dark");
          await expect(page.locator("html")).toHaveAttribute(
            "data-ui-density",
            density,
          );
          const lines = await blocksOf(page, "lines");
          const paragraphs = await blocksOf(page, "paragraphs");

          // One paragraph per line, the same rhythm as blank-line paragraphs.
          expect(lines.blocks.map((block) => block.text)).toEqual(linesText);
          const gaps = lines.blocks
            .slice(1)
            .map((block, index) => block.top - lines.blocks[index]!.bottom);
          const paragraphGaps = paragraphs.blocks
            .slice(1)
            .map(
              (block, index) => block.top - paragraphs.blocks[index]!.bottom,
            );
          for (const gap of gaps) expect(gap).toBeCloseTo(tokens.paragraph, 0);
          expect(gaps).toEqual(paragraphGaps);

          // A line that wraps by itself keeps the bare line pitch: its height is whole lines, no gap inside.
          for (const block of lines.blocks) {
            const rows = (block.bottom - block.top) / lines.lineHeight;
            expect(Math.abs(rows - Math.round(rows))).toBeLessThan(0.05);
            expect(block.right).toBeLessThanOrEqual(lines.reply.right + 1);
          }
          if (width === 390)
            expect(
              lines.blocks.some(
                (block) => block.bottom - block.top > lines.lineHeight * 1.5,
              ),
            ).toBe(true);

          // List items keep their own spacing token, rather than paragraph spacing.
          const list = await blocksOf(page, "list");
          const items = list.blocks.filter((block) => block.tag === "LI");
          expect(items).toHaveLength(3);
          for (let index = 1; index < items.length; index++)
            expect(items[index]!.top - items[index - 1]!.bottom).toBeCloseTo(
              tokens.list,
              0,
            );

          // Separate messages stay further apart than paragraphs inside one, and nothing overflows the column.
          const nextBubble = await page
            .locator('[data-tars-message="next"] [data-tars-user-bubble]')
            .boundingBox();
          expect(nextBubble!.y - list.reply.bottom).toBeGreaterThan(
            tokens.paragraph * 2,
          );
          const view = page.getByTestId("tars-transcript");
          expect(
            await view.evaluate((node) => node.scrollWidth - node.clientWidth),
          ).toBeLessThanOrEqual(1);
        });
      }

// The task chat shares MessageResponse but keeps the default line-break mode.
for (const theme of ["light", "dark"] as const)
  for (const width of [390, 1280]) {
    test(`task chat keeps soft newlines inside one paragraph: ${theme} ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/?stavePreview=transcript-rows&theme=${theme}&width=${width}`,
      );
      await expect(page.locator('[data-message-id="a6"]')).toBeVisible();
      for (const providerId of [
        "claude-code",
        "codex",
        "cursor",
        "kiro",
        "opencode",
      ]) {
        await page.evaluate(
          async ({ providerId, content }) => {
            const { useAppStore } = await import("/src/store/app.store.ts");
            const state = useAppStore.getState();
            const taskId = state.activeTaskId!;
            const message = state.messagesByTask[taskId].find(
              (item) => item.role === "assistant",
            )!;
            useAppStore.setState({
              messagesByTask: {
                [taskId]: [
                  {
                    ...message,
                    id: "spacing-sibling",
                    providerId,
                    content,
                    parts: [{ type: "text", text: content }],
                    isStreaming: false,
                  },
                ],
              },
              messageCountByTask: { [taskId]: 1 },
            });
            await document.fonts.ready;
          },
          { providerId, content: KOREAN_LINES.join("\n") },
        );
        const response = page
          .locator('[data-message-id="spacing-sibling"] article p')
          .filter({ hasText: KOREAN_LINES[0]! });
        await expect(response).toHaveCount(1);
        await expect(response).toContainText(KOREAN_LINES.join("\n"));
        const geometry = await response.evaluate((node) => ({
          lines:
            node.getBoundingClientRect().height /
            parseFloat(getComputedStyle(node).lineHeight),
          overflow: node.scrollWidth - node.clientWidth,
        }));
        // Wrapping adds whole line boxes, with no paragraph margins between source lines.
        expect(
          Math.abs(geometry.lines - Math.round(geometry.lines)),
        ).toBeLessThan(0.05);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
      }
    });
  }
