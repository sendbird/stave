import { describe, expect, test } from "bun:test";
import {
  buildResourceGauge,
  cpuPressureLevel,
  memoryPressureLevel,
  ratioPressureLevel,
  summarizeResourceHealth,
  worstPressureLevel,
} from "@/lib/performance/resource-pressure";
import { sparklineGeometry } from "@/lib/performance/sparkline";
import { appFootprintKB, appWorkingSetKB } from "@/lib/performance/resource-manager";

describe("resource pressure levels", () => {
  test("ramps a ratio through the shared thresholds", () => {
    expect(ratioPressureLevel(0.2)).toBe("healthy");
    expect(ratioPressureLevel(0.6)).toBe("elevated");
    expect(ratioPressureLevel(0.85)).toBe("high");
    expect(ratioPressureLevel(2)).toBe("high");
  });

  test("treats CPU as summed across processes, not as a machine percentage", () => {
    expect(cpuPressureLevel(45)).toBe("healthy");
    expect(cpuPressureLevel(95)).toBe("elevated");
    expect(cpuPressureLevel(150)).toBe("high");
  });

  test("measures memory as a share of device RAM when it is known", () => {
    const sixteenGB = 16 * 1024 ** 3;
    expect(memoryPressureLevel(2 * 1024 ** 3, sixteenGB)).toBe("healthy");
    expect(memoryPressureLevel(5 * 1024 ** 3, sixteenGB)).toBe("elevated");
    expect(memoryPressureLevel(9 * 1024 ** 3, sixteenGB)).toBe("high");
  });

  test("falls back to absolute thresholds without device memory", () => {
    expect(memoryPressureLevel(2 * 1024 ** 3, null)).toBe("healthy");
    expect(memoryPressureLevel(5 * 1024 ** 3, null)).toBe("elevated");
    expect(memoryPressureLevel(9 * 1024 ** 3, null)).toBe("high");
  });

  test("a footprint that would be fine on a big machine is not fine on a small one", () => {
    const eightGB = 8 * 1024 ** 3;
    const sixtyFourGB = 64 * 1024 ** 3;
    expect(memoryPressureLevel(4 * 1024 ** 3, eightGB)).toBe("high");
    expect(memoryPressureLevel(4 * 1024 ** 3, sixtyFourGB)).toBe("healthy");
  });

  test("worst level wins", () => {
    expect(worstPressureLevel(["healthy", "high", "elevated"])).toBe("high");
    expect(worstPressureLevel([])).toBe("healthy");
  });
});

describe("resource gauges", () => {
  test("refuses to build a gauge without a real denominator", () => {
    expect(
      buildResourceGauge({
        id: "a",
        label: "A",
        used: 10,
        limit: undefined,
        detail: "",
      }),
    ).toBeNull();
    expect(
      buildResourceGauge({
        id: "a",
        label: "A",
        used: 10,
        limit: 0,
        detail: "",
      }),
    ).toBeNull();
  });

  test("reports the ratio, the rounded percent and the level together", () => {
    const gauge = buildResourceGauge({
      id: "heap",
      label: "Heap",
      used: 700,
      limit: 1_000,
      detail: "700 / 1000",
    });
    expect(gauge).toMatchObject({ percent: 70, level: "elevated" });
    expect(gauge?.ratio).toBeCloseTo(0.7);
  });
});

describe("resource health headline", () => {
  const gauge = (percent: number) =>
    buildResourceGauge({
      id: `g${percent}`,
      label: `Gauge ${percent}`,
      used: percent,
      limit: 100,
      detail: "",
    })!;

  test("an unresponsive renderer outranks any full gauge", () => {
    expect(
      summarizeResourceHealth({
        gauges: [gauge(99)],
        memoryLevel: "healthy",
        memoryDetail: "fine",
        cpuPercent: 0,
        currentlyUnresponsive: true,
      }),
    ).toMatchObject({
      level: "high",
      reason: "The app renderer is not responding to input",
    });
  });

  test("names the worst contributor so the color is explained", () => {
    expect(
      summarizeResourceHealth({
        gauges: [gauge(10), gauge(90)],
        memoryLevel: "healthy",
        memoryDetail: "fine",
        cpuPercent: 5,
        currentlyUnresponsive: false,
      }),
    ).toMatchObject({
      level: "high",
      reason: "Gauge 90: 90% of the limit",
    });
  });

  test("reports memory when memory is the worst signal", () => {
    expect(
      summarizeResourceHealth({
        gauges: [gauge(10)],
        memoryLevel: "elevated",
        memoryDetail: "App footprint at 30% of 16.00 GB device memory",
        cpuPercent: 5,
        currentlyUnresponsive: false,
      }),
    ).toMatchObject({
      level: "elevated",
      reason: "App footprint at 30% of 16.00 GB device memory",
    });
  });

  test("says so when everything is within range", () => {
    expect(
      summarizeResourceHealth({
        gauges: [gauge(10)],
        memoryLevel: "healthy",
        memoryDetail: "fine",
        cpuPercent: 5,
        currentlyUnresponsive: false,
      }),
    ).toMatchObject({ level: "healthy" });
  });
});

describe("sparkline geometry", () => {
  test("needs at least two readings", () => {
    expect(sparklineGeometry([], { width: 100, height: 20 })).toBeNull();
    expect(sparklineGeometry([5], { width: 100, height: 20 })).toBeNull();
  });

  test("puts a flat series on the middle of the band, not the top", () => {
    const geometry = sparklineGeometry([7, 7, 7], {
      width: 100,
      height: 20,
      strokeInset: 0,
    });
    expect(geometry?.line).toBe("M0.00,10.00 L50.00,10.00 L100.00,10.00");
  });

  test("scales to the series' own range and closes the area on the baseline", () => {
    const geometry = sparklineGeometry([0, 10], {
      width: 100,
      height: 20,
      strokeInset: 0,
    });
    expect(geometry?.line).toBe("M0.00,20.00 L100.00,0.00");
    expect(geometry?.area).toBe(
      "M0.00,20.00 L100.00,0.00 L100.00,20.00 L0,20.00 Z",
    );
    expect(geometry).toMatchObject({ min: 0, max: 10 });
  });
});

describe("app footprint", () => {
  const electron = [
    { pid: 1, role: "main", memory: { workingSetSizeKB: 1_000 } },
    { pid: 2, role: "host-renderer", memory: { workingSetSizeKB: 2_000 } },
    { pid: 3, role: "gpu", memory: { workingSetSizeKB: 500 } },
  ];

  test("substitutes a private footprint where the platform reports one", () => {
    expect(
      appFootprintKB({
        processes: electron,
        mainPrivateBytes: 100 * 1024,
        hostRendererPrivateBytes: 200 * 1024,
      }),
    ).toBe(800);
  });

  test("falls back to working set when no private footprint exists", () => {
    expect(
      appFootprintKB({
        processes: electron,
        mainPrivateBytes: null,
        hostRendererPrivateBytes: null,
      }),
    ).toBe(3_500);
  });

  test("adds the host service tree without double-counting a shared pid", () => {
    expect(
      appFootprintKB({
        processes: electron,
        hostProcesses: [
          { pid: 3, rssBytes: 999 * 1024 },
          { pid: 9, rssBytes: 1_024 * 1024 },
        ],
        mainPrivateBytes: null,
        hostRendererPrivateBytes: null,
      }),
    ).toBe(4_524);
  });
});

test("whole-app RSS includes host descendants and counts overlapping PIDs once", () => {
  expect(appWorkingSetKB({
    processes: [{ pid: 1, role: "main", memory: { workingSetSizeKB: 100 } }],
    hostProcesses: [{ pid: 1, rssBytes: 100 * 1024 }, { pid: 2, rssBytes: 300 * 1024 }],
  })).toBe(400);
});
