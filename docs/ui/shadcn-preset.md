# shadcn Preset

Current stored UI metadata:

- style: `radix-vega`
- preset reference: `bNQ7GS20w`
- menu treatment: `default-translucent`
- menu accent: `subtle`
- Tailwind class prefix: empty string
- generated alias set includes `@/hooks`
- default sans stack: `Geist Variable`

To bootstrap the same preset shape:

```bash
bunx --bun shadcn@latest init --preset bNQ7GS20w
```

`components.json` stores the style/menu metadata, while the preset's color token palette is applied in `src/globals.css`. The current `bNQ7GS20w` swap kept the metadata and font stack the same and only changed the color tokens.
