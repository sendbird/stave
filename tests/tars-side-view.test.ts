import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TarsDecisionActionSchema, TarsDecisionSchema, TarsActionReceiptSchema, type TarsActionReceipt } from "../src/lib/tars/conversation";
import { quoteTarsDiffLines, tarsDiffQuoteRange, TARS_DIFF_QUOTE_MAX_LINES, type TarsDiffLine } from "../src/lib/tars/diff-quote";
import { isTarsSideViewEscape, selectNewTarsShowRequests, settleTarsShowRequest, tarsSideViewPlacement, TARS_SHOW_PENDING_MS, TARS_SIDE_VIEW_MIN_WIDTH, TARS_SIDE_VIEW_NARROW_HEIGHT_SHARE } from "../src/lib/tars/side-view";
import { TARS_CONVERSATION_MIN_WIDTH, TARS_TRAY_PINNED_MIN_WIDTH } from "../src/lib/tars/tray-model";

const NOW = "2026-11-05T00:00:00.000Z";

describe("side view placement", () => {
  test.each([1088, 1280, 1440, 2560])("at %ipx it takes a column and the conversation keeps at least 440px", (width) => {
    const placement = tarsSideViewPlacement({ width, height: 900 });
    if (placement.placement !== "column") throw new Error("expected a column");
    expect(placement.conversationWidth).toBeGreaterThanOrEqual(TARS_CONVERSATION_MIN_WIDTH);
    expect(placement.width).toBeGreaterThanOrEqual(TARS_SIDE_VIEW_MIN_WIDTH);
    expect(placement.width + placement.conversationWidth).toBe(width);
  });

  test("half the view when there is room, the floor's remainder when there is not", () => {
    expect(tarsSideViewPlacement({ width: 1280, height: 900 })).toEqual({ placement: "column", width: 640, conversationWidth: 640 });
    // 1100 - 440 = 660 > 550: half still fits.
    expect(tarsSideViewPlacement({ width: 1100, height: 900 })).toMatchObject({ width: 550 });
  });

  test.each([[420, 900, 360], [1087, 700, 280], [390, 844, 337]])("below the pinned width (%ipx) it sits inline, capped at 40%% of %ipx", (width, height, cap) => {
    expect(width).toBeLessThan(TARS_TRAY_PINNED_MIN_WIDTH);
    expect(tarsSideViewPlacement({ width, height })).toEqual({ placement: "inline", maxHeight: cap });
    expect(cap).toBeLessThanOrEqual(height * TARS_SIDE_VIEW_NARROW_HEIGHT_SHARE);
  });

  test("the StyleX column restates the shared floor and minimum width", () => {
    const source = readFileSync(path.join(import.meta.dir, "../src/components/tars/tars-side-view.styles.ts"), "utf8");
    expect(source).toContain(`const CONVERSATION_FLOOR = "${TARS_CONVERSATION_MIN_WIDTH}px";`);
    expect(source).toContain(`const MIN_WIDTH = "${TARS_SIDE_VIEW_MIN_WIDTH / 16}rem";`);
    expect(source).toContain("clamp(${MIN_WIDTH}, 50%, calc(100% - ${CONVERSATION_FLOOR}))");
  });
});

const showReceipt = (messageId: string, patch: Partial<TarsActionReceipt> = {}): TarsActionReceipt => ({
  messageId, actionIndex: 0, requestHash: "e".repeat(64), action: { kind: "show", responsibilityId: "checkout", view: "report" },
  status: "applied", responsibilityId: "checkout", error: null, reason: null, revision: 2, createdAt: NOW, updatedAt: NOW, ...patch,
});

describe("show action", () => {
  test("names one responsibility and one of four views, and nothing else", () => {
    expect(TarsDecisionActionSchema.safeParse({ kind: "show", responsibilityId: "checkout", view: "changes" }).success).toBe(true);
    for (const invalid of [
      { kind: "show", responsibilityId: "checkout", view: "diff" },
      { kind: "show", responsibilityId: "checkout" },
      { kind: "show", responsibilityId: "", view: "report" },
      // No authority rides along: a revision, an operation or a path is refused.
      { kind: "show", responsibilityId: "checkout", view: "report", expectedRevision: 1 },
      { kind: "show", responsibilityId: "checkout", view: "report", operation: "resume" },
      { kind: "show", responsibilityId: "checkout", view: "report", repositoryPath: "/tmp" },
    ]) expect(TarsDecisionActionSchema.safeParse(invalid).success).toBe(false);
  });

  test("a reply opens at most one view", () => {
    const show = { kind: "show" as const, responsibilityId: "checkout", view: "report" as const };
    expect(TarsDecisionSchema.safeParse({ reply: "Here it is.", actions: [show] }).success).toBe(true);
    expect(TarsDecisionSchema.safeParse({ reply: "Here they are.", actions: [show, { ...show, view: "review" }] }).success).toBe(false);
  });

  test("its receipt is opened or refused with a translated reason, never pending authority", () => {
    expect(TarsActionReceiptSchema.safeParse(showReceipt("m1")).success).toBe(true);
    expect(TarsActionReceiptSchema.safeParse(showReceipt("m1", { status: "rejected", responsibilityId: null, error: "Not owned.", reason: "notOwned" })).success).toBe(true);
    expect(TarsActionReceiptSchema.safeParse(showReceipt("m1", { status: "proposed", responsibilityId: null })).success).toBe(false);
  });

  test("the first read records what is there; only later admitted shows open, each once", () => {
    const first = selectNewTarsShowRequests([showReceipt("old")], null);
    expect(first.requests).toEqual([]);
    const later = selectNewTarsShowRequests([showReceipt("old"), showReceipt("new", { action: { kind: "show", responsibilityId: "checkout", view: "review" } }),
      showReceipt("refused", { status: "rejected", responsibilityId: null, error: "Not owned.", reason: "notOwned" })], first.seen);
    expect(later.requests).toEqual([{ responsibilityId: "checkout", kind: "review" }]);
    expect(selectNewTarsShowRequests([showReceipt("old"), showReceipt("new")], later.seen).requests).toEqual([]);
  });
});

const line = (patch: Partial<TarsDiffLine>): TarsDiffLine => ({ oldLine: null, newLine: null, sign: " ", text: "", ...patch });

describe("diff line quoting", () => {
  const header = (range: { side: string; start: number; end: number }) => `About a.ts ${range.side} ${range.start}-${range.end}:`;

  test("names the lines after the change, and only the removed lines when nothing else was selected", () => {
    expect(tarsDiffQuoteRange([line({ oldLine: 4, sign: "-" }), line({ newLine: 4, sign: "+" }), line({ newLine: 5, sign: "+" })]))
      .toEqual({ side: "new", start: 4, end: 5 });
    expect(tarsDiffQuoteRange([line({ oldLine: 7, sign: "-" }), line({ oldLine: 8, sign: "-" })])).toEqual({ side: "old", start: 7, end: 8 });
    expect(tarsDiffQuoteRange([])).toBeNull();
  });

  test("quotes the file, range and lines as a diff block the user edits", () => {
    const quote = quoteTarsDiffLines({ header, lines: [line({ oldLine: 1, newLine: 1, text: "keep()" }), line({ newLine: 2, sign: "+", text: "  add()" })] });
    expect(quote).toBe("About a.ts new 1-2:\n```diff\n  keep()\n+   add()\n```\n");
  });

  test("a fence longer than any backtick run keeps quoted code inside it", () => {
    const quote = quoteTarsDiffLines({ header, lines: [line({ newLine: 3, sign: "+", text: "const s = ```x```;" })] })!;
    expect(quote.split("\n")[1]).toBe("````diff");
    expect(quote.trimEnd().endsWith("````")).toBe(true);
  });

  test("a long selection is cut at a line boundary and says so", () => {
    const lines = Array.from({ length: TARS_DIFF_QUOTE_MAX_LINES + 20 }, (_, index) => line({ newLine: index + 1, sign: "+", text: `line ${index + 1}` }));
    const quote = quoteTarsDiffLines({ header, lines })!;
    const body = quote.split("\n").slice(2, -2);
    expect(body).toHaveLength(TARS_DIFF_QUOTE_MAX_LINES + 1);
    expect(body.at(-1)).toBe("…");
    // The header still names the whole selection.
    expect(quote.startsWith(`About a.ts new 1-${TARS_DIFF_QUOTE_MAX_LINES + 20}:`)).toBe(true);
  });
});

describe("show requests waiting for their responsibility", () => {
  const target = { responsibilityId: "new-work", kind: "report" as const };
  test("a show that arrives before its responsibility waits for the snapshot that brings it", () => {
    const early = settleTarsShowRequest({ pending: null, incoming: target, responsibilityIds: new Set(["other"]), now: 1_000 });
    expect(early).toEqual({ open: null, pending: { target, until: 1_000 + TARS_SHOW_PENDING_MS } });
    // No snapshot read yet: it waits too.
    expect(settleTarsShowRequest({ pending: null, incoming: target, responsibilityIds: null, now: 1_000 }).pending).not.toBeNull();
    expect(settleTarsShowRequest({ pending: early.pending, incoming: null, responsibilityIds: new Set(["other", "new-work"]), now: 4_000 }))
      .toEqual({ open: target, pending: null });
  });

  test("it is dropped after the bound, and a newer show replaces it", () => {
    const early = settleTarsShowRequest({ pending: null, incoming: target, responsibilityIds: new Set(), now: 0 });
    expect(settleTarsShowRequest({ pending: early.pending, incoming: null, responsibilityIds: new Set(["new-work"]), now: TARS_SHOW_PENDING_MS + 1 }))
      .toEqual({ open: null, pending: null });
    const newer = { responsibilityId: "other", kind: "changes" as const };
    expect(settleTarsShowRequest({ pending: early.pending, incoming: newer, responsibilityIds: new Set(["other"]), now: 5 }).open).toEqual(newer);
  });
});

describe("Esc for the side view", () => {
  test("closes only when no IME composition and no nearer layer used the key", () => {
    expect(isTarsSideViewEscape({ key: "Escape", defaultPrevented: false })).toBe(true);
    expect(isTarsSideViewEscape({ key: "Escape", defaultPrevented: false, isComposing: true })).toBe(false);
    expect(isTarsSideViewEscape({ key: "Escape", defaultPrevented: false, keyCode: 229 })).toBe(false);
    expect(isTarsSideViewEscape({ key: "Escape", defaultPrevented: true })).toBe(false);
    expect(isTarsSideViewEscape({ key: "Enter", defaultPrevented: false })).toBe(false);
  });
});
