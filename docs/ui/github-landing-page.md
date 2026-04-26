# GitHub Pages Site

Stave publishes a React-based landing page plus a curated public docs site through GitHub Pages.

## Public Scope

The public site intentionally stays product-facing:

- `/` is the product landing page
- `/docs/` is the end-user docs home
- `/docs/<guide>/` contains install, workflow, and feature reference pages only
- contributor, architecture, provider-runtime, design-note, and historical roadmap docs stay in the repository but are not part of the public site nav or build

## Files

- `site/` — React site app for landing and docs
- `site/src/public-docs.ts` — curated end-user docs information architecture
- `site/src/site-components.tsx` — landing, docs layout, and shared site UI
- `site/src/site.css` — site-only Tailwind and shadcn visual system
- `scripts/build-pages-site.ts` — generates public docs content, runs the Vite build, and writes `.pages-dist/`
- `vite.site.config.ts` — Vite config for the public site build

## Deployment

GitHub Pages deployment is handled by:

- `.github/workflows/github-pages-landing.yml`

Workflow behavior:

- trigger: push to `main` when `site/**`, `docs/**`, `package.json`, `bun.lock`, `vite.site.config.ts`, the Pages workflow, or the Pages build script changes
- trigger: manual `workflow_dispatch`
- build step: `bun install --frozen-lockfile --ignore-scripts` then `bun run build:pages`
- artifact path: `.pages-dist/`
- deploy target: GitHub Pages environment

## Local Preview

Build the Pages output first:

```bash
bun run build:pages
```

Then serve the generated directory:

```bash
cd .pages-dist
python3 -m http.server 4173
```

Open `http://localhost:4173` for the landing page or `http://localhost:4173/docs/` for the docs home.
