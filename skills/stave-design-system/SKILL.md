---
name: stave-design-system
description: Apply Stave's desktop-first design system when a task changes UI, layout, theme, dialogs, sidebars, empty states, settings, prompt input, or other visual UX in this repo. Use for prompts like "디자인", "UI", "redesign", "polish", "sidebar", "dialog", "settings", or whenever a new interface pattern is introduced. Always use existing shadcn components and the radix-vega preset first — never hand-roll a control that shadcn already provides.
compatible-tools: [claude, codex]
category: design
test-prompts:
  - "Stave settings dialog UI 다듬어줘"
  - "redesign the workspace sidebar for better density"
  - "새 empty state 추가하는데 기존 디자인 시스템에 맞춰줘"
  - "polish this dialog without drifting from Stave's visual language"
---

# Stave Design System

Repository-local design skill for Stave's user-facing surfaces.

## Mission

Design for an AI coding workspace first: strong information hierarchy, fast scanning, compact but readable density, consistent light and dark themes, and low-friction keyboard-friendly interaction.

The goal is a calm, sharp desktop workspace built on **shadcn/ui components** and **CSS custom-property tokens**. Every control, input, overlay, and feedback surface should be assembled from these building blocks before considering anything custom.

## Read First

- `components.json` — current shadcn preset (`radix-vega`, `default-translucent`, `subtle`)
- `src/components/ui/` — all available shadcn primitives (see inventory below)
- `src/components/ui/index.ts` — public re-export barrel; new components must be added here
- `src/globals.css` — tokens, fonts, radius, motion, and existing liquid-glass utilities
- the nearest existing file under `src/components/layout/` or `src/components/session/`
- `src/components/layout/settings-dialog-sections.tsx` when theme tokens, settings surfaces, or preset-facing copy is involved
- `docs/ui/shadcn-preset.md` when applying or changing shadcn preset behavior

## shadcn Component Inventory

The project uses the **radix-vega** style with **default-translucent** menu color and **subtle** accent. The following components are already generated and available under `src/components/ui/`:

| Category | Components |
|---|---|
| **Layout** | Accordion, Card, Resizable (Panel, PanelGroup, Handle) |
| **Input** | Button, Input, InputGroup, Textarea, Select, Switch, Slider, Toggle, Calendar |
| **Overlay** | Dialog, Drawer, Popover, DropdownMenu, ContextMenu, Tooltip, Command (palette) |
| **Display** | Badge, Table, Kbd, Empty (state), WaveIndicator |
| **Feedback** | Sonner (toast) |

### Component-First Rule (MANDATORY)

Before writing any interactive UI element, check this inventory:

1. **Need a boolean toggle?** → Use `Switch`, not a custom button toggle.
2. **Need a date picker?** → Use `Calendar` inside a `Popover`, not `<input type="date">`.
3. **Need a dropdown selection?** → Use `Select` (single) or `Command` (searchable/multi).
4. **Need a confirmation or form?** → Use `Dialog` or `Drawer`.
5. **Need contextual actions?** → Use `DropdownMenu` or `ContextMenu`.
6. **Need a text action trigger?** → Use `Button` with the appropriate `variant` and `size`.
7. **Need an empty/error/loading state?** → Use the `Empty` component family.
8. **Need keyboard shortcut hints?** → Use `Kbd` / `KbdGroup`.
9. **Need a toast notification?** → Use `toast` from Sonner.

**Never hand-roll** an `<input>`, `<select>`, `<button>`, or modal wrapper when a shadcn component already exists. If a needed component is missing (e.g. Checkbox, RadioGroup, Tabs), generate it via:

```bash
bunx --bun shadcn@latest add <component> --yes
```

Then add the export to `src/components/ui/index.ts` and verify import paths use `@/` aliases.

### Styling shadcn Components

- Customize through Tailwind `className` overrides, not by editing the generated component source.
- Use shadcn `variant` and `size` props where available instead of inventing new visual tiers.
- When a component needs a compact treatment (e.g. in sidebars or panels), prefer `size="sm"` or `h-7`/`h-8` height classes over arbitrary CSS.

## Core Visual Rules

- Prefer the current semantic token system (`--foreground`, `--muted`, `--primary`, etc.) over raw hex, rgba, or one-off gradients.
- Preserve the existing Stave palette direction from `src/globals.css`, including the green primary accent and current neutral/editor/sidebar surfaces.
- Use the existing font tokens. Do not introduce new product fonts unless the user explicitly asks.
- Optimize for desktop density first, then verify narrower splits and mobile widths where the current product already supports them.
- Keep radii moderate and purposeful. Avoid overly pill-shaped or consumer-marketing styling.
- Keep surfaces legible before they are expressive.

## Glass and Depth

- Treat glassmorphism as a restrained accent, not a blanket theme.
- Reuse existing depth patterns such as `.sidebar-liquid-glass`, `.sidebar-liquid-panel`, translucent cards, and `supports-backdrop-filter:backdrop-blur-xl` popovers before inventing new ones.
- Reserve stronger blur or luminous edge treatment for shells, sidebars, floating panels, popovers, drawers, and overlays that benefit from separation.
- Default content surfaces should remain solid or lightly translucent so text, diffs, logs, and controls stay crisp.
- If a glass treatment hurts contrast, scrolling readability, or performance, remove it.

## Interaction Rules

- Make state obvious through hierarchy, spacing, tokenized color, border, icon, label, and placement before adding motion.
- New interactive controls must define applicable states: default, hover, focus-visible, active, disabled, loading, and error. Shadcn components already handle most of these — verify rather than re-implement.
- Keyboard access and visible focus styles are mandatory. Radix primitives provide this by default; do not strip `focus-visible` styles.
- Keep motion brief and functional. Respect reduced-motion behavior already defined in `src/globals.css`.
- Prefer stable layouts during async work; use skeletons, muted placeholders, or reserved space instead of jumpy reflow.

## Stave-Specific Product Guidance

- Favor layouts that help users manage tasks, workspaces, branches, files, and agent output without losing context.
- Dense does not mean cramped: keep grouping clear and use whitespace to separate functional clusters, not to create airy marketing spacing.
- Visual emphasis should track product importance:
  - task and workspace identity first
  - current action and status second
  - secondary metadata third
- Use semantic status colors for warnings, destructive actions, success, and provider identity. Do not add a new accent family unless there is a real product meaning for it.
- Empty, loading, and error states should be useful and operational, not ornamental. Use the `Empty` component family for structured empty states.
- In right-rail panels, prefer flat section headers, divider-separated groups, and compact rows over stacking independent cards. Use card-like containment only when a summary block or isolated workflow genuinely benefits from stronger separation.

## Implementation Workflow

1. **Check the component inventory** before writing any UI control. If shadcn has it, use it.
2. If a shadcn component is missing, generate it with `bunx --bun shadcn@latest add <name> --yes`, add the export to `index.ts`, and reconcile `@/` import paths.
3. Inspect the nearest existing surface before proposing a new pattern.
4. Reuse shared primitives and semantic tokens first.
5. If a new visual pattern is necessary, encode it as a reusable utility, shared component, or token-backed treatment instead of a one-off class pile.
6. Check the result in both light and dark themes.
7. Check at desktop width and at narrower split-panel widths when the surface can appear there.
8. If the work changes design-system behavior or preset-facing copy, update the related documentation in the same change.

## Do

- keep visual hierarchy obvious at a glance
- use subtle layering and contrast shifts instead of loud decoration
- use existing shadcn components for every standard control (buttons, inputs, selects, switches, dialogs, popovers, calendars, etc.)
- prefer shared patterns already present in Stave
- align new UI with task-oriented desktop workflows
- keep implementation grounded in tokens, shadcn primitives, and existing layout language
- generate missing shadcn components via CLI rather than hand-rolling

## Don't

- do not hand-write a `<select>`, `<input type="date">`, toggle button, or modal when a shadcn component exists
- do not port a generic glassmorphism system wholesale
- do not switch the app to a blue-first or neon palette without explicit direction
- do not introduce raw color values when a semantic token already exists
- do not use blur, glow, shadow, or gradients on every surface
- do not sacrifice density or clarity for visual spectacle
- do not add a new visual metaphor that fights the rest of the app
- do not edit generated shadcn component source files for one-off styling — use `className` overrides instead

## QA Checklist

- Does the change use shadcn components for every standard control?
- Are all shadcn components imported from `@/components/ui` (barrel) or `@/components/ui/<name>`?
- Does the change read clearly in both light and dark mode?
- Does it preserve Stave's current token and component system?
- Is glass or blur used only where depth materially helps?
- Are keyboard focus and disabled/loading/error states clear?
- Does the layout still work in narrower split-panel widths?
- If a new shadcn component was generated, is it exported from `index.ts`?
- If design-system behavior changed, were the relevant docs and preset references updated too?
