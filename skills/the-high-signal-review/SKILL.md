---
name: the-high-signal-review
description: Run a high-signal review of the current workspace diff or PR in Stave. Use when the user asks for "code review", "PR review", "review this diff", "high-signal review", "strict review", "inline comments only for real issues", or wants only objective bugs and applicable policy violations with validation before commenting.
compatible-tools: [claude, codex]
category: review
test-prompts:
  - "현재 diff 고신뢰도로 리뷰해줘"
  - "review this branch and only comment on real issues"
  - "strict PR review with inline comments"
  - "정책 위반이랑 실제 버그만 짚어줘"
---

# The High-Signal Review

Repository-local skill for reviewing the current workspace diff or PR with a strict false-positive filter.

## Workflow

1. Gather context in parallel.
   - If a PR exists, read only its metadata with `gh pr view --json number,title,body,baseRefName,headRefName`.
   - Prefer the workspace diff tool. Otherwise diff `HEAD` against the merge base plus current uncommitted changes.
   - Collect applicable policy file paths for changed files: `AGENTS.md`, `AGENTS.local.md`, `CLAUDE.md`.
   - A policy file applies only if it is in the same directory as a changed file or an ancestor.
   - Do not inspect GitHub's rendered diff or existing review comments before generating findings.

2. Run independent reviewers in parallel.
   - Give each reviewer the PR metadata, full diff, and applicable policy paths.
   - Use separate passes for policy compliance, independent policy cross-check, diff-only bugs, and introduced regressions.
   - Prefer lightweight and deep review tiers when configurable; otherwise let Stave Auto choose equivalent roles.
   - Subagents must not post comments.

3. Apply the policy hierarchy and issue bar.
   - Policy precedence: `AGENTS.md` > `AGENTS.local.md` > `CLAUDE.md`.
   - Only report objective runtime, logic, or security bugs, or clear violations of an applicable policy rule.
   - Exclude style feedback, suggestions, lint-only findings, missing tests unless policy-required, pre-existing issues, silenced issues, and speculative concerns.

4. Validate every issue before commenting.
   - Deduplicate candidate issues.
   - Validate each unique issue with a separate pass before commenting.
   - Reject anything not clearly real, not in changed code, or not backed by an applicable policy.

5. Comment and report.
   - Only the main agent posts comments.
   - Post one inline comment per unique validated issue, using the repo's PR comment tool when available, otherwise `gh`.
   - Each comment includes a short title, the problem, why it is real, and a rule citation or concrete diff evidence.
   - Include a policy file link when relevant and available.
   - Final output is a numbered list of validated issues with `file:line` and comment location or URL. If nothing survives validation, say so explicitly.

## Fallbacks

- If subagents are unavailable, run the same workflow sequentially.
- If the workspace diff tool is unavailable, use the git diff fallback.
- Do not mention the fallback path unless it materially affected the review.
