import path from "node:path";
import { resolveExecutable } from "../utils/executable";

export type SupportedLspLanguageId = "python" | "typescript";

export interface ResolvedLspServer {
  languageId: SupportedLspLanguageId;
  displayName: string;
  command: string;
  args: string[];
  detail: string;
}

export function resolveLspServer(args: {
  languageId: SupportedLspLanguageId;
  commandOverride?: string;
}) {
  switch (args.languageId) {
    case "python": {
      const resolved = resolveExecutable({
        preferredValue: args.commandOverride,
        fallbackCommands: ["pyright-langserver", "basedpyright-langserver"],
      });
      if (!resolved) {
        return {
          ok: false as const,
          detail: "Python language server not found. Install `pyright`/`basedpyright` or set a Python LSP command override.",
        };
      }
      return {
        ok: true as const,
        server: {
          languageId: "python" as const,
          displayName: path.basename(resolved.detail),
          command: resolved.command,
          args: ["--stdio"],
          detail: resolved.detail,
        },
      };
    }
    case "typescript": {
      const resolved = resolveExecutable({
        preferredValue: args.commandOverride,
        fallbackCommands: ["typescript-language-server"],
      });
      if (!resolved) {
        return {
          ok: false as const,
          detail: "TypeScript language server not found. Install with `npm i -g typescript-language-server typescript` or set a TypeScript LSP command override.",
        };
      }
      return {
        ok: true as const,
        server: {
          languageId: "typescript" as const,
          displayName: path.basename(resolved.detail),
          command: resolved.command,
          args: ["--stdio"],
          detail: resolved.detail,
        },
      };
    }
  }
}
