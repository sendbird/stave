import { expect, test } from "bun:test";
import { utilitySites } from "../scripts/style-utility-inventory.mjs";

test("finds direct, conditional and exported utility strings", () => {
  const sites = utilitySites(`
    const menu = "w-72 p-2";
    const row = <div className={cn("flex", active && "data-[selected=true]:bg-primary/10")} />;
    const icon = <svg className="size-4" />;
  `, "probe.tsx");
  expect(sites.flatMap((site: { utilities: string[] }) => site.utilities)).toEqual([
    "w-72", "p-2", "flex", "data-[selected=true]:bg-primary/10", "size-4",
  ]);
});

test("accepts semantic classes, StyleX declarations and HTML state values", () => {
  expect(utilitySites(`
    import { BorderBeam } from "border-beam";
    const styles = stylex.create({ row: { display: "flex", position: "relative" } });
    const node = <div className={sx(styles.row)} data-state="hidden" data-slot="select-item" />;
    const named = <div className="composer-frame-wing atelier-motion-dropdown" />;
  `, "probe.tsx")).toEqual([]);
});

test("does not allow interpolated utility construction to bypass the gate", () => {
  const sites = utilitySites('const node = <div className={`p-${size} flex`} />;', "probe.tsx");
  expect(sites.flatMap((site: { utilities: string[] }) => site.utilities)).toContain("interpolated-class");
});

test("finds nested arbitrary selectors without treating their inner colon as a variant", () => {
  const sites = utilitySites('const node = <div className="[&>svg:not([hidden])]:size-4 [justify-content:safe_center]" />;', "probe.tsx");
  expect(sites[0]?.utilities).toEqual(["[&>svg:not([hidden])]:size-4", "[justify-content:safe_center]"]);
});
