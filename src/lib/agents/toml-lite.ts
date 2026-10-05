import { i18n } from "@/i18n/runtime";
/**
 * Minimal TOML reader for provider agent files (`.codex/agents/*.toml`).
 *
 * Supports what those files use: top-level `key = value` pairs with basic,
 * literal and multi-line strings, integers, floats, booleans and one-line
 * arrays of those. Tables (`[x]`, `[[x]]`) are not interpreted; their names
 * are reported so the importer can say what it did not bring over. Anything
 * else is reported as an error rather than guessed.
 */

export type TomlScalar = string | number | boolean;
export type TomlValue = TomlScalar | TomlScalar[];

export interface ParsedToml {
  values: Record<string, TomlValue>;
  tables: string[];
  errors: string[];
}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function unescapeBasic(text: string): string {
  return text.replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[btnfr"\\])/g, (_match, code: string) => {
    switch (code[0]) {
      case "b": return "\b";
      case "t": return "\t";
      case "n": return "\n";
      case "f": return "\f";
      case "r": return "\r";
      case "\"": return "\"";
      case "\\": return "\\";
      default: return String.fromCodePoint(Number.parseInt(code.slice(1), 16));
    }
  });
}

/** Reads one value starting at `text[0]`; returns the value and the rest. */
function readValue(text: string): { value: TomlValue; rest: string } | null {
  const source = text.trimStart();
  if (source.startsWith("\"")) {
    const match = /^"((?:[^"\\\n]|\\.)*)"/.exec(source);
    return match ? { value: unescapeBasic(match[1]!), rest: source.slice(match[0].length) } : null;
  }
  if (source.startsWith("'")) {
    const end = source.indexOf("'", 1);
    return end > 0 ? { value: source.slice(1, end), rest: source.slice(end + 1) } : null;
  }
  if (source.startsWith("[")) {
    const items: TomlScalar[] = [];
    let rest = source.slice(1).trimStart();
    while (!rest.startsWith("]")) {
      const item = readValue(rest);
      if (!item || Array.isArray(item.value)) return null;
      items.push(item.value);
      rest = item.rest.trimStart();
      if (rest.startsWith(",")) rest = rest.slice(1).trimStart();
      else if (!rest.startsWith("]")) return null;
    }
    return { value: items, rest: rest.slice(1) };
  }
  const bare = /^[^\s,\]#]+/.exec(source);
  if (!bare) return null;
  const token = bare[0];
  const rest = source.slice(token.length);
  if (token === "true" || token === "false") return { value: token === "true", rest };
  const numeric = token.replace(/_/g, "");
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(numeric)) return { value: Number(numeric), rest };
  return null;
}

function isTrailingOk(rest: string) {
  const trimmed = rest.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

export function parseToml(content: string): ParsedToml {
  const values: Record<string, TomlValue> = {};
  const tables: string[] = [];
  const errors: string[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let inTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const table = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(trimmed);
    if (table) {
      tables.push(table[1]!);
      inTable = true;
      continue;
    }

    const assignment = /^("[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!assignment) {
      errors.push(i18n.t("agents:remaining.presentationCopy499", { v1: index + 1 }));
      continue;
    }
    const rawKey = assignment[1]!;
    const key = rawKey.startsWith("\"") || rawKey.startsWith("'") ? rawKey.slice(1, -1) : rawKey;
    let rawValue = assignment[2]!;

    // Multi-line strings may span lines; collect until the closing delimiter.
    const multi = rawValue.startsWith("\"\"\"") ? "\"\"\"" : rawValue.startsWith("'''") ? "'''" : null;
    let value: TomlValue | null = null;
    if (multi) {
      let body = rawValue.slice(3);
      let closeAt = body.indexOf(multi);
      while (closeAt < 0 && index + 1 < lines.length) {
        index += 1;
        body += `\n${lines[index]}`;
        closeAt = body.indexOf(multi);
      }
      if (closeAt < 0) {
        errors.push(i18n.t("agents:remaining.presentationCopy500", { v1: key }));
        continue;
      }
      let text = body.slice(0, closeAt);
      if (text.startsWith("\n")) text = text.slice(1);
      value = multi === "\"\"\"" ? unescapeBasic(text.replace(/\\\n\s*/g, "")) : text;
      rawValue = body.slice(closeAt + 3);
      if (!isTrailingOk(rawValue)) {
        errors.push(i18n.t("agents:remaining.presentationCopy501", { v1: key }));
        continue;
      }
    } else {
      const read = readValue(rawValue);
      if (!read || !isTrailingOk(read.rest)) {
        errors.push(i18n.t("agents:remaining.presentationCopy502", { v1: key }));
        continue;
      }
      value = read.value;
    }

    if (inTable) continue; // values inside tables are reported by table name only
    if (!BARE_KEY.test(key)) {
      errors.push(i18n.t("agents:remaining.presentationCopy503", { v1: key }));
      continue;
    }
    values[key] = value;
  }

  return { values, tables, errors };
}
