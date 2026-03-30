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

## Sample EPUB for tests

- **Path:** [`fixtures/epub/sterne-life-and-opinions-of-tristram-shandy-gentleman-illustrations.epub`](fixtures/epub/sterne-life-and-opinions-of-tristram-shandy-gentleman-illustrations.epub) (copy of a Project Gutenberg–style Sterne edition with illustrations).
- **Automated checks:** from `apps/web`, run `npm test` — validates the sample EPUB ZIP + `mimetype` + OPF, and **asserts progressive Spanish blending** (`lang="es"`, `tiempo` / `vida`, `pr-first-l2`) in [`apps/web/src/lib/progressiveBlendCore.test.ts`](apps/web/src/lib/progressiveBlendCore.test.ts). Full `extractEpub` via epubjs remains a manual browser check.

## Customize

- **Lexicon:** edit or replace [`apps/web/public/lexicons/en-es.json`](apps/web/public/lexicons/en-es.json) (lemma keys in English). Add more JSON files and extend `pairId` in [`apps/web/src/types/book.ts`](apps/web/src/types/book.ts) / settings when you add UI for other pairs.
- **Pace:** Settings → “Blend pace (gamma)” — higher values introduce Spanish tokens more slowly at the start of the book.

## Build

```bash
cd apps/web
npm run build
npm run preview
```

### GitHub Pages (`aledquin.github.io`)

The deploy workflow publishes to **`aledquin/aledquin.github.io`**:

- **`https://aledquin.github.io/`** — static landing page ([`github-pages/landing/index.html`](github-pages/landing/index.html)) with a link to the app.
- **`https://aledquin.github.io/reader/`** — built PWA (`npm run build:gh-pages`). The app uses **`BASE_PATH=/reader/`** (see [`apps/web/vite.config.ts`](apps/web/vite.config.ts)); PWA `start_url`, `scope`, and Workbox `navigateFallback` follow that base.

Other files already on the Pages branch are preserved (`keep_files: true`). To change the homepage copy or styling, edit `github-pages/landing/index.html`.

**Local production check**

```bash
cd apps/web
npm run build:gh-pages
npm run preview:gh-pages
```

Open the printed URL and ensure assets load under `/reader/`.

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every PR and push to `main`/`master` when `apps/web` or `github-pages/` changes: `npm ci` → `npm run verify` (same as `build:gh-pages` + full test suite).

**Automated deploy** ([`.github/workflows/deploy-gh-pages-reader.yml`](.github/workflows/deploy-gh-pages-reader.yml))

1. **Target repo** `aledquin/aledquin.github.io` exists on GitHub; your PAT can push to it.
2. **GitHub Pages** on that repo: **Settings → Pages** — source **branch `main`**, folder **`/ (root)`** (the workflow writes `index.html`, `.nojekyll`, and `reader/` at the root of that branch).
3. **PAT** with **Contents: Read and write** on `aledquin/aledquin.github.io` only ([fine-grained](https://github.com/settings/tokens?type=beta) or classic).
4. In **this** repo: **Settings → Secrets and variables → Actions → New repository secret**  
   Name: `GH_PAGES_TOKEN`  
   Value: that PAT.
5. Confirm `publish_branch` in the workflow matches the branch you use on `aledquin.github.io` (`main` is the default).
6. Push to `main` or `master` (with changes under `apps/web/`) or run the workflow manually (**Actions → Deploy reader to GitHub Pages → Run workflow**).

The workflow builds **`_site`** with the landing page at the repo root and the app under **`reader/`**, then pushes to `aledquin.github.io`. Production **`dist/`** also includes **`404.html`** and **`.nojekyll`** under `reader/` for the SPA.

**Dependency updates:** [`.github/dependabot.yml`](.github/dependabot.yml) proposes monthly bumps for npm (`apps/web`) and GitHub Actions.

**Local one-shot check** (same as CI):

```bash
cd apps/web
npm ci
npm run verify
```

## Limitations (v1)

- Substitution is **lemma-level** (not full conjugation parity with Spanish).
- **Tap-to-define:** select a single English word to see a gloss if it exists in the bundled lexicon.
- EPUB HTML is sanitized; very unusual markup may lose formatting.
