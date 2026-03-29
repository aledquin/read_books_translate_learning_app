# Progressive translation reader

Mobile-first web app (PWA) that opens **EPUB** files and blends in a second language over the course of the book using **local, open-source** NLP ([compromise](https://github.com/spencermountain/compromise)) and a **bundled** English→Spanish gloss list. No LLM APIs and no server required.

## Run locally

Requires [Node.js](https://nodejs.org/) 20+ (npm on your `PATH`).

```bash
cd apps/web
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Use **Import EPUB** to add a book; the first open runs blending in a Web Worker and stores the result in **IndexedDB** for offline reading.

## Customize

- **Lexicon:** edit or replace [`apps/web/public/lexicons/en-es.json`](apps/web/public/lexicons/en-es.json) (lemma keys in English). Add more JSON files and extend `pairId` in [`apps/web/src/types/book.ts`](apps/web/src/types/book.ts) / settings when you add UI for other pairs.
- **Pace:** Settings → “Blend pace (gamma)” — higher values introduce Spanish tokens more slowly at the start of the book.

## Build

```bash
cd apps/web
npm run build
npm run preview
```

## Limitations (v1)

- Substitution is **lemma-level** (not full conjugation parity with Spanish).
- **Tap-to-define:** select a single English word to see a gloss if it exists in the bundled lexicon.
- EPUB HTML is sanitized; very unusual markup may lose formatting.
