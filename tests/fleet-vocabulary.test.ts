import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { FLEET_ATTENTION_PRIORITY } from "@/lib/fleet/attention-projection";
import { i18n } from "@/i18n";
import { FLEET_ATTENTION_SNOOZE_DURATIONS } from "@/lib/fleet/attention-snooze";
import {
  describeFleetAttentionCounts,
  describeFleetAttentionPrimaryAction,
  describeFleetWaitingCount,
  FLEET_ATTENTION_KIND_LABEL,
  FLEET_LANE_LABEL,
  FLEET_SNOOZE_DURATION_LABEL_KEY,
  FLEET_TIER_LABEL,
} from "@/lib/fleet/fleet-vocabulary";
import { SIDEBAR_WORK_QUEUE_LANE_LABEL } from "@/lib/fleet/sidebar-work-queue";
import { FLEET_BOARD_FILTER_OPTIONS } from "@/lib/fleet/workspace-activity";

afterEach(() => {
  applyAppLocale("en");
});

describe("Fleet vocabulary", () => {
  test("a tier and the lane it fills share one word on every surface", () => {
    expect(FLEET_TIER_LABEL.blocking).toBe("Action required");
    expect(FLEET_TIER_LABEL.review).toBe("In review");
    expect(FLEET_LANE_LABEL["action-required"]).toBe(FLEET_TIER_LABEL.blocking);
    expect(FLEET_LANE_LABEL["in-review"]).toBe(FLEET_TIER_LABEL.review);
    expect(SIDEBAR_WORK_QUEUE_LANE_LABEL["action-required"]).toBe(FLEET_TIER_LABEL.blocking);
    expect(
      FLEET_BOARD_FILTER_OPTIONS.find((option) => option.value === "blocked")?.label,
    ).toBe(FLEET_TIER_LABEL.blocking);
  });

  test("the top bar counts what blocks and names review items separately", () => {
    expect(describeFleetAttentionCounts({ blockingCount: 0, reviewCount: 0 })).toBe("Fleet");
    expect(describeFleetAttentionCounts({ blockingCount: 1, reviewCount: 0 })).toBe(
      "Fleet · 1 action required",
    );
    expect(describeFleetAttentionCounts({ blockingCount: 2, reviewCount: 3 })).toBe(
      "Fleet · 2 actions required · 3 in review",
    );
    expect(describeFleetAttentionCounts({ blockingCount: 0, reviewCount: 1 })).toBe(
      "Fleet · 1 in review",
    );
    applyAppLocale("ko");
    expect(describeFleetAttentionCounts({ blockingCount: 2, reviewCount: 3 })).toBe(
      "Fleet 보기 · 조치 필요 2개 · 리뷰 대기 3개",
    );
  });

  test("every kind has a label and an action in both languages", () => {
    const kinds = Object.keys(FLEET_ATTENTION_PRIORITY) as Array<keyof typeof FLEET_ATTENTION_PRIORITY>;
    for (const locale of ["en", "ko"] as const) {
      applyAppLocale(locale);
      for (const kind of kinds) {
        expect(FLEET_ATTENTION_KIND_LABEL[kind]).toBeTruthy();
        expect(FLEET_ATTENTION_KIND_LABEL[kind]).not.toContain("vocabulary.");
        expect(describeFleetAttentionPrimaryAction(kind)).not.toContain("vocabulary.");
      }
    }
  });
});

describe("Fleet inbox words", () => {
  test("the waiting count is a sentence in either language", () => {
    expect(describeFleetWaitingCount(1)).toBe("1 waiting on you");
    expect(describeFleetWaitingCount(3)).toBe("3 waiting on you");
    expect(describeFleetWaitingCount(0)).toBe("Nothing is waiting on you");
    applyAppLocale("ko");
    expect(describeFleetWaitingCount(3)).toBe("3개가 기다리는 중");
    expect(describeFleetWaitingCount(0)).toBe("기다리는 항목 없음");
  });

  test("every snooze length has words, and Korean has no English left", () => {
    const words = () => FLEET_ATTENTION_SNOOZE_DURATIONS.map((duration) => i18n.t(FLEET_SNOOZE_DURATION_LABEL_KEY[duration.id]));
    expect(words()).toEqual(["1 hour", "4 hours", "1 day", "1 week"]);
    applyAppLocale("ko");
    const korean = words();
    expect(korean).toEqual(["1시간", "4시간", "1일", "1주일"]);
    for (const word of korean) expect(word).not.toMatch(/[A-Za-z]/);
  });
});
