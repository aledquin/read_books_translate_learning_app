---
name: epub-translation-progressive-reader
description: >-
  Produces and validates English+Spanish EPUB pairs for the Progressive Reader app (block-aligned
  companions, import order, sentence modes, lexicon). Use when creating or checking EPUB translations,
  companion editions, EN↔ES alignment, White Nights / Dostoevsky fixtures, or repo translation
  workflow.
---

# EPUB translation for Progressive Reader

## Goal

Deliver **two EPUBs** (English + Spanish) that the app can import together so **`plainEs`** aligns **by block order** with English (`attachSpanishCompanionBlocks`). Avoid APIs where possible by shipping bundled Spanish.

## Hard rules (app behavior)

1. **Block order**: `extractEpub` walks spine → chapter → `p, h1–h4, blockquote, li` (non-empty text only). Spanish must use the **same logical structure** (same count and order of those elements per chapter file).
2. **Import order**: English first, Spanish second — or use filenames like `*.es.epub` so `orderEpubFilesEnglishFirst` fixes multi-select order.
3. **Sentence modes**: Replace-by-sentence needs **matching sentence splits** per paragraph between EN and ES (see `sentenceSplit.ts`); otherwise the app falls back to API or whole-paragraph Spanish.
4. **Re-blend**: Changing blend pipeline or lexicon may require a new `CURRENT_BLEND_VERSION`; user re-opens book to refresh.

## Workflow checklist

Copy and track:

```
- [ ] Source EN EPUB clean (no broken spine; body text in standard tags)
- [ ] Spanish edition: same spine order, same block tag sequence
- [ ] Run block count parity (see below)
- [ ] Optional: `npm run epub:feature-sample` as structural reference
- [ ] Import in dev: EN + ES; confirm Import activity / no mismatch warning
- [ ] Settings: sentence translation + replace modes as needed
```

## Verify block counts (no browser)

From `apps/web`:

```bash
npx vitest run src/lib/epubZipBlockCount.test.ts
```

Uses `countEpubReadingBlocks` (ZIP + OPF spine, same selectors as extract). For a **new** Spanish file, add a one-off test or temporarily compare:

```typescript
const en = readFileSync('path/to/en.epub')
const es = readFileSync('path/to/es.epub')
expect((await countEpubReadingBlocks(en)).total).toBe((await countEpubReadingBlocks(es)).total)
```

## White Nights test fixture

Repo fixture (English): `fixtures/epub/white-nights-fyodor-dostoevsky.epub` (“White Knights” usually means **White Nights** — Dostoevsky). Vitest:

- `src/lib/epubWhiteNights.fixture.test.ts` — zip + text sniff
- `src/lib/epubZipBlockCount.test.ts` — stable block-count sanity check on that file

When `white-nights-fyodor-dostoevsky.es.epub` is present, `epubZipBlockCount.test.ts` asserts EN/ES block-count parity (otherwise that case is skipped).

### Generate `white-nights-fyodor-dostoevsky.es.epub` (machine translation)

From `apps/web`:

```bash
npm run epub:translate:white-nights
```

Runs `scripts/translate-epub-en-es.mjs` (keeps spine + block tags; writes a JSON cache beside the output for resume). **Recommended:** set `GOOGLE_TRANSLATE_API_KEY` for stable quota. Otherwise the script uses `@vitalets/google-translate-api` (unofficial Google web endpoint), which may return HTTP 429 after heavy use—wait and re-run, or set `LIBRETRANSLATE_API_KEY` + `LIBRETRANSLATE_URL`. Optional: `USE_MYMEMORY_FALLBACK=1` (low daily quota). Cache files are gitignored (`fixtures/epub/*.translation-cache.json`).

## Suggestions (quality)

- Prefer **one `<p>` per logical paragraph** in both languages; avoid wrapping the same paragraph in extra `div`s only in one edition.
- **Headings**: keep `h1–h4` in the same places in EN and ES.
- **Lists**: `li` count and order should match when the source uses lists for dialogue or fragments.
- **Front matter**: TOC/nav files are skipped by `shouldSkipSpineSection`; do not rely on them for body alignment.
- **Translator credits / prefaces**: if only one language has extra sections, block counts diverge — move extras outside spine or mirror structure.
- **Encoding**: UTF-8 XHTML; avoid smart quotes breaking tokenization (lexicon uses ASCII-friendly lemmas).
- **Long-term**: store `reader-feature-sample.blocks.json` style snapshots for critical titles (`npm run epub:feature-sample` as template).

## Code map

| Area | Path |
|------|------|
| Extract | `apps/web/src/lib/epubExtract.ts` |
| Companion attach | `apps/web/src/lib/epubCompanion.ts` |
| Filename heuristics | `looksLikeSpanishEpubFilename`, `orderEpubFilesEnglishFirst` |
| Block count QA | `apps/web/src/lib/epubZipBlockCount.ts` |
| Sentence split | `apps/web/src/lib/sentenceSplit.ts` |
| Build tiny sample EPUBs | `apps/web/scripts/build-reader-feature-epub.mjs` |
| EN→ES EPUB (Vitalets / Google / Libre) | `apps/web/scripts/translate-epub-en-es.mjs`, `npm run epub:translate:white-nights` |
| Pipeline doc | `apps/web/docs/translation-pipeline.md`, `apps/web/public/docs/translation-pipeline.html` |

## More detail

See [reference.md](reference.md) for tooling ideas, APIs, and troubleshooting.
