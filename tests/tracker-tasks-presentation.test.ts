import { describe, expect, it } from "bun:test";

import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  formatTrackerSyncedAt,
  getInitials,
  isSafeCssColor,
  resolveTrackerLabelColor,
  isTrackerSyncStale,
} from "@/lib/tracker-tasks/presentation";
import {
  TRACKER_PRIORITY_LEVELS,
  TRACKER_STATUS_CATEGORIES,
} from "@/lib/tracker-tasks/types";

const NOW_LOCAL = new Date(2026, 2, 10, 12, 0, 0);
const NOW_UTC = new Date("2026-03-10T12:00:00.000Z");

describe("presentation tables", () => {
  it("covers every status category with a themed tone", () => {
    for (const category of TRACKER_STATUS_CATEGORIES) {
      const entry = TRACKER_STATUS_PRESENTATION[category];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.toneClassName.length).toBeGreaterThan(0);
    }
    expect(TRACKER_STATUS_PRESENTATION.in_progress.toneClassName).toContain(
      "text-info",
    );
    expect(TRACKER_STATUS_PRESENTATION.in_review.toneClassName).toContain(
      "text-warning",
    );
    expect(TRACKER_STATUS_PRESENTATION.done.toneClassName).toContain(
      "text-muted-foreground",
    );
    expect(TRACKER_STATUS_PRESENTATION.closed.toneClassName).toContain(
      "text-muted-foreground",
    );
  });

  it("covers every priority level with an icon name, not a component", () => {
    for (const level of TRACKER_PRIORITY_LEVELS) {
      const entry = TRACKER_PRIORITY_PRESENTATION[level];
      expect(typeof entry.iconName).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
    }
    expect(TRACKER_PRIORITY_PRESENTATION.urgent.iconName).toBe("ChevronsUp");
    expect(TRACKER_PRIORITY_PRESENTATION.urgent.toneClassName).toBe(
      "text-destructive",
    );
    expect(TRACKER_PRIORITY_PRESENTATION.high.toneClassName).toBe(
      "text-warning",
    );
    expect(TRACKER_PRIORITY_PRESENTATION.none.iconName).toBe("Minus");
  });
});

describe("formatTrackerDue", () => {
  it("renders nothing when there is no due date", () => {
    expect(formatTrackerDue(null, NOW_LOCAL)).toBeNull();
  });

  it("labels overdue work", () => {
    expect(formatTrackerDue("2026-03-09", NOW_LOCAL)).toEqual({
      label: "Yesterday",
      tone: "overdue",
    });
    expect(formatTrackerDue("2026-03-05", NOW_LOCAL)).toEqual({
      label: "5d overdue",
      tone: "overdue",
    });
  });

  it("labels today and the near future", () => {
    expect(formatTrackerDue("2026-03-10", NOW_LOCAL)).toEqual({
      label: "Today",
      tone: "today",
    });
    expect(formatTrackerDue("2026-03-11", NOW_LOCAL)).toEqual({
      label: "Tomorrow",
      tone: "soon",
    });
    expect(formatTrackerDue("2026-03-13", NOW_LOCAL)).toEqual({
      label: "In 3d",
      tone: "soon",
    });
  });

  it("falls back to a stable short date further out", () => {
    expect(formatTrackerDue("2026-03-20", NOW_LOCAL)).toEqual({
      label: "Mar 20",
      tone: "normal",
    });
    expect(formatTrackerDue("2027-01-05", NOW_LOCAL)).toEqual({
      label: "Jan 5, 2027",
      tone: "normal",
    });
  });

  it("shows an unparseable date verbatim with no urgency", () => {
    expect(formatTrackerDue("2026-02-31", NOW_LOCAL)).toEqual({
      label: "2026-02-31",
      tone: "none",
    });
    expect(formatTrackerDue("someday", NOW_LOCAL)).toEqual({
      label: "someday",
      tone: "none",
    });
  });

  it("stays on the local calendar day late at night", () => {
    expect(
      formatTrackerDue("2026-03-10", new Date(2026, 2, 10, 23, 45)),
    ).toEqual({ label: "Today", tone: "today" });
  });
});

describe("formatTrackerSyncedAt", () => {
  function ago(ms: number): string {
    return new Date(NOW_UTC.getTime() - ms).toISOString();
  }

  it("reports never for a source that has not synced", () => {
    expect(formatTrackerSyncedAt(null, NOW_UTC)).toBe("Never");
    expect(formatTrackerSyncedAt("not-a-timestamp", NOW_UTC)).toBe("Never");
  });

  it("collapses the first minute", () => {
    expect(formatTrackerSyncedAt(ago(0), NOW_UTC)).toBe("just now");
    expect(formatTrackerSyncedAt(ago(30_000), NOW_UTC)).toBe("just now");
    // A clock that jumped backwards must not print a negative age.
    expect(formatTrackerSyncedAt(ago(-5_000), NOW_UTC)).toBe("just now");
  });

  it("steps up through minutes, hours and days", () => {
    expect(formatTrackerSyncedAt(ago(3 * 60_000), NOW_UTC)).toBe("3m ago");
    expect(formatTrackerSyncedAt(ago(59 * 60_000), NOW_UTC)).toBe("59m ago");
    expect(formatTrackerSyncedAt(ago(2 * 3_600_000), NOW_UTC)).toBe("2h ago");
    expect(formatTrackerSyncedAt(ago(3 * 86_400_000), NOW_UTC)).toBe("3d ago");
  });

  it("falls back to a date past a week", () => {
    // Asserted loosely: the day depends on the host timezone, the format does not.
    expect(formatTrackerSyncedAt(ago(40 * 86_400_000), NOW_UTC)).toMatch(
      /^Jan \d{1,2}$/,
    );
  });
});

describe("isTrackerSyncStale", () => {
  const iso = (secondsAgo: number) =>
    new Date(NOW_UTC.getTime() - secondsAgo * 1000).toISOString();

  it("allows one missed poll before warning", () => {
    expect(isTrackerSyncStale({ lastSyncedAt: iso(500) }, 300, NOW_UTC)).toBe(
      false,
    );
    expect(isTrackerSyncStale({ lastSyncedAt: iso(599) }, 300, NOW_UTC)).toBe(
      false,
    );
    expect(isTrackerSyncStale({ lastSyncedAt: iso(700) }, 300, NOW_UTC)).toBe(
      true,
    );
  });

  it("treats a never-synced source as un-synced rather than stale", () => {
    expect(isTrackerSyncStale({ lastSyncedAt: null }, 300, NOW_UTC)).toBe(
      false,
    );
  });

  it("does not warn on a nonsense interval or timestamp", () => {
    expect(isTrackerSyncStale({ lastSyncedAt: iso(9_000) }, 0, NOW_UTC)).toBe(
      false,
    );
    expect(
      isTrackerSyncStale({ lastSyncedAt: iso(9_000) }, Number.NaN, NOW_UTC),
    ).toBe(false);
    expect(isTrackerSyncStale({ lastSyncedAt: "nope" }, 300, NOW_UTC)).toBe(
      false,
    );
  });
});

describe("getInitials", () => {
  it("returns an empty string for empty input", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });

  it("takes first and last for a multi-part name", () => {
    expect(getInitials("Ada Lovelace")).toBe("AL");
    expect(getInitials("  Ada   Byron   Lovelace  ")).toBe("AL");
    expect(getInitials("ada lovelace")).toBe("AL");
  });

  it("takes two characters for a single-token name", () => {
    expect(getInitials("Madonna")).toBe("MA");
    expect(getInitials("Z")).toBe("Z");
  });

  it("handles non-Latin scripts", () => {
    expect(getInitials("김재복")).toBe("김재");
    expect(getInitials("山田 太郎")).toBe("山太");
  });

  it("never splits an emoji cluster", () => {
    expect(getInitials("🙂")).toBe("🙂");
    expect(getInitials("👩‍💻")).toBe("👩‍💻");
    expect(getInitials("🇰🇷 Team")).toBe("🇰🇷T");
  });

  it("never returns more than two graphemes", () => {
    for (const name of ["Ada Lovelace", "Madonna", "김재복", "🙂🙂🙂"]) {
      expect(
        Array.from(new Intl.Segmenter().segment(getInitials(name))).length,
      ).toBeLessThanOrEqual(2);
    }
  });
});

describe("isSafeCssColor", () => {
  it("accepts the three supported shapes", () => {
    for (const value of [
      "#fff",
      "#FFF",
      "#ffaa00",
      "#11223344",
      "rgb(255, 0, 0)",
      "rgb(255 0 0)",
      "rgba(0,0,0,0.5)",
      "hsl(210 40% 50%)",
      "hsla(210, 40%, 50%, 0.2)",
      "red",
      "TRANSPARENT",
      "  #fff  ",
    ]) {
      expect(isSafeCssColor(value)).toBe(true);
    }
  });

  it("rejects absent and empty values", () => {
    expect(isSafeCssColor(null)).toBe(false);
    expect(isSafeCssColor(undefined)).toBe(false);
    expect(isSafeCssColor("")).toBe(false);
    expect(isSafeCssColor("   ")).toBe(false);
  });

  it("rejects injection attempts", () => {
    for (const value of [
      "url(x)",
      "URL(https://example.invalid/a.png)",
      "var(--x)",
      "var(--destructive)",
      "red; background:url(x)",
      "red;",
      "#fff; position:fixed",
      "#fff/*x*/",
      "/*",
      "rgb(255,0,0)/*",
      "expression(alert(1))",
      "linear-gradient(red, blue)",
      "attr(data-x)",
      "calc(1px)",
      "image-set(url(x))",
      "\\75 rl(x)",
      "red)",
      "<red>",
      "'red'",
      "{color:red}",
    ]) {
      expect(isSafeCssColor(value)).toBe(false);
    }
  });

  it("rejects malformed hex", () => {
    for (const value of [
      "#12",
      "#",
      "#1234",
      "#12345",
      "#1234567",
      "#gggggg",
    ]) {
      expect(isSafeCssColor(value)).toBe(false);
    }
  });

  it("rejects non-numeric function arguments", () => {
    for (const value of [
      "rgb(a, b, c)",
      "rgb(255)",
      "rgb(255, 0, 0, 0, 0)",
      "rgb(255, 0, 0",
      "rgb(var(--x), 0, 0)",
    ]) {
      expect(isSafeCssColor(value)).toBe(false);
    }
  });

  it("rejects non-ASCII and oversized input", () => {
    expect(isSafeCssColor("réd")).toBe(false);
    expect(isSafeCssColor("ｒｅｄ")).toBe(false);
    expect(isSafeCssColor("x".repeat(300))).toBe(false);
    expect(isSafeCssColor(`rgb(${"9".repeat(300)}, 0, 0)`)).toBe(false);
  });
});

describe("resolveTrackerLabelColor", () => {
  it("maps every Crane semantic token onto a theme class", () => {
    // Crane stores one of these seven, not a CSS value. Treating the field as
    // CSS dropped all of them, so every Crane label rendered without its dot.
    for (const token of [
      "neutral",
      "accent",
      "info",
      "warning",
      "warm",
      "success",
      "danger",
    ]) {
      const resolved = resolveTrackerLabelColor(token);
      expect(resolved?.kind).toBe("token");
      expect(
        resolved?.kind === "token" ? resolved.className : "",
      ).toMatch(/^bg-/);
    }
  });

  it("is case- and whitespace-insensitive about a token", () => {
    expect(resolveTrackerLabelColor("  Danger ")?.kind).toBe("token");
  });

  it("passes a safe CSS colour through for a tracker that sends one", () => {
    expect(resolveTrackerLabelColor("#5b8def")).toEqual({
      kind: "css",
      value: "#5b8def",
    });
    expect(resolveTrackerLabelColor("rgb(10, 20, 30)")?.kind).toBe("css");
  });

  it("prefers the themed token when a name is also a CSS keyword", () => {
    // `orange` is a CSS keyword, but a tracker naming a slot means the slot.
    expect(resolveTrackerLabelColor("accent")?.kind).toBe("token");
  });

  it("returns nothing for an absent or unusable value", () => {
    expect(resolveTrackerLabelColor(undefined)).toBeNull();
    expect(resolveTrackerLabelColor(null)).toBeNull();
    expect(resolveTrackerLabelColor("")).toBeNull();
    expect(resolveTrackerLabelColor("url(javascript:alert(1))")).toBeNull();
    expect(resolveTrackerLabelColor("var(--primary)")).toBeNull();
  });
});
