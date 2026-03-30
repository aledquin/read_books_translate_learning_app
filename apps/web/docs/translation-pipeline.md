# Translation and blending pipeline

This document describes how English EPUB text becomes **progressive word mixing** and optional **full-sentence Spanish**, without calling external translation APIs when a **paired Spanish EPUB** supplies `plainEs` on each block.

## Reader UX (not in pipeline snapshot)

- **Reading checkpoint**: `BookRecord.readingCheckpoint` stores `scrollTop` (and an anchor block index). Toggle “Save reading position per book” in Settings.
- **Word gloss**: Progressive `lang="es"` spans carry `data-pr-gloss-en` for hover/tap; English words still use lexicon lookup on single-word selection. Optional compromise **grammar tags** in Settings (not full dictionary definitions).

## Quick links

- **Interactive diagrams**: with `npm run dev`, open [translation-pipeline.html](/docs/translation-pipeline.html) (file: `apps/web/public/docs/translation-pipeline.html`).
- **Automated report**: Vitest snapshot in `src/lib/__snapshots__/translationPipeline.integration.test.ts.snap` (run `npm run test:translation-pipeline` from `apps/web`).

## Fixture data (no API)

| Artifact | Path | Role |
|----------|------|------|
| English EPUB | `fixtures/epub/reader-feature-sample.epub` | Import / manual QA |
| Spanish EPUB | `fixtures/epub/reader-feature-sample.es.epub` | Companion for `plainEs` |
| Block JSON | `fixtures/epub/reader-feature-sample.blocks.json` | Fast tests (same order as `extractEpub`) |

Regenerate all three:

```bash
cd apps/web && npm run epub:feature-sample
```

## Settings matrix (EN→ES)

| Sentence translation | When | Style | Bundled `plainEs` | APIs |
|----------------------|------|-------|-------------------|------|
| Off | — | — | Ignored for display | None |
| On | — | Tap to reveal | Optional per block | On tap if missing |
| On | From beginning | Replace paragraph | Full block Spanish | If missing |
| On | From beginning | Replace sentence | Per-sentence if EN/ES counts match | If missing |
| On | After lexicon sightings | Replace paragraph | Blocks with ES always; others after global hit count | If missing |
| On | After lexicon sightings | Replace sentence | Selective: per lemma count; qualifying sentences only | If missing |

## Pipeline stages

1. **Extract** (`epubExtract.ts`): spine → chapters → blocks (`p`, headings, `blockquote`, `li`) with `html` + `plain`.
2. **Companion** (`epubCompanion.ts`): align Spanish blocks by index → `plainEs`.
3. **Progressive blend** (`progressiveBlendCore.ts` / worker): lexicon + pace + `learnWordCap` → inline `<span lang="es">` (and `pr-first-l2` on first occurrence).
4. **Sentence layer** (optional):
   - **Standard** (`buildBlendedOutput.ts` + `sentenceLayer.ts`): after a start index (or from 0), replace whole blocks or sentences using `plainEs` or translators.
   - **Selective** (`selectiveSentenceBlend.ts`): replace **sentence-by-sentence** only when a lexicon lemma in that sentence has reached **N** document-order occurrences; other sentences stay progressive.

## Tests

- **`translationPipeline.integration.test.ts`**: runs all **non-API** bundled scenarios against `reader-feature-sample.blocks.json` and `public/lexicons/en-es.json`. Mocks the worker with sync `blendProgressiveHtml`.
- **`translationPipelineHarness.ts`**: scenario list + `analyzeBlendedHtml()` metrics used by tests and this doc.

API-backed paths (MyMemory, LibreTranslate, Google) are **not** asserted in CI; exercise them manually with dev server and network.
