# ComplianceOS — Embedded PDF Fonts

The server-side PDF pipeline (`@react-pdf/renderer`) embeds fonts at render
time. Because `@react-pdf/renderer` ships in a Vercel Function (no
`fontconfig`, no system fallback), every face used at render time must be
present **in this folder** as a `.ttf` file.

## Current layout

Fonts ship in subdirectories matching the upstream Google Fonts archive
structure. `src/lib/pdf/registry.ts` loads them by these paths.

```
public/fonts/
├── static-amiri/
│   ├── Amiri-Regular.ttf       ← Arabic body, weight 400
│   ├── Amiri-Bold.ttf          ← Arabic headings, weight 700
│   ├── Amiri-Italic.ttf        ← Arabic italic, weight 400
│   └── Amiri-BoldItalic.ttf    ← Arabic bold-italic, weight 700
└── static-inter/
    ├── Inter_18pt-Regular.ttf  ← Latin body, weight 400
    ├── Inter_18pt-Medium.ttf   ← Latin medium, weight 500
    ├── Inter_18pt-Bold.ttf     ← Latin bold, weight 700
    └── …other optical sizes (24pt, 28pt) and weights are unused
```

> The Inter archive ships with three optical sizes (18pt, 24pt, 28pt) and a
> full weight range from Thin to Black. We pin to the **18pt optical** at
> Regular / Medium / Bold weights because those map cleanly to body text +
> captions + headings in the PDF templates. The other files are kept in the
> tree so a future template can opt into a different size or weight without
> a re-download.

## If a font goes missing

`src/lib/pdf/registry.ts` wraps each `Font.register` call in `try/catch`.
If a TTF is absent the renderer falls back to its bundled `Helvetica`,
which **does not contain Arabic glyphs** — Arabic text would render as
`.notdef` boxes. Useful for English-only smoke tests, broken for SAMA
letters.

## Adding more weights / sizes

Edit `src/lib/pdf/registry.ts` and append to `FACES`. Match the optical
size to the rendered text size for crisp output:

| Rendered size | Inter optical |
|---------------|---------------|
| ≤ 18 pt       | `Inter_18pt-…` |
| 19–23 pt      | `Inter_24pt-…` |
| ≥ 24 pt       | `Inter_28pt-…` |

## Licensing

Both fonts are SIL Open Font License (OFL) 1.1, which permits redistribution
including bundling in this repository. Original sources:
- Amiri: https://fonts.google.com/specimen/Amiri
- Inter: https://fonts.google.com/specimen/Inter
