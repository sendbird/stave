// temporary-migration: rename-vocabulary-codemod
/**
 * Renames Stave's registered "project" (a git repository) to "repository"
 * with the TypeScript language service, so every edit follows a symbol rather
 * than text. Jira projects, Martin projects, Claude's per-project settings and
 * Crane's wire contract keep their names: their declarations are never seeded,
 * so their references are never touched even in files that also talk about
 * repositories.
 *
 *   bun scripts/codemods/rename-repositories.ts --report   # list planned renames
 *   bun scripts/codemods/rename-repositories.ts --apply    # write them
 *
 * String literals (SQL, IPC channels, persisted keys, tool names) are not
 * symbols; the text rules in `rename-vocabulary.ts --repositories-strings`
 * cover them, and data written under the old names is moved by registered
 * temporary migrations.
 */
import ts from "typescript";
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const mode = process.argv.includes("--apply") ? "apply" : "report";

/** Files whose "project" means something other than a Stave repository. */
const FOREIGN_FILES: readonly RegExp[] = [
  /martin/i,
  /^src\/lib\/jira-connector\/mapping\.ts$/,
  /^src\/lib\/tracker-issues\/(filter|contract)\.ts$/,
  /^src\/components\/layout\/issues\/TrackerIssueMeta\.tsx$/,
  /^tests\/crane-tasks-contract\.test\.ts$/,
  /^tests\/jira-(mapping|tracker-source)\.test\.ts$/,
  /^electron\/providers\/(claude-mcp-config|claude-mcp-config-management|mcp-env)\.ts$/,
  /^tests\/(claude-mcp-config|mcp-config-refresh|mcp-env)\.test\.ts$/,
  // Provider "project scope" configuration (Claude, Codex, Cursor, Kiro, ACP).
  /^electron\/providers\/(acp\/acp-shared-mcp|claude-plugin-config|json-mcp-config-management|cursor-mcp-config-management|kiro-mcp-config-management|mcp-config-refresh|codex-route-classification|cursor\/cursor-acp-extensions)\.ts$/,
  /^tests\/(cursor|kiro|json)-mcp-config-management\.test\.ts$/,
  // The Issues list filters by the tracker's project, not a repository.
  /^src\/components\/layout\/issues\/(IssuesToolbar\.tsx|useTrackerIssueListPipeline\.ts)$/,
  /^tests\/tracker-issues-(filter\.test\.ts|list-pipeline\.test\.tsx)$/,
  /^scripts\//,
];

/** Names that contain the letters but not the concept. */
const FOREIGN_NAMES =
  /rojection|rojected|Martin|martin|jiraProject|JiraProject|projectRef|ProjectRef|project_ref|ProjectMcp|projectMcp|project_doc|ProjectConfigCandidates|craneProject(?!Mapping)|PROJECT_KEY|staveProjectPath/;

/** Declarations inside mixed files that name a foreign project. */
const FOREIGN_TYPES =
  /^(readonly )?(TrackerIssue(?!StaveLink)\w*|Jira\w*|Martin\w*|Crane\w*Contract\w*)(\[\])?( \| (undefined|null))*$/;

function renamedName(name: string) {
  return name
    .replace(/PROJECTS/g, "REPOSITORIES")
    .replace(/PROJECT/g, "REPOSITORY")
    .replace(/Projects/g, "Repositories")
    .replace(/Project/g, "Repository")
    .replace(/projects/g, "repositories")
    .replace(/project/g, "repository");
}

const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  {
    ...configFile.config,
    include: ["src", "electron", "tests", "server"],
    exclude: ["node_modules", "dist", "out", "coverage"],
    compilerOptions: { ...configFile.config.compilerOptions, types: ["node"], noEmit: true },
  },
  ts.sys,
  root,
);
const fileNames = parsed.fileNames.filter((file) => /\.(ts|tsx|mts|cts)$/.test(file));
const snapshots = new Map<string, string>();
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => fileNames,
  getScriptVersion: () => "0",
  getScriptSnapshot: (file) => {
    if (!ts.sys.fileExists(file)) return undefined;
    let text = snapshots.get(file);
    if (text === undefined) {
      text = ts.sys.readFile(file) ?? "";
      snapshots.set(file, text);
    }
    return ts.ScriptSnapshot.fromString(text);
  },
  getCurrentDirectory: () => root,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = service.getProgram()!;
const checker = program.getTypeChecker();

const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
const isForeignFile = (file: string) => FOREIGN_FILES.some((pattern) => pattern.test(relative(file)));

function isDeclarationName(node: ts.Identifier) {
  const parent = node.parent;
  return (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isBindingElement(parent)) &&
    (parent as ts.NamedDeclaration).name === node
  );
}

/** Names that mean the tracker's project inside one specific file. */
const FOREIGN_NAMES_BY_FILE: Record<string, RegExp> = {
  "src/lib/tracker-issues/types.ts": /^(project|TrackerIssueProjectSchema)$/,
  "src/lib/tracker-issues/kickoff-target.ts": /^projectKey$/,
  "tests/tracker-issues-kickoff-target.test.ts": /^projectKey$/,
};

/** True when an enclosing declaration names a Martin concept. */
function hasForeignAncestor(node: ts.Node) {
  for (let current = node.parent; current; current = current.parent) {
    const name = (current as ts.NamedDeclaration).name;
    if (name && ts.isIdentifier(name) && /martin/i.test(name.text)) return true;
  }
  return false;
}

interface Edit {
  start: number;
  end: number;
  prefix: string;
  name: string;
  suffix: string;
}
const editsByFile = new Map<string, Map<number, Edit[]>>();

/**
 * A shorthand property or aliased import can be renamed twice at one span:
 * once as the property/export (the language service then keeps the local
 * with a suffix) and once as the local (keeping the property with a prefix).
 * Both halves are combined so neither rename is lost.
 */
function mergeEdits(edits: Edit[]): string {
  if (edits.length === 1) return `${edits[0].prefix}${edits[0].name}${edits[0].suffix}`;
  for (const separator of [": ", " as "]) {
    const asOuter = edits.find((edit) => edit.suffix.startsWith(separator));
    const asInner = edits.find((edit) => edit.prefix.endsWith(separator));
    if (asOuter || asInner) {
      const outer = asOuter?.name ?? asInner!.prefix.slice(0, -separator.length);
      const inner = asInner?.name ?? asOuter!.suffix.slice(separator.length);
      return outer === inner ? outer : `${outer}${separator}${inner}`;
    }
  }
  const names = new Set(edits.map((edit) => edit.name));
  if (names.size === 1) return edits[0].name;
  throw new Error(`Conflicting renames at one location: ${[...names].join(", ")}`);
}
const seenSymbols = new Set<ts.Symbol>();
const report: string[] = [];
let skippedForeignType = 0;

for (const sourceFile of program.getSourceFiles()) {
  const file = sourceFile.fileName;
  if (!fileNames.includes(file) || isForeignFile(file)) continue;
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      /project/i.test(node.text) &&
      !FOREIGN_NAMES.test(node.text) &&
      !FOREIGN_NAMES_BY_FILE[relative(file)]?.test(node.text) &&
      isDeclarationName(node)
    ) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol && !seenSymbols.has(symbol)) {
        seenSymbols.add(symbol);
        const typeText = checker.typeToString(checker.getTypeAtLocation(node));
        // A property written in a literal typed by a foreign interface renames
        // that interface's property, so the definition decides, not the seed.
        const definitions = service.getDefinitionAtPosition(file, node.getStart(sourceFile)) ?? [];
        const foreignDefinition = definitions.some(
          (definition) =>
            isForeignFile(definition.fileName) ||
            Boolean(FOREIGN_NAMES_BY_FILE[relative(definition.fileName)]?.test(definition.name)),
        );
        if (foreignDefinition || FOREIGN_TYPES.test(typeText) || hasForeignAncestor(node)) {
          skippedForeignType += 1;
          report.push(`skip-foreign-type ${relative(file)}: ${node.text} : ${typeText.slice(0, 80)}`);
        } else {
          const next = renamedName(node.text);
          const locations =
            service.findRenameLocations(file, node.getStart(sourceFile), false, true, {
              providePrefixAndSuffixTextForRename: true,
            }) ?? [];
          report.push(`rename ${relative(file)}: ${node.text} -> ${next} (${locations.length})`);
          for (const location of locations) {
            const edits = editsByFile.get(location.fileName) ?? new Map<number, Edit[]>();
            const start = location.textSpan.start;
            const atSpan = edits.get(start) ?? [];
            atSpan.push({
              start,
              end: start + location.textSpan.length,
              prefix: location.prefixText ?? "",
              name: next,
              suffix: location.suffixText ?? "",
            });
            edits.set(start, atSpan);
            editsByFile.set(location.fileName, edits);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Strings that spell a renamed compound name (a `Pick<>` key, a registered
 * tool name, a test title) follow the rename. Bare "project"/"projects" are
 * left alone: in strings they are values (setting sources, scopes, view ids).
 */
const renamedNames = new Map<string, string>();
for (const line of report) {
  const match = line.match(/^rename [^:]+: (\S+) -> (\S+) /);
  if (match) renamedNames.set(match[1], match[2]);
}
let stringEdits = 0;
for (const sourceFile of program.getSourceFiles()) {
  const file = sourceFile.fileName;
  if (!fileNames.includes(file) || isForeignFile(file)) continue;
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !/^[Pp]rojects?$/.test(node.text) &&
      renamedNames.has(node.text) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent)
    ) {
      const start = node.getStart(sourceFile) + 1;
      const edits = editsByFile.get(file) ?? new Map<number, Edit[]>();
      if (!edits.has(start)) {
        edits.set(start, [
          { start, end: node.end - 1, prefix: "", name: renamedNames.get(node.text)!, suffix: "" },
        ]);
        editsByFile.set(file, edits);
        stringEdits += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}
report.push(`string edits ${stringEdits}`);

const touched = [...editsByFile.keys()];
console.log(report.join("\n"));
console.log(
  `symbols ${seenSymbols.size}, foreign-type skips ${skippedForeignType}, files ${touched.length}, edits ${[...editsByFile.values()].reduce((sum, edits) => sum + edits.size, 0)}`,
);

if (mode === "apply") {
  for (const [file, edits] of editsByFile) {
    let text = snapshots.get(file) ?? ts.sys.readFile(file) ?? "";
    for (const atSpan of [...edits.values()].sort((left, right) => right[0].start - left[0].start)) {
      text = text.slice(0, atSpan[0].start) + mergeEdits(atSpan) + text.slice(atSpan[0].end);
    }
    writeFileSync(file, text);
  }
}
