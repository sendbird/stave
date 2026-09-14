/**
 * The StyleX Vite integration, compiled per ORIGIN.
 *
 * ## What this replaces and why
 *
 * `stylex.vite()` compiles every file in the program with one
 * `classNamePrefix` and emits one sheet whose layers are
 * `priority1 … priority9`. That is a single position in the cascade for
 * everything StyleX produces, which is why ADS could not put a brand theme
 * BETWEEN its own declarations and a product's: there was no seam to put it in.
 *
 * A StyleX atomic class is a pure function of its declaration, so `Button`
 * and an app file that both write `paddingInline: vars["--ads-space-12"]`
 * produce the SAME class. One class cannot hold two cascade positions, so the
 * seam cannot be made by sorting the collected rules — an identical
 * declaration authored on both sides would land in both layers and the
 * higher copy would silently outrank a theme rule aimed at the lower one.
 * Distinct `classNamePrefix` values per origin are what make an atomic class
 * belong to exactly one layer.
 *
 * That is only possible because ADS tokens are declared under explicit custom
 * property names. `classNamePrefix` prefixes generated VARIABLE names as well
 * as class names, and a consuming file re-derives a token's name with its own
 * prefix — so with hashed keys, a product file compiled under `p` asked for
 * `var(--p1i78luf)` while ADS defined `--x1i78luf`, and every app lost every
 * token. See `refactor(ads)!: declare tokens as explicit CSS custom
 * properties`.
 *
 * ## Emitted order
 *
 * `packages/design-system/src/styles.css` declares
 * `@layer reset, base, ads, ads-theme, product;` and
 * `scripts/vite-cascade-layers.mjs` publishes that statement into the document
 * head before any bundled sheet can register a layer. Each origin's rules are
 * then processed separately with `useLayers: {prefix}`, which emits
 * `@layer ads.priority1, …` / `@layer product.priority1, …`. Those nest inside
 * the already-positioned `ads` and `product` layers, so StyleX keeps its
 * priority ordering INSIDE each origin while the origins keep their order
 * relative to each other and to `ads-theme`.
 *
 * ## `defineConsts` is not prefix-invariant
 *
 * A `defineConsts` value (ADS breakpoints, density steps) is inlined as a
 * placeholder `var(--<keyhash>)` and substituted inside
 * `processStylexRules`, from a map built out of the rules handed to THAT call.
 * The keyhash carries the compiling file's prefix, so a product file asking
 * for `breakpoints.md` emits `var(--p…)` while ADS's definition is keyed
 * `x…` — measured, the substitution silently fails and the rule ships as a
 * literal `var(--pcomt5d){…}` block, which is invalid CSS and takes out every
 * media query in the app.
 *
 * Const rules emit no CSS of their own, so the fix is to hand every origin's
 * run the const rules from every origin, re-keyed under each prefix. The hash
 * body is prefix-invariant (`xcomt5d` / `pcomt5d`), which
 * `scripts/vite-ads-stylex.test.mjs` asserts so a StyleX upgrade that changes
 * it fails loudly instead of dropping media queries.
 *
 * ## Coupling
 *
 * `unpluginFactory` is a public export of `@stylexjs/unplugin`; the
 * `__stylex*` properties it hangs on its return value are not. The Vite hooks
 * below are a deliberate reimplementation of that package's own `./vite`
 * adapter, which is internal and cannot vary an option per module. The
 * dependency is pinned exactly (`0.19.0`), and the compatibility test covers
 * every internal it touches.
 */
import path from "node:path";

import { unpluginFactory } from "@stylexjs/unplugin";

import {
  STYLEX_ORIGINS,
  createOriginClassifier,
  lower,
  pickCssAsset,
  processRulesByOrigin,
} from "./vite-ads-stylex.core.mjs";

const DEV_CSS_PATH = "/virtual:ads-stylex.css";
const DEV_CLIENT_ID = "virtual:ads-stylex-client";
const JS_LIKE = /\.[cm]?[jt]sx?(\?|$)/;

export {
  STYLEX_ORIGINS,
  createOriginClassifier,
  originOfRuleKey,
  processRulesByOrigin,
  reprefixConstRule,
} from "./vite-ads-stylex.core.mjs";

const DEV_CLIENT_SCRIPT = `
const STYLE_ID = "__ads_stylex__";
const CSS_PATH = ${JSON.stringify(DEV_CSS_PATH)};
async function refresh() {
  const res = await fetch(CSS_PATH + "?t=" + Date.now());
  const css = await res.text();
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (typeof link.href === "string" && link.href.includes(CSS_PATH)) link.disabled = true;
  }
}
if (import.meta.hot) {
  import.meta.hot.on("ads-stylex:update", () => { refresh(); });
}
refresh();
`;

/**
 * @param {object} userOptions Everything `stylex.vite()` accepts, plus
 *   `adsRoots` (extra directories to classify as ADS) and
 *   `cssInjectionTarget`.
 */
export function adsStylex(userOptions = {}) {
  const {
    adsRoots,
    cssInjectionTarget,
    enableLTRRTLComments,
    lightningcssOptions,
    useCSSLayers: _ignoredUseCSSLayers,
    ...stylexOptions
  } = userOptions;

  const classify = createOriginClassifier(adsRoots);
  const instances = new Map(
    STYLEX_ORIGINS.map((origin) => [
      origin.name,
      unpluginFactory(
        {
          ...stylexOptions,
          classNamePrefix: origin.classNamePrefix,
          enableLTRRTLComments,
        },
        { framework: "vite" },
      ),
    ]),
  );
  const anyInstance = instances.get(STYLEX_ORIGINS[0].name);
  const store = anyInstance.__stylexGetSharedStore?.() ?? {
    rulesById: new Map(),
    version: 0,
  };
  const stylexPackages = anyInstance.__stylexPackages ?? [];

  let server = null;
  let outDir = null;
  let injectedInGenerateBundle = false;

  function collectCss() {
    const allRules = Array.from(store.rulesById.values()).flat();
    return lower(
      processRulesByOrigin(allRules, { enableLTRRTLComments }),
      lightningcssOptions,
    );
  }

  return {
    name: "ads-stylex-origins",
    enforce: "pre",

    config(config) {
      if (stylexPackages.length === 0) return;
      const exclude = (existing = []) =>
        Array.from(new Set([...existing, ...stylexPackages]));
      return {
        optimizeDeps: {
          ...(config?.optimizeDeps ?? {}),
          exclude: exclude(config?.optimizeDeps?.exclude),
        },
        ssr: {
          ...(config?.ssr ?? {}),
          optimizeDeps: {
            ...(config?.ssr?.optimizeDeps ?? {}),
            exclude: exclude(config?.ssr?.optimizeDeps?.exclude),
          },
        },
      };
    },

    configResolved(resolved) {
      outDir = resolved.build?.outDir ?? outDir;
    },

    buildStart() {
      for (const instance of instances.values())
        instance.__stylexResetState?.();
      store.rulesById.clear();
      store.version += 1;
    },

    resolveId(id) {
      return id === DEV_CLIENT_ID ? `\0${DEV_CLIENT_ID}` : null;
    },

    load(id) {
      return id === `\0${DEV_CLIENT_ID}` ? DEV_CLIENT_SCRIPT : null;
    },

    configureServer(devServer) {
      server = devServer;
      devServer.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(DEV_CSS_PATH)) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/css");
        res.setHeader("Cache-Control", "no-store");
        res.end(collectCss());
      });
      let lastVersion = store.version;
      const interval = setInterval(() => {
        if (store.version === lastVersion) return;
        lastVersion = store.version;
        try {
          devServer.ws.send({ event: "ads-stylex:update", type: "custom" });
        } catch {}
      }, 150);
      devServer.httpServer?.once("close", () => clearInterval(interval));
    },

    transformIndexHtml() {
      if (!server) return null;
      const base = server.config.base ?? "";
      return [
        {
          attrs: {
            href: path.posix.join(base, DEV_CSS_PATH),
            rel: "stylesheet",
          },
          injectTo: "head",
          tag: "link",
        },
        {
          attrs: {
            src: path.posix.join(base, `/@id/${DEV_CLIENT_ID}`),
            type: "module",
          },
          injectTo: "head",
          tag: "script",
        },
      ];
    },

    async transform(code, id) {
      if (!JS_LIKE.test(id)) return null;
      const instance = instances.get(classify(id));
      return instance.transform.call(this, code, id);
    },

    shouldTransformCachedModule(args) {
      for (const instance of instances.values()) {
        instance.shouldTransformCachedModule?.(args);
      }
      return false;
    },

    generateBundle(_options, bundle) {
      const css = collectCss();
      if (!css) return;
      const target = pickCssAsset(bundle, cssInjectionTarget);
      if (!target) return;
      const current =
        typeof target.source === "string"
          ? target.source
          : (target.source?.toString() ?? "");
      target.source = current ? `${current}\n${css}` : css;
      injectedInGenerateBundle = true;
    },

    writeBundle(options, bundle) {
      if (injectedInGenerateBundle) return;
      const css = collectCss();
      if (!css) return;
      const dir =
        options?.dir ?? (options?.file ? path.dirname(options.file) : outDir);
      if (!dir) return;
      const target = pickCssAsset(bundle, cssInjectionTarget);
      const assetsDir = path.join(dir, "assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      const outfile = target
        ? path.join(dir, target.fileName)
        : path.join(assetsDir, "ads-stylex.css");
      let current = "";
      try {
        current = fs.readFileSync(outfile, "utf8");
      } catch {}
      if (current.includes(css)) return;
      fs.writeFileSync(outfile, current ? `${current}\n${css}` : css, "utf8");
    },
  };
}
