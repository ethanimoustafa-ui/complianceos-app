# ComplianceOS — Embedded PDF Fonts

The server-side PDF pipeline (`@react-pdf/renderer`) embeds fonts at render
time. Because `@react-pdf/renderer` ships in a Vercel Function (no
`fontconfig`, no system fallback), every face used at render time must be
present in **this folder** as a `.ttf` file.

If a font is missing the renderer falls back to its bundled `Helvetica`,
which **does not contain Arabic glyphs** — Arabic text renders as boxes.
Drop the files listed below before deploying.

## Required files

| Filename                   | Source                                          | Used by                              |
| -------------------------- | ----------------------------------------------- | ------------------------------------ |
| `Amiri-Regular.ttf`        | https://fonts.google.com/specimen/Amiri         | Arabic body (`Amiri` family)         |
| `Amiri-Bold.ttf`           | https://fonts.google.com/specimen/Amiri         | Arabic headings                      |
| `Inter-Regular.ttf`        | https://fonts.google.com/specimen/Inter         | Latin body (`Inter` family)          |
| `Inter-Medium.ttf`         | https://fonts.google.com/specimen/Inter         | Latin captions / muted text          |
| `Inter-Bold.ttf`           | https://fonts.google.com/specimen/Inter         | Latin headings                       |

### How to fetch (manual)

1. Open the Google Fonts URLs above.
2. Click **Download family** — both downloads contain `.ttf` files under
   the `static/` subfolder. (The variable-font files at the top level of
   the archive are **not** what we want — `@react-pdf/renderer` works
   best with static TTFs.)
3. From the unzipped archive, copy these files into this directory
   (`public/fonts/`):
   - From Amiri: `Amiri-Regular.ttf`, `Amiri-Bold.ttf`
   - From Inter: `static/Inter-Regular.ttf`, `static/Inter-Medium.ttf`,
     `static/Inter-Bold.ttf`
4. Commit them. The PDF registry loads them by path
   (`public/fonts/<file>.ttf`) — names must match exactly.

### Fallback behaviour

`src/lib/pdf/registry.ts` wraps each `Font.register` call in `try/catch`.
If a font file is missing the PDF still renders, using the renderer's
bundled fonts. For Arabic this means glyphs will be replaced with `.notdef`
boxes — usable for English-only smoke tests, broken for Arabic letters.

### Licensing

Both fonts are SIL Open Font License (OFL) 1.1, which permits redistribution
including bundling in this repository.
