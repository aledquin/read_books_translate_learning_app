# EPUB translation — extended reference

## Obtaining a Spanish edition

- **Public domain**: Project Gutenberg (multilingual), Wikisource exports, Internet Archive EPUBs — check spine structure vs your English file.
- **Commercial**: legally purchased Spanish EPUB; still verify **structure**, not just title match.
- **Machine translation**: translate **XHTML** carefully — preserve tags, only replace text nodes; re-validate block counts. Post-edit for natural Spanish.

## Tooling (optional)

- **Calibre**: convert, edit book, reorder spine, merge/split chapters — compare HTML tree before/after.
- **Sigil**: direct XHTML edit; good for fixing one-off extra `<p>`.
- **Custom script**: unzip both EPUBs, diff spine `itemref` lists, then diff per-file tag counts for `p|h1|h2|h3|h4|blockquote|li`.

## In-app verification

1. `npm run dev` in `apps/web`
2. Stage Spanish (optional) then import English, or multi-select EN+ES
3. Watch **Import activity** for `[epubCompanion]` mismatch warnings
4. Enable **Sentence translation** and try replace-by-sentence on a chapter; misaligned sentences force API or whole-paragraph fallback

## Translation APIs (when bundled ES missing)

- MyMemory / Libre / Google (see `mymemoryTranslate.ts`, `vite.config.ts` proxies). Not for building **permanent** companions — use for testing or single-language books only.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `linkedParagraphCount` low | ES spine skips chapters or empty blocks |
| Replace-sentence API storm | EN/ES sentence count mismatch per block |
| First paragraphs English-only | Lexicon schedule + selective sentence rules — expected until thresholds |
| Re-blend loop | `settingsSnapshot` vs UI mismatch — check Settings Apply |

## Agent operating mode

When asked to “translate EPUB for this repo”:

1. Clarify target pair (`en-es` only for full sentence features today).
2. If only English exists, propose **structure-preserving** Spanish generation or locate a matching edition.
3. Always recommend **block count parity** before claiming done.
4. Point to **White Nights** fixture tests as a concrete example of validation depth.
