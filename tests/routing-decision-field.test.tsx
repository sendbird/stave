import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { RoutingDecisionField } from "@/components/layout/RoutingDecisionField";
import { nativeDecisionModelName, resolveRoutingDecisionStatus } from "@/components/layout/routing-decision-status";
import type { RoutingDecisionConfig } from "@/lib/providers/routing-decision";

const gateway: RoutingDecisionConfig = { mode: "gateway", connectionId: "33333333-3333-4333-8333-333333333333", model: "typesafe-ai/jev" };
const on = { autoRoutingEnabled: true, classifierEnabled: true };
const luna = nativeDecisionModelName("codex");
const haiku = nativeDecisionModelName("claude-code");

describe("Routing decision status", () => {
  test("names the model in use and the order Stave falls back through", () => {
    expect(resolveRoutingDecisionStatus({ ...on, value: { mode: "automatic" } })).toEqual({ kind: "primary", first: luna, second: haiku });
    expect(resolveRoutingDecisionStatus({ ...on, value: { mode: "native", providerId: "claude-code" } })).toEqual({ kind: "primary", first: haiku, second: luna });
    expect(resolveRoutingDecisionStatus({ ...on, value: gateway, connectionLabel: "Company gateway", modelName: "Jev" }))
      .toEqual({ kind: "gateway", model: "Jev", connection: "Company gateway", first: luna, second: haiku });
  });

  test("a gateway choice whose connection is gone reports the native fallback that actually runs", () => {
    expect(resolveRoutingDecisionStatus({ ...on, value: gateway })).toEqual({ kind: "primary", first: luna, second: haiku });
  });

  test("says the choice is not in use while Auto or model classification is off", () => {
    expect(resolveRoutingDecisionStatus({ ...on, autoRoutingEnabled: false, value: gateway, connectionLabel: "Company gateway" }).kind).toBe("autoOff");
    expect(resolveRoutingDecisionStatus({ ...on, classifierEnabled: false, value: { mode: "automatic" } }).kind).toBe("classifierOff");
  });

  test("an Agent that inherits points at the global setting; the global field never inherits", () => {
    expect(resolveRoutingDecisionStatus({ ...on, allowInherit: true }).kind).toBe("inherit");
    expect(resolveRoutingDecisionStatus({ ...on }).kind).toBe("primary");
  });

  test("the gateway status reads as one sentence in both languages", () => {
    const status = { model: "Jev", connection: "Company gateway", first: luna, second: haiku };
    expect(i18n.t("settingsProviders:routingDecision.status.gateway", { ...status, lng: "en" }))
      .toBe(`In use: Jev through the Company gateway API connection. If it fails, Stave tries ${luna}, then ${haiku}, then local keyword rules.`);
    expect(i18n.t("settingsProviders:routingDecision.status.gateway", { ...status, lng: "ko" }))
      .toBe(`사용 중: Company gateway API 연결을 통한 Jev. 실패하면 ${luna}, ${haiku}, 로컬 키워드 규칙 순서로 시도합니다.`);
  });
});

describe("Routing decision field", () => {
  // Server rendering reads the stores' initial state: no API connections, Auto off.
  const render = (value?: RoutingDecisionConfig) => renderToStaticMarkup(createElement(RoutingDecisionField, { value, onChange: () => {} }))
    .replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/\s+/g, " ");

  test("a saved gateway with no connection left says so, without a search box outside a list", () => {
    const text = render(gateway);
    expect(text).toContain("The saved API connection is no longer available. Add a Vercel AI Gateway API connection in Settings > Accounts");
    expect(text).not.toContain("Search");
    expect(text).toContain("Not in use: Auto is off");
  });
});
