import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "vite";

import {
  PUBLIC_DOC_SECTIONS,
  flattenPublicDocs,
  getHomeDoc,
} from "../site/src/public-docs";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const outputRoot = path.join(repoRoot, ".pages-dist");
const generatedModulePath = path.join(
  repoRoot,
  "site",
  "src",
  "generated",
  "public-docs.generated.ts",
);
const docsHomeOutputPath = path.join(outputRoot, "docs", "index.html");

function routeHref(fromRoute: string, targetRoute: string) {
  if (fromRoute === targetRoute) {
    return "./";
  }

  return `../${targetRoute}/`;
}

function assetHref(_fromRoute: string, targetAssetPath: string) {
  return `../${targetAssetPath}`;
}

async function createGeneratedModule() {
  const publicDocRoutes = flattenPublicDocs();
  const routeBySourcePath = new Map<string, string>();

  for (const doc of publicDocRoutes) {
    const resolvedPath = path.resolve(repoRoot, doc.sourcePath);
    if (routeBySourcePath.has(resolvedPath)) {
      throw new Error(`Duplicate public docs source path: ${doc.sourcePath}`);
    }

    routeBySourcePath.set(resolvedPath, doc.routePath);
  }

  const transformedSections = [];

  for (const section of PUBLIC_DOC_SECTIONS) {
    const transformedDocs = [];

    for (const doc of section.docs) {
      const resolvedSourcePath = path.resolve(repoRoot, doc.sourcePath);
      const rawMarkdown = await readFile(resolvedSourcePath, "utf8");
      const transformedMarkdown = rawMarkdown.replace(
        /(!?\[[^\]]*?\])\(([^)]+)\)/g,
        (_match, label, rawTarget) => {
          const target = rawTarget.trim();

          if (
            target.startsWith("http://") ||
            target.startsWith("https://") ||
            target.startsWith("mailto:") ||
            target.startsWith("#")
          ) {
            return `${label}(${target})`;
          }

          const [targetPath, hash = ""] = target.split("#");
          const resolvedTargetPath = path.resolve(
            path.dirname(resolvedSourcePath),
            targetPath,
          );

          if (resolvedTargetPath === path.join(repoRoot, "README.md")) {
            return `${label}(https://github.com/sendbird-playground/stave${hash ? `#${hash}` : ""})`;
          }

          if (
            resolvedTargetPath.endsWith(".md") &&
            resolvedTargetPath.startsWith(docsRoot)
          ) {
            const targetRoute = routeBySourcePath.get(resolvedTargetPath);

            if (!targetRoute) {
              throw new Error(
                `Public doc ${doc.routePath} links to non-public markdown: ${target}`,
              );
            }

            const href = routeHref(doc.routePath, targetRoute);
            return `${label}(${hash ? `${href}#${hash}` : href})`;
          }

          if (resolvedTargetPath.startsWith(docsRoot)) {
            const relativeAssetPath = path
              .relative(docsRoot, resolvedTargetPath)
              .split(path.sep)
              .join("/");
            const href = assetHref(doc.routePath, relativeAssetPath);
            return `${label}(${hash ? `${href}#${hash}` : href})`;
          }

          return `${label}(${target})`;
        },
      );

      transformedDocs.push({
        routePath: doc.routePath,
        sourcePath: doc.sourcePath,
        title: doc.title,
        description: doc.description,
        previewImage: doc.previewImage,
        content: transformedMarkdown,
      });
    }

    transformedSections.push({
      id: section.id,
      title: section.title,
      docs: transformedDocs,
    });
  }

  const siteData = {
    sections: transformedSections,
    homeRoute: getHomeDoc().routePath,
  };

  await mkdir(path.dirname(generatedModulePath), { recursive: true });
  await writeFile(
    generatedModulePath,
    `import type { SiteData } from "../site-types";\n\nexport const siteData: SiteData = ${JSON.stringify(siteData, null, 2)};\n`,
  );
}

async function duplicateDocsShell() {
  const docsHtmlTemplate = await readFile(docsHomeOutputPath, "utf8");
  const docsHomeHtml = docsHtmlTemplate.replaceAll("__DOC_ROUTE__", "home");
  await writeFile(docsHomeOutputPath, docsHomeHtml);

  const docHtmlTemplate = docsHtmlTemplate
    .replaceAll('="../assets/', '="../../assets/')
    .replaceAll('="./assets/', '="../../assets/')
    .replaceAll('="../favicon.svg"', '="../../favicon.svg"');

  for (const doc of flattenPublicDocs()) {
    const outputPath = path.join(
      outputRoot,
      "docs",
      doc.routePath,
      "index.html",
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      docHtmlTemplate.replaceAll("__DOC_ROUTE__", doc.routePath),
    );
  }
}

async function copyStaticAssets() {
  await cp(
    path.join(repoRoot, "docs", "screenshots"),
    path.join(outputRoot, "docs", "screenshots"),
    { recursive: true },
  );
}

async function main() {
  await createGeneratedModule();

  await build({
    configFile: path.join(repoRoot, "vite.site.config.ts"),
    logLevel: "info",
  });

  await duplicateDocsShell();
  await copyStaticAssets();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
