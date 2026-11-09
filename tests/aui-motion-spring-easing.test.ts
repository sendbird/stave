import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  motionDurations,
  motionEaseInOutCss,
  motionEaseOutCss,
  motionEaseSignatureCss,
  motionEaseSpringCss,
  motionEaseSpringSnappyCss,
  motionSignature,
  springBouncy,
  springLinearEasing,
  springSignature,
  springSnappy,
  springStepResponse,
  type SpringPreset,
} from "../src/components/aui/tokens/motion-presets";

/*
 * Port of AUI `test/motion-spring-easing.test.ts` (sendbird/atelier
 * `46a7ccd9`): `styles.css` carries the generated `linear()` springs verbatim
 * and the JS motion layer mirrors the CSS beats. The last case is the host's
 * own: `motionDurations` is what Web Animations and timers in this copy read
 * to end with a CSS keyframe, so every beat must equal its CSS twin.
 */
const styles = readFileSync(
  join(import.meta.dir, "..", "src", "components", "aui", "styles.css"),
  "utf8",
);

// Whitespace-insensitive, so a formatter wrapping the stops still compares.
const cssToken = (name: string) =>
  styles
    .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]
    ?.replace(/\s+/g, " ")
    .replace(/\(\s+/, "(")
    .replace(/,?\s*\)$/, ")");

const zeta = ({ damping, mass, stiffness }: SpringPreset) =>
  damping / (2 * Math.sqrt(stiffness * mass));

const stops = (easing: string) =>
  easing
    .slice("linear(".length, -1)
    .split(",")
    .map((stop) => Number(stop.trim()));

describe("AUI spring easing tokens", () => {
  test("styles.css carries the generated linear() curves verbatim", () => {
    expect(cssToken("--atelier-motion-ease-spring")).toBe(motionEaseSpringCss);
    expect(cssToken("--atelier-motion-ease-spring-snappy")).toBe(
      motionEaseSpringSnappyCss,
    );
  });

  test("the bouncy spring overshoots 10-15%; snappy stays under 2%", () => {
    expect(zeta(springBouncy)).toBeCloseTo(0.54, 2);
    expect(Math.max(...stops(motionEaseSpringCss))).toBeGreaterThan(1.1);
    expect(Math.max(...stops(motionEaseSpringCss))).toBeLessThan(1.15);
    expect(zeta(springSnappy)).toBeCloseTo(0.79, 2);
    expect(Math.max(...stops(motionEaseSpringSnappyCss))).toBeLessThan(1.02);
  });

  test("the signature names the bouncy spring and its CSS mirrors", () => {
    expect(springBouncy).toBe(springSignature);
    expect(motionEaseSignatureCss).toBe(motionEaseSpringCss);
    expect(motionSignature.easeCss).toBe(motionEaseSpringCss);
    expect(cssToken("--atelier-motion-ease-signature")).toBe(
      "var(--atelier-motion-ease-spring)",
    );
    expect(cssToken("--atelier-motion-duration-signature")).toBe(
      `${motionSignature.duration * 1000}ms`,
    );
    expect(motionDurations.signature).toBe(motionSignature.duration);
    expect(cssToken("--atelier-motion-signature-overshoot")).toBe(
      `${motionSignature.overshootCapPx}px`,
    );
    expect(motionSignature.duration).toBeLessThan(0.3);
    expect(motionSignature.closeDuration).toBeLessThan(
      motionSignature.duration,
    );
  });

  test("the cubic curves and the spin cadence match their JS mirrors", () => {
    expect(cssToken("--atelier-motion-ease-out")).toBe(motionEaseOutCss);
    expect(cssToken("--atelier-motion-ease-in-out")).toBe(motionEaseInOutCss);
    expect(cssToken("--atelier-motion-duration-spin")).toBe(
      `${motionDurations.spin * 1000}ms`,
    );
  });

  test("curves start at 0, end at exactly 1, with 25 stops", () => {
    for (const easing of [motionEaseSpringCss, motionEaseSpringSnappyCss]) {
      const values = stops(easing);
      expect(values).toHaveLength(25);
      expect(values[0]).toBe(0);
      expect(values.at(-1)).toBe(1);
    }
  });

  test("the step response handles critical and over-damped springs", () => {
    const critical = { type: "spring", stiffness: 100, damping: 20, mass: 1 };
    const over = { type: "spring", stiffness: 100, damping: 40, mass: 1 };
    for (const spring of [critical, over] as SpringPreset[]) {
      expect(springStepResponse(spring, 0)).toBeCloseTo(0, 10);
      expect(springStepResponse(spring, 5)).toBeCloseTo(1, 4);
      expect(
        Math.max(...stops(springLinearEasing(spring))),
      ).toBeLessThanOrEqual(1);
    }
  });

  test("every JS duration beat equals its --atelier-motion-duration-* twin", () => {
    for (const [step, seconds] of Object.entries(motionDurations)) {
      expect(cssToken(`--atelier-motion-duration-${step}`)).toBe(
        `${Math.round(seconds * 1000)}ms`,
      );
    }
  });
});
