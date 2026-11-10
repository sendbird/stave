/**
 * Common fence names that have no grammar of their own but read correctly with
 * a loaded one: the JSON grammar already colors `//` and `/* *\/` comments, and
 * `golang` and `patch` are other names for Go and a unified diff. Without
 * these, the fence silently fell back to plain text while its label still
 * named a language.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  jsonc: "json",
  golang: "go",
  patch: "diff",
};

/** Plain fences have no syntax grammar, including the common text aliases. */
export function resolveCodeBlockLanguage(language?: string): string | null {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || ["text", "plaintext", "plain", "txt"].includes(normalized)) return null;
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

/**
 * Readable names for common fence ids, shown in a code block's header. Names
 * of languages and formats are not translated; an id without an entry shows
 * as written.
 */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  golang: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSONC",
  jsx: "JSX",
  kotlin: "Kotlin",
  kt: "Kotlin",
  markdown: "Markdown",
  md: "Markdown",
  patch: "Patch",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

/** The header's name for a fence id: a readable name where one is known, else the id. */
export function codeBlockLanguageLabel(language: string): string {
  return LANGUAGE_NAMES[language.trim().toLowerCase()] ?? language;
}
