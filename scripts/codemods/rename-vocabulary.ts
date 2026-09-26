// temporary-migration: rename-vocabulary-codemod
/**
 * Replays Stave's vocabulary renames on any branch, so work that started
 * before a rename landed can be brought onto the new names mechanically.
 *
 *   bun scripts/codemods/rename-vocabulary.ts <rule-set> [--dry-run]
 *
 * A rule set renames files with `git mv` and rewrites identifiers, paths,
 * IPC channels and tool names in tracked text files. It deliberately leaves
 * persisted legacy names, history (CHANGELOG) and design records alone;
 * the data migrations that read old names live in the product code and are
 * registered in `config/temporary-migrations.json`. Prose that uses the old
 * word in its ordinary English sense is protected phrase by phrase, so always
 * review the diff after a run.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

type Replacement = readonly [pattern: RegExp, replacement: string];

interface RuleSet {
  description: string;
  fileRenames: ReadonlyArray<readonly [from: string, to: string]>;
  /** Exact phrases where the old word keeps its ordinary meaning. */
  protectedPhrases: readonly string[];
  replacements: readonly Replacement[];
  /** Matches identifiers that contain the old word, for the collision report. */
  identifierPattern: RegExp;
}

const ALWAYS_EXCLUDED = [
  /^CHANGELOG\.md$/,
  /^bun\.lock$/,
  /^config\/temporary-migrations\.json$/,
  /^docs\/superpowers\/specs\/2026-09-26-projects-missions-playbooks-design\.md$/,
  /^scripts\/codemods\//,
];

const TEXT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|md|yml|yaml|css|html)$/;

const RULE_SETS: Record<string, RuleSet> = {
  automations: {
    description: "Routine → Automation",
    fileRenames: [
      ["src/lib/routines.ts", "src/lib/automations.ts"],
      ["electron/host-service/routine-runtime.ts", "electron/host-service/automation-runtime.ts"],
      ["electron/main/routine-service.ts", "electron/main/automation-service.ts"],
      ["electron/main/ipc/routines.ts", "electron/main/ipc/automations.ts"],
      ["src/components/layout/TopBarRoutines.tsx", "src/components/layout/TopBarAutomations.tsx"],
      [
        "src/components/layout/RoutineInformationResourceCreator.tsx",
        "src/components/layout/AutomationInformationResourceCreator.tsx",
      ],
      [
        "src/components/layout/routine-information-resource-creator.styles.ts",
        "src/components/layout/automation-information-resource-creator.styles.ts",
      ],
      ["tests/routines.test.ts", "tests/automations.test.ts"],
      ["tests/routine-runtime.test.ts", "tests/automation-runtime.test.ts"],
      ["tests/routine-result-navigation.test.ts", "tests/automation-result-navigation.test.ts"],
      ["docs/features/routines.md", "docs/features/automations.md"],
    ],
    protectedPhrases: [
      "force-terminate routine",
      "routine approval",
      "routine work",
      "discovery routine",
      // Search keyword kept so people who remember the old name still find it.
      '"routine",',
      // The taxonomy records that the old word is retired.
      'word "routine" is retired',
    ],
    replacements: [
      [/\ba routine\b/g, "an automation"],
      [/\bA routine\b/g, "An automation"],
      [/\bA Routine\b/g, "An Automation"],
      [/ROUTINE/g, "AUTOMATION"],
      [/Routine/g, "Automation"],
      [/routine(?!ly)/g, "automation"],
    ],
    identifierPattern: /[A-Za-z0-9_$]*(?:ROUTINE|Routine|routine(?!ly))[A-Za-z0-9_$]*/g,
  },
};

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

function applyRules(source: string, rules: RuleSet) {
  const placeholders = rules.protectedPhrases.map(
    (_, index) => `\u0000PROTECTED_${index}\u0000`,
  );
  let text = source;
  rules.protectedPhrases.forEach((phrase, index) => {
    text = text.split(phrase).join(placeholders[index]);
  });
  for (const [pattern, replacement] of rules.replacements) {
    text = text.replace(pattern, replacement);
  }
  rules.protectedPhrases.forEach((phrase, index) => {
    text = text.split(placeholders[index]).join(phrase);
  });
  return text;
}

/**
 * Lists identifiers whose renamed form already exists. A rename that lands on
 * an existing name can silently merge two bindings (for example a local
 * helper shadowing the import it wraps), so every hit must be resolved by hand
 * before or right after the run.
 */
function reportCollisions(files: string[], rules: RuleSet) {
  const sourceByFile = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const oldTokens = new Set<string>();
  const existingTokens = new Set<string>();
  for (const source of sourceByFile.values()) {
    for (const match of source.matchAll(rules.identifierPattern)) oldTokens.add(match[0]);
    for (const match of source.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) existingTokens.add(match[0]);
  }
  const collisions = [...oldTokens]
    .map((token) => [token, applyRules(token, rules)] as const)
    .filter(([token, renamed]) => renamed !== token && existingTokens.has(renamed));
  for (const [token, renamed] of collisions) {
    console.warn(`collision: ${token} -> ${renamed} already exists; review every use`);
  }
  return collisions.length;
}

function main() {
  const [ruleSetName, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const rules = ruleSetName ? RULE_SETS[ruleSetName] : undefined;
  if (!rules) {
    console.error(
      `Usage: bun scripts/codemods/rename-vocabulary.ts <${Object.keys(RULE_SETS).join("|")}> [--dry-run]`,
    );
    process.exit(2);
  }

  for (const [from, to] of rules.fileRenames) {
    if (!existsSync(from)) continue;
    if (existsSync(to)) throw new Error(`Refusing to overwrite ${to}`);
    console.log(`${dryRun ? "would move" : "move"} ${from} -> ${to}`);
    if (!dryRun) run("git", ["mv", from, to]);
  }

  const files = run("git", ["ls-files"])
    .split("\n")
    .filter(
      (file) =>
        file &&
        TEXT_FILE.test(file) &&
        !ALWAYS_EXCLUDED.some((pattern) => pattern.test(file)) &&
        existsSync(file),
    );
  const collisions = reportCollisions(files, rules);
  let changed = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const next = applyRules(source, rules);
    if (next === source) continue;
    changed += 1;
    console.log(`${dryRun ? "would rewrite" : "rewrite"} ${file}`);
    if (!dryRun) writeFileSync(file, next);
  }
  console.log(
    `${rules.description}: ${changed} file(s) ${dryRun ? "would change" : "changed"}; ${collisions} collision(s) to review.`,
  );
}

main();
