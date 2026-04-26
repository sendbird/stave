function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function buildGuidance(prompt) {
  const normalized = prompt.trim().toLowerCase();
  const lines = [];

  if (matchesAny(normalized, [
    /\b(architecture|overview|entrypoint|relevant files|where should i look|understand)\b/,
    /(구조|아키텍처|상황파악|파악|탐색|관련 코드|엔트리포인트)/,
  ])) {
    lines.push(
      "For broad codebase orientation, start with docs/architecture/index.md, docs/architecture/entrypoints.md, and AGENTS.md before reading large files.",
      "Suggested skill: $the-explore-codebase",
    );
  }

  if (matchesAny(normalized, [
    /\b(trace|execution path|call flow|where does this happen|flow)\b/,
    /(흐름|경로|호출|어디서|트레이스)/,
  ])) {
    lines.push(
      "Trace requests through producer -> bridge -> contract -> consumer. In Stave that often means renderer -> preload/window.api -> electron/main/ipc -> provider/runtime -> replay/UI.",
      "Suggested skill: $the-trace-execution-path",
    );
  }

  if (matchesAny(normalized, [
    /\b(ipc|schema|runtimeoptions|window\.api|provider event|normalizedproviderevent|zod)\b/,
    /(ipc|스키마|계약|런타임옵션|window\\.api|provider event|zod)/,
  ])) {
    lines.push(
      "Provider and IPC changes are multi-file contracts. Read docs/architecture/contracts.md and electron/main/ipc/schemas.ts early.",
      "Suggested skill: $the-ipc-contract-audit",
    );
  }

  if (matchesAny(normalized, [
    /\b(entire repo|whole repo|read everything|scan all files)\b/,
    /(전체 리포|전부 읽|모든 파일)/,
  ])) {
    lines.push(
      "Avoid full-repo scanning by default. Prefer architecture docs, repo-map output if available, and targeted search around likely entrypoints.",
    );
  }

  return lines;
}

const rawInput = await readStdin();
const payload = rawInput ? JSON.parse(rawInput) : {};
const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
const guidance = buildGuidance(prompt);

if (guidance.length === 0) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  continue: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: guidance.join("\n"),
  },
}));
