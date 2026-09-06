import { plugin } from "bun";
import path from "node:path";
import stylex from "@stylexjs/unplugin";

// The renderer resolves `@/*` through tsconfig/vite. The StyleX compiler does
// its own module resolution for token imports, so it needs the same alias or a
// `*.stylex.ts` reached through `@/` fails to resolve under `bun test` only.
const srcAlias = path.join(import.meta.dir, "..", "src", "*");

// Use the production compiler for server-rendered component tests. Mocking
// StyleX would hide invalid styles and token resolution failures.
const compiler = stylex.raw(
  {
    aliases: { "@/*": [srcAlias] },
    dev: false,
    runtimeInjection: false,
    useCSSLayers: true,
    enableMediaQueryOrder: false,
  },
  { framework: "bun" },
);
plugin({
  name: "stave-test-stylex",
  setup(builder) {
    builder.onLoad(
      { filter: /[/\\]src[/\\].*\.[jt]sx?$/ },
      async ({ path }) => {
        const source = await Bun.file(path).text();
        const result = source.includes("@stylexjs/stylex")
          ? await compiler.transform(source, path)
          : null;
        return {
          contents: result?.code ?? source,
          loader: path.endsWith("x") ? "tsx" : "ts",
        };
      },
    );
  },
});
