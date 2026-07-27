import { describe, expect, test } from "bun:test";
import {
  buildLocalChangeReviewPrompt,
  LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS,
} from "@/lib/local-change-review";

describe("local change review prompt", () => {
  test("defaults the review source to the uncommitted working tree", () => {
    const prompt = buildLocalChangeReviewPrompt({
      scope: "working-tree",
      focuses: ["correctness", "tests"],
    });

    expect(prompt).toContain("staged, unstaged, and untracked changes");
    expect(prompt).toContain("`git status --short`");
    expect(prompt).toContain("Do not look for a pull request");
    expect(prompt).toContain("Treat this as a read-only review");
    expect(prompt).toContain("Correctness:");
    expect(prompt).toContain("Tests:");
    expect(prompt).not.toContain("Additional review instructions:");
  });

  test("can review the entire local branch with focused instructions", () => {
    const prompt = buildLocalChangeReviewPrompt({
      scope: "branch",
      focuses: ["security", "architecture"],
      instructions: "Check the renderer to preload contract.",
    });

    expect(prompt).toContain("committed branch changes");
    expect(prompt).toContain("repository default branch");
    expect(prompt).toContain("Security:");
    expect(prompt).toContain("Architecture:");
    expect(prompt).toContain("Check the renderer to preload contract.");
    expect(prompt).toContain('say "No findings" explicitly');
  });

  test("every selectable focus is described and reaches the prompt", () => {
    for (const option of LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS) {
      expect(option.description.length).toBeGreaterThan(0);
    }

    const prompt = buildLocalChangeReviewPrompt({
      scope: "working-tree",
      focuses: LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS.map((option) => option.value),
    });

    expect(prompt).toContain("UI and accessibility:");
    expect(prompt).toContain("Error handling:");
    expect(
      prompt.split("\n").filter((line) => line.startsWith("- ")),
    ).toHaveLength(LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS.length);
  });
});
