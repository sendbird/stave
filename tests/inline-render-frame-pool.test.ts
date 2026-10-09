import { describe, expect, test } from "bun:test";
import {
  createInlineRenderFramePool,
  createInlineRenderViewMemory,
  INLINE_RENDER_MAX_LIVE_FRAMES,
  resolveInlineRenderFrameNear,
} from "@/lib/inline-render/inline-render-frame-pool";

describe("inline render frame pool", () => {
  test("only frames near the viewport are live", () => {
    const pool = createInlineRenderFramePool({ maxLive: 3 });
    pool.register("a");
    pool.register("b");
    expect(pool.isLive("a")).toBe(false);
    pool.setNear("a", true);
    expect(pool.isLive("a")).toBe(true);
    expect(pool.isLive("b")).toBe(false);
    pool.setNear("a", false);
    expect(pool.isLive("a")).toBe(false);
    expect(pool.isWaiting("a")).toBe(false);
  });

  test("past the cap the least recently used frame gives way and waits", () => {
    const pool = createInlineRenderFramePool({ maxLive: 2 });
    for (const id of ["a", "b", "c"]) {
      pool.register(id);
      pool.setNear(id, true);
    }
    expect(["a", "b", "c"].filter((id) => pool.isLive(id))).toEqual(["b", "c"]);
    expect(pool.isWaiting("a")).toBe(true);
    // Using a waiting frame brings it back; the oldest of the others yields.
    pool.touch("a");
    expect(["a", "b", "c"].filter((id) => pool.isLive(id))).toEqual(["a", "c"]);
    expect(pool.liveCount()).toBe(2);
    // Unmounting a frame frees its place for the one waiting.
    pool.unregister("c");
    expect(pool.isLive("b")).toBe(true);
  });

  test("pinned (expanded) frames stay live while far away, and never give way", () => {
    const pool = createInlineRenderFramePool({ maxLive: 2 });
    pool.register("expanded");
    pool.register("other");
    pool.setPinned("expanded", true);
    pool.setNear("other", true);
    expect(pool.isLive("expanded")).toBe(true);
    expect(pool.isLive("other")).toBe(true);
    pool.register("third");
    pool.setNear("third", true);
    expect(pool.isLive("expanded")).toBe(true);
    expect(pool.isLive("other")).toBe(false);
    expect(pool.isLive("third")).toBe(true);
    // Even more pinned frames than the cap all stay live.
    pool.setPinned("other", true);
    pool.setPinned("third", true);
    expect(pool.liveCount()).toBe(3);
  });

  test("listeners hear about their own frame only", () => {
    const pool = createInlineRenderFramePool({ maxLive: 1 });
    const heard: string[] = [];
    for (const id of ["a", "b"]) {
      pool.register(id);
      pool.subscribe(id, () => heard.push(id));
    }
    pool.setNear("a", true);
    expect(heard).toEqual(["a"]);
    pool.setNear("b", true);
    expect(heard.sort()).toEqual(["a", "a", "b"]);
  });

  test("the default cap keeps a handful of pages running", () => {
    expect(INLINE_RENDER_MAX_LIVE_FRAMES).toBe(6);
    const pool = createInlineRenderFramePool();
    for (let index = 0; index < 20; index += 1) {
      pool.register(`f${index}`);
      pool.setNear(`f${index}`, true);
    }
    expect(pool.liveCount()).toBe(INLINE_RENDER_MAX_LIVE_FRAMES);
  });

  test("visibility has hysteresis between the mount and keep zones", () => {
    expect(resolveInlineRenderFrameNear({ previous: false, inMountZone: true, inKeepZone: true })).toBe(true);
    expect(resolveInlineRenderFrameNear({ previous: true, inMountZone: false, inKeepZone: true })).toBe(true);
    expect(resolveInlineRenderFrameNear({ previous: false, inMountZone: false, inKeepZone: true })).toBe(false);
    expect(resolveInlineRenderFrameNear({ previous: true, inMountZone: false, inKeepZone: false })).toBe(false);
    expect(resolveInlineRenderFrameNear({ previous: true, inMountZone: undefined, inKeepZone: undefined })).toBe(true);
  });

  test("view memory keeps the last height and expansion, bounded", () => {
    const memory = createInlineRenderViewMemory(2);
    memory.set("a", { height: 640 });
    memory.set("a", { expanded: true });
    expect(memory.get("a")).toEqual({ height: 640, expanded: true });
    memory.set("b", { height: 1 });
    memory.set("c", { height: 2 });
    expect(memory.size).toBe(2);
    expect(memory.get("a")).toEqual({});
  });
});
