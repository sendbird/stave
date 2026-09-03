/**
 * Default prompt templates for all AI-automated features in Stave.
 *
 * Each constant is the out-of-the-box value shown in Settings → Prompts.
 * Users can override any of these; an empty string disables the prompt.
 */

// ---------------------------------------------------------------------------
// Response style – injected into both Claude and Codex system/user prompts
// ---------------------------------------------------------------------------
export const LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE = [
  "Response formatting rules:",
  "- Be concise. Do not repeat what the user already knows.",
  "- Use markdown headers (##, ###) to organize long responses into clear sections.",
  "- Use bullet lists for multiple items instead of run-on paragraphs.",
  '- Avoid meta-narration ("I will now...", "Let me...") -- go straight to the answer.',
  "- Put code in fenced code blocks with the correct language tag.",
  "- When referencing files, use inline code for paths and filenames.",
].join("\n");

export const LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE_WITH_LINKS = [
  "Response formatting rules:",
  "- Be concise. Do not repeat what the user already knows.",
  "- Use markdown headers (##, ###) to organize long responses into clear sections.",
  "- Use bullet lists for multiple items instead of run-on paragraphs.",
  '- Avoid meta-narration ("I will now...", "Let me...") -- go straight to the answer.',
  "- Put code in fenced code blocks with the correct language tag.",
  "- When referencing files, use markdown links instead of inline code so file chips can render.",
  "- Put the file path in the link target, for example `[src/App.tsx](src/App.tsx)` or `[app.store.ts](src/store/app.store.ts#L5161)`.",
].join("\n");

export const DEFAULT_PROMPT_RESPONSE_STYLE = [
  "Response style guidelines:",
  "- Lead with the outcome or the information the user needs next.",
  "- Be concise and do not repeat context the user already knows.",
  "- Use headings or lists only when they make a longer answer easier to scan; keep simple answers conversational.",
  '- Avoid process narration such as "I will now" or "Let me".',
  "- Put code in fenced code blocks with the correct language tag.",
  "- When referencing files, use markdown links so file chips can render.",
  "- Put the file path in the link target, for example `[src/App.tsx](src/App.tsx)` or `[app.store.ts](src/store/app.store.ts#L5161)`.",
].join("\n");

function normalizePromptTemplateValue(value: string) {
  return value.replaceAll("\r\n", "\n").trim();
}

export function normalizeResponseStylePrompt(value: string) {
  const normalized = normalizePromptTemplateValue(value);
  return normalized ===
    normalizePromptTemplateValue(LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE) ||
    normalized ===
      normalizePromptTemplateValue(
        LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE_WITH_LINKS,
      )
    ? DEFAULT_PROMPT_RESPONSE_STYLE
    : value;
}

// ---------------------------------------------------------------------------
// PR description generator
// ---------------------------------------------------------------------------
export const DEFAULT_PROMPT_PR_DESCRIPTION = [
  "You are a pull request description generator. Generate a PR title and body for a GitHub pull request.",
  "",
  "Output format — return EXACTLY this structure with no extra commentary:",
  "TITLE: <one-line PR title, 70 chars or fewer, imperative mood>",
  "BODY:",
  "## Summary",
  "<1-3 concise bullet points describing what this PR does>",
  "",
  "## Changes",
  "<bulleted list of key changes>",
  "",
  "Rules:",
  "- Default to a Conventional Commits-style suggested title: <type>(<optional scope>): <short description>",
  "- The scope is optional. Omit it unless the diff or commit history clearly establishes a meaningful scope",
  "- Never invent a scope by splitting off the first word of the subject or head branch",
  "- Allowed types: feat, fix, refactor, chore, docs, test, perf, ci, build, revert",
  "- If the recent commit log already includes a conventional commit title, reuse the same type and scope in the PR title",
  "- Keep the description part lowercase; do not capitalize the first word after ': '",
  "- Keep the summary focused on the 'why', changes on the 'what'",
  "- Use imperative mood",
].join("\n");

// ---------------------------------------------------------------------------
// Inline code completion
// ---------------------------------------------------------------------------
export const DEFAULT_PROMPT_INLINE_COMPLETION = [
  "You are a code completion engine embedded in an IDE.",
  "You receive a file snippet with a [HOLE] marker where the cursor is.",
  "",
  "Use ALL provided context to produce the best completion:",
  "- Language & filename: match the file's idioms, naming conventions, and style.",
  "- Imports: use only symbols that are already imported or available in scope. Do not invent new imports.",
  "- Prefix (code before [HOLE]): continue the pattern, indentation, and logic established above the cursor.",
  "- Suffix (code after [HOLE]): ensure the completion connects seamlessly to the code that follows. Do not repeat the suffix.",
  "",
  "Output ONLY the raw code that replaces [HOLE]. No markdown. No backticks. No explanation. No prose.",
].join("\n");

// ---------------------------------------------------------------------------
// Workspace Information panel – latest completed turn summary
// ---------------------------------------------------------------------------
/**
 * The pre-project-memory default. Persisted settings merge over the defaults on
 * rehydrate, so an upgraded install would otherwise keep this text forever and
 * never return `durableFacts`. `normalizeWorkspaceTurnSummaryPrompt` swaps it
 * for the current default while leaving user-edited prompts untouched.
 */
export const LEGACY_DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY = [
  "You summarize the latest completed Stave task turn for the workspace Information panel.",
  "Return ONLY valid JSON with this exact shape:",
  '{"requestSummary":"...","workSummary":"..."}',
  "",
  "Rules:",
  "- requestSummary: what the user asked for in this turn.",
  "- workSummary: what the AI actually did, concluded, or changed in response.",
  "- Keep both fields concise and concrete.",
  "- Each field should be one short sentence or phrase.",
  "- Mention blockers or incomplete work briefly when relevant.",
  "- No markdown, no code fences, no extra keys, no commentary.",
].join("\n");

export const DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY = [
  "You summarize the latest completed Stave task turn for the workspace Information panel.",
  "Return ONLY valid JSON with this exact shape:",
  '{"requestSummary":"...","workSummary":"...","durableFacts":[{"kind":"decision|convention|gotcha|fact","content":"..."}]}',
  "",
  "Rules:",
  "- requestSummary: what the user asked for in this turn.",
  "- workSummary: what the AI actually did, concluded, or changed in response.",
  "- Keep both fields concise and concrete.",
  "- Each field should be one short sentence or phrase.",
  "- Mention blockers or incomplete work briefly when relevant.",
  "- durableFacts: 0 to 3 project-level facts worth remembering in every future task of this project: a decision taken, a convention confirmed, a gotcha discovered, or a stable fact about the codebase. Each content is one sentence under 200 characters. Omit anything task-specific, speculative, or already obvious from the repository. Return [] when unsure.",
  "- No markdown, no code fences, no extra keys, no commentary.",
].join("\n");

export function normalizeWorkspaceTurnSummaryPrompt(value: string) {
  return normalizePromptTemplateValue(value) ===
    normalizePromptTemplateValue(LEGACY_DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY)
    ? DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY
    : value;
}

// ---------------------------------------------------------------------------
// Workspace kickoff from an external source
// ---------------------------------------------------------------------------
export const DEFAULT_PROMPT_WORKSPACE_KICKOFF = [
  "You prepare a new Stave coding workspace from the supplied source.",
  "Inspect the source with available MCP tools when useful, then return ONLY valid JSON with this exact shape:",
  '{"branchName":"feat/example","workspaceLabel":"Example","sourceSummary":"...","firstTaskTitle":"...","firstTaskPrompt":"...","panelEntries":[{"target":"jiraIssues","title":"...","url":"https://...","reference":"PROJ-123","note":"..."}],"notes":"","todos":["..."]}',
  "",
  "Rules:",
  "- Follow the supplied project branch naming rule.",
  "- Keep the branch name git-safe and the workspace label concise.",
  "- Treat the supplied source as the source of truth; do not invent facts.",
  "- Add only relevant panel entries. Allowed targets: jiraIssues, confluencePages, figmaResources, slackThreads, linkedPullRequests, storybookResources, amplifyLinks.",
  "- Make firstTaskPrompt actionable and self-contained, including the source URL when one exists.",
  "- Use an empty string or empty array when information is unavailable.",
  "- No markdown, no code fences, no extra commentary.",
].join("\n");
