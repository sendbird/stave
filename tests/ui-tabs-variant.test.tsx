import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsShimStyles,
} from "@/components/ui/tabs";
import { sx } from "@/components/ads/utils/stylex";

function renderStrip(variant?: "line" | "pill") {
  return renderToStaticMarkup(
    <Tabs defaultValue="one" variant={variant}>
      <TabsList aria-label="Views">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First</TabsContent>
    </Tabs>,
  );
}

describe("ui/tabs shim", () => {
  test("the variant reaches the ADS root instead of being discarded", () => {
    // The regression this pins: `variant` used to be accepted on `TabsList`
    // and dropped, so a caller asking for a line strip got the pill chrome
    // and hand-drew its own baseline rule on a wrapper.
    expect(renderStrip("line")).not.toBe(renderStrip("pill"));
  });

  test("the root pins the strip to the top of a stretched grid", () => {
    // The ADS root is `display: grid` with only implicit `auto` rows, so a
    // stretched parent split its height evenly between the strip and the
    // panel — a 438px-tall tab strip floating mid-panel in the Source Control
    // rail. The shim states `auto minmax(0, 1fr)` once, for every consumer,
    // and skips it on vertical roots (their axis is `gridTemplateColumns`).
    const fillRows = sx(tabsShimStyles.fillRows).split(" ").filter(Boolean);
    expect(fillRows.length).toBeGreaterThan(0);

    const rootClass = (markup: string) =>
      /class="([^"]*)"/.exec(markup)?.[1] ?? "";
    const horizontal = rootClass(renderStrip("pill")).split(" ");
    for (const cls of fillRows) expect(horizontal).toContain(cls);

    const vertical = rootClass(
      renderToStaticMarkup(
        <Tabs defaultValue="one" orientation="vertical">
          <TabsList aria-label="Views">
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First</TabsContent>
        </Tabs>,
      ),
    ).split(" ");
    for (const cls of fillRows) expect(vertical).not.toContain(cls);
  });

  test("renders one tablist with both triggers", () => {
    const markup = renderStrip("line");
    expect(markup.match(/role="tablist"/g)).toHaveLength(1);
    expect(markup.match(/role="tab"/g)).toHaveLength(2);
    expect(markup).toContain('data-slot="tabs-list"');
  });
});
