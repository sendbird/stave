import { afterEach, describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { comparisonScript } from "@/lib/lens/lens-feedback-comparison";
import { normalizeLensAnnotationPayload } from "@/lib/lens/lens-annotation-schema";
import { formatNetworkEntryDetails } from "@/lib/lens/lens-log-format";
import type { BrowserNetworkEntry } from "@/lib/lens/lens.types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { COMMAND_PALETTE_GROUP_LABELS } from "@/components/layout/command-palette-registry";
import { QuotaTimeLeftClock } from "@/components/layout/QuotaTimeLeftClock";
import { windowDurationTitle } from "@/components/layout/status-bar-usage.utils";
import { describeUsageWindow, formatResetCountdown } from "@/components/layout/status-bar-usage-strip.utils";
import { buildStandaloneCliEmptyStateText } from "@/components/layout/standalone-cli/StandaloneCliPopover";
import { RIGHT_RAIL_PANEL_TITLES } from "@/lib/right-rail-panels";
import { formatBranchLabel } from "@/lib/source-control-branch-label";

afterEach(() => { applyAppLocale("en"); });

describe("surface display language", () => {
  test("browser-evaluated comparison errors follow the language without changing evidence", () => {
    const annotation = normalizeLensAnnotationPayload({
      createdAt: "2026-09-20T00:00:00Z", id: "target", kind: "element", pin: 1,
      selector: "#action", tagName: "button", rect: { x: 5, y: 5, width: 100, height: 40 },
      comment: 'Keep the "original" text',
    }, { documentId: "before", url: "https://example.com/page", title: "Page" });
    annotation.review.page.viewport = { width: 800, height: 600, devicePixelRatio: 1 };
    const compare = () => runInNewContext(comparisonScript(annotation), { innerWidth: 400, innerHeight: 600, devicePixelRatio: 1 });
    applyAppLocale("en");
    expect(compare().error).toBe("Match the original viewport (800 × 600) before comparing.");
    applyAppLocale("ko");
    expect(compare().error).toBe("비교하기 전에 원래 뷰포트(800 × 600)에 맞추세요.");
    expect(annotation.comment).toBe('Keep the "original" text');
  });

  test("network clipboard labels translate while request data stays unchanged", () => {
    const entry = {
      entryId: "entry", timestamp: "2026-10-05T00:00:00Z", method: "GET",
      url: "https://example.com/api", state: "completed", status: 200,
      fromCache: false, requestHeaders: { "X-Test": ["Original value"] },
    } as BrowserNetworkEntry;
    applyAppLocale("en");
    expect(formatNetworkEntryDetails(entry)).toContain("Request URL: https://example.com/api");
    applyAppLocale("ko");
    const detail = formatNetworkEntryDetails(entry);
    expect(detail).toContain("요청 URL: https://example.com/api");
    expect(detail).toContain("메서드: GET");
    expect(detail).toContain("X-Test: Original value");
  });

  test("module label tables and branch helpers follow changes after import", () => {
    applyAppLocale("en");
    expect(COMMAND_PALETTE_GROUP_LABELS.navigation).toBe("Navigation");
    expect(RIGHT_RAIL_PANEL_TITLES.changes).toBe("Source Control");
    expect(formatBranchLabel("HEAD")).toBe("Detached HEAD");
    applyAppLocale("ko");
    expect(COMMAND_PALETTE_GROUP_LABELS.navigation).toBe("탐색");
    expect(RIGHT_RAIL_PANEL_TITLES.changes).toBe("소스 제어");
    expect(formatBranchLabel("HEAD")).toBe("분리된 HEAD");
    expect(formatBranchLabel("feature/my-work")).toBe("feature/my-work");
  });

  test("reset summaries keep the already-reset branch in Korean", () => {
    applyAppLocale("ko");
    expect(formatResetCountdown(0, 1)).toBe("지금");
    expect(formatResetCountdown(3660, 0)).toBe("1시간 1분");
    expect(windowDurationTitle(5 * 3_600_000)).toBe("5시간 한도");
    const hint = describeUsageWindow({
      window: { short: "", label: "", title: "한도", note: null, usedPercent: 75, resetsAt: 0, windowMs: 3_600_000 },
      providerName: "Codex", blockAtLimit: true, now: 1,
    });
    expect(hint.lines[0]).toBe("지금 초기화됩니다. Stave가 곧 새 사용량을 읽습니다.");
    expect(hint.lines[1]).toContain("새 Codex 턴을 보류합니다");
  });

  test("rendered accessibility text and CLI empty state use both languages", () => {
    applyAppLocale("en");
    expect(renderToStaticMarkup(createElement(QuotaTimeLeftClock, { timeLeftRatio: 0.5 }))).toContain('aria-label="50% of window left"');
    expect(buildStandaloneCliEmptyStateText()).toContain("Settings");
    applyAppLocale("ko");
    expect(renderToStaticMarkup(createElement(QuotaTimeLeftClock, { timeLeftRatio: 0.5 }))).toContain('aria-label="창 시간의 50% 남음"');
    expect(buildStandaloneCliEmptyStateText()).toContain("설정");
  });
});
