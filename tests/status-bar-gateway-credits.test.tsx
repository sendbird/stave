import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n/runtime";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import { GatewayCreditsDetail } from "@/components/layout/StatusBarGatewayCredits";
import {
  apiConnectionCreditsId,
  resolveStatusBarAccountView,
} from "@/components/layout/status-bar-usage.utils";
import {
  buildUsageStripSegment,
  estimateUsageStripSegmentRem,
} from "@/components/layout/status-bar-usage-strip.utils";
import type { ApiConnectionKind } from "@/lib/providers/api-connections";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import {
  startApiConnectionCreditsPolling,
  useApiConnectionCredits,
  type ApiConnectionCreditsView,
} from "@/lib/providers/use-api-connection-credits";

const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const SECRET_ID = "11111111-1111-4111-8111-111111111111";
const READ: ApiConnectionCreditsView = { status: "ok", balanceUsd: "95.50", totalUsedUsd: "4.50" };

function connectionProfile(kind: ApiConnectionKind): ProviderAccountProfile {
  const models = [{ id: "anthropic/claude-sonnet-5" }];
  return {
    id: CONNECTION_ID,
    providerId: "claude-code",
    label: "Company gateway",
    kind: "managed",
    gateway: { baseUrl: "https://ai-gateway.vercel.sh/claude-code", secretId: SECRET_ID, models: models.map((model) => model.id) },
    apiConnection: { label: "Company gateway", kind, models },
  };
}

function meter(kind: ApiConnectionKind, credits: ApiConnectionCreditsView | null) {
  const account = resolveStatusBarAccountView({ providerId: "claude-code", profiles: [connectionProfile(kind)], selectedId: CONNECTION_ID });
  const segment = buildUsageStripSegment({
    provider: "claude",
    providerName: "Claude",
    windows: [],
    account,
    spend: undefined,
    credits: apiConnectionCreditsId(account) ? credits : null,
    stale: false,
    pending: false,
  });
  const html = renderToStaticMarkup(
    createElement(StatusBarUsageSegment, { segment, account, breakpoint: 24, tokensBreakpoint: 24, now: 0 }),
  );
  return { account, segment, html };
}

async function inLanguage<T>(language: string, run: () => T): Promise<T> {
  const original = i18n.language;
  await i18n.changeLanguage(language);
  try {
    return run();
  } finally {
    await i18n.changeLanguage(original);
  }
}

describe("status bar meter: Vercel AI Gateway balance", () => {
  test("only a selected Vercel connection has a balance to read", () => {
    expect(meter("vercel-ai-gateway", READ).account).toMatchObject({ gateway: true });
    expect(apiConnectionCreditsId(meter("vercel-ai-gateway", READ).account)).toBe(CONNECTION_ID);
    expect(apiConnectionCreditsId(meter("custom", READ).account)).toBeNull();
    const signIn = resolveStatusBarAccountView({ providerId: "claude-code", profiles: [], selectedId: SYSTEM_ACCOUNT_PROFILE_ID });
    expect(apiConnectionCreditsId(signIn)).toBeNull();
  });

  test("shows the balance and total used in USD, in English and Korean", async () => {
    const en = await inLanguage("en", () => meter("vercel-ai-gateway", READ));
    expect(en.html).toContain("Claude · API billing");
    expect(en.html).toContain("$95.50 left · $4.50 used");
    expect(en.html).toContain('aria-label="Claude · API billing usage: $95.50 left · $4.50 used"');
    // The strip makes room for the figures when it decides between its forms.
    expect(estimateUsageStripSegmentRem(en.segment)).toBeGreaterThan(estimateUsageStripSegmentRem({ ...en.segment, credits: null }));

    const ko = await inLanguage("ko", () => meter("vercel-ai-gateway", READ));
    expect(ko.html).toContain("Claude · API 청구");
    expect(ko.html).toContain("잔액 $95.50 · 사용 $4.50");

    const large = await inLanguage("en", () => meter("vercel-ai-gateway", { status: "ok", balanceUsd: "1234.5", totalUsedUsd: "0" }));
    expect(large.html).toContain("$1,234.50 left · $0.00 used");
    // The compact strip keeps the balance alone, next to the full form.
    expect(en.html).toContain(">$95.50 left<");
    expect(ko.html).toContain(">잔액 $95.50<");
    const overdrawn = await inLanguage("en", () => meter("vercel-ai-gateway", { status: "ok", balanceUsd: "-5", totalUsedUsd: "105" }));
    expect(overdrawn.html).toContain("-$5.00 left · $105.00 used");
  });

  test("a custom connection keeps API billing with no figures", async () => {
    const { html, segment } = await inLanguage("en", () => meter("custom", READ));
    expect(segment.credits).toBeNull();
    expect(html).toContain("Claude · API billing");
    expect(html).not.toContain("$");
    expect(html).not.toContain("left");
    expect(html).not.toContain("Balance unavailable");
  });

  test("a failed read shows API billing and the unavailable line, never a number", async () => {
    const en = await inLanguage("en", () => meter("vercel-ai-gateway", { status: "unavailable" }));
    expect(en.html).toContain("Claude · API billing");
    expect(en.html).toContain(">—<");
    expect(en.html).toContain('aria-label="Claude · API billing usage: Balance unavailable"');
    expect(en.html).not.toContain("$");
    const detail = (credits: ApiConnectionCreditsView) => renderToStaticMarkup(createElement(GatewayCreditsDetail, { credits }));
    expect(await inLanguage("en", () => detail({ status: "unavailable" }))).toContain("Balance unavailable");
    expect(await inLanguage("ko", () => detail({ status: "unavailable" }))).toContain("잔액을 확인할 수 없음");
    expect(await inLanguage("en", () => detail(READ))).toContain("$95.50 left · $4.50 used");
    expect(detail({ status: "loading" })).toBe("");
  });
});

describe("balance store", () => {
  const originalWindow = globalThis.window;
  afterEach(() => {
    useApiConnectionCredits.setState({ byId: {} });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  test("keeps the amounts of a read, and a failed or thrown read as unavailable", async () => {
    const asked: string[] = [];
    let answer: () => Promise<unknown> = async () => ({ ok: true, balanceUsd: "95.50", totalUsedUsd: "4.50" });
    (globalThis as { window?: unknown }).window = {
      api: { apiConnections: { credits: async ({ id }: { id: string }) => { asked.push(id); return answer(); } } },
    };
    const { refresh } = useApiConnectionCredits.getState();
    await refresh(CONNECTION_ID);
    expect(useApiConnectionCredits.getState().byId[CONNECTION_ID]).toEqual(READ);
    answer = async () => ({ ok: false, reason: "rate-limited" });
    await refresh(CONNECTION_ID);
    expect(useApiConnectionCredits.getState().byId[CONNECTION_ID]).toEqual({ status: "unavailable" });
    answer = async () => { throw new Error("ipc closed"); };
    await refresh(CONNECTION_ID);
    expect(useApiConnectionCredits.getState().byId[CONNECTION_ID]).toEqual({ status: "unavailable" });
    expect(asked).toEqual([CONNECTION_ID, CONNECTION_ID, CONNECTION_ID]);
  });

  test("a window without the bridge shows the balance as unavailable", async () => {
    (globalThis as { window?: unknown }).window = { api: {} };
    await useApiConnectionCredits.getState().refresh(CONNECTION_ID);
    expect(useApiConnectionCredits.getState().byId[CONNECTION_ID]).toEqual({ status: "unavailable" });
  });

  test("polls now, on its interval and when the window shows again, never while hidden, and stops", async () => {
    const listeners = new Set<() => void>();
    const doc = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    };
    const asked: string[] = [];
    const stop = startApiConnectionCreditsPolling([CONNECTION_ID], { doc: doc as never, intervalMs: 20, refresh: (id) => asked.push(id) });
    expect(asked).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterInterval = asked.length;
    expect(afterInterval).toBeGreaterThanOrEqual(2);
    doc.visibilityState = "hidden";
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toHaveLength(afterInterval);
    doc.visibilityState = "visible";
    for (const listener of listeners) listener();
    expect(asked).toHaveLength(afterInterval + 1);
    stop();
    expect(listeners.size).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toHaveLength(afterInterval + 1);
  });
});
