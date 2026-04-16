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

The deploy workflow publishes **only** **`reader/`** on **`aledquin/aledquin.github.io`** (it does **not** overwrite your site’s root `index.html`). Add links to **`/reader/`** from your own homepage/nav ([`github-pages/landing/index.html`](github-pages/landing/index.html) is an optional standalone reference, not deployed by default).

- **`https://aledquin.github.io/reader/`** (and the same path on your custom domain) — built PWA (`npm run build:gh-pages`). The app uses **`BASE_PATH=/reader/`** (see [`apps/web/vite.config.ts`](apps/web/vite.config.ts)); PWA `start_url`, `scope`, and Workbox `navigateFallback` follow that base.

**Local production check**

```bash
cd apps/web
npm run build:gh-pages
npm run preview:gh-pages
```

Open the printed URL and ensure assets load under `/reader/`.

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every PR and push to `main`/`master` when `apps/web` or `github-pages/` changes: `npm ci` → `npm run verify` (same as `build:gh-pages` + full test suite). Workflows use **`actions/checkout@v6`**, **`actions/setup-node@v6`**, and **`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`** so Actions run on Node.js 24 per [GitHub’s deprecation timeline](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).

**Automated deploy** ([`.github/workflows/deploy-gh-pages-reader.yml`](.github/workflows/deploy-gh-pages-reader.yml))

1. **Target repo** `aledquin/aledquin.github.io` exists on GitHub; your PAT can push to it.
2. **GitHub Pages** on that repo: **Settings → Pages** — source **branch `main`**, folder **`/ (root)`** (your site lives there; the workflow only updates the **`reader/`** folder).
3. **PAT** with **Contents: Read and write** on `aledquin/aledquin.github.io` only ([fine-grained](https://github.com/settings/tokens?type=beta) or classic).
4. In **this** repo: **Settings → Secrets and variables → Actions → New repository secret**  
   Name: `GH_PAGES_TOKEN`  
   Value: that PAT.
5. Confirm `publish_branch` in the workflow matches the branch you use on `aledquin.github.io` (`main` is the default).
6. Push to `main` or `master` (with changes under `apps/web/`) or run the workflow manually (**Actions → Deploy reader to GitHub Pages → Run workflow**).

**Quick links (complete setup in the browser)**

| Step | Link |
|------|------|
| Add `GH_PAGES_TOKEN` | [Actions secrets](https://github.com/aledquin/read_books_translate_learning_app/settings/secrets/actions) |
| Create fine-grained PAT | [New token](https://github.com/settings/personal-access-tokens/new) — repository **aledquin.github.io** only; **Contents** = Read and write |
| Pages on site repo | [Pages settings](https://github.com/aledquin/aledquin.github.io/settings/pages) — branch **main**, folder **/ (root)** |
| Run deploy | [Workflow](https://github.com/aledquin/read_books_translate_learning_app/actions/workflows/deploy-gh-pages-reader.yml) → **Run workflow** |

Live URLs: [aledquin.github.io](https://aledquin.github.io/) (landing) · […/reader/](https://aledquin.github.io/reader/) (app). With a [custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) (e.g. `www.aledquin.com`), use the same paths on that host.

**If `/reader/` is 404** (but deploy workflow is green):

1. **Pages must serve the `main` branch**, not only an Actions artifact. In [Pages settings](https://github.com/aledquin/aledquin.github.io/settings/pages), set **Build and deployment → Source** to **Deploy from a branch**, then **Branch: `main`**, **Folder: `/ (root)`**. If the source is **only** “GitHub Actions” in the sense of [artifact-based Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow) **without** also publishing from `main`, the files peaceiris commits to `main` (including `reader/`) are **not** what gets published — switch to **branch** deployment, or add a separate `deploy-pages` workflow in `aledquin.github.io` that matches this layout.
2. Confirm **`reader/`** exists on GitHub: [github.com/aledquin/aledquin.github.io/tree/main/reader](https://github.com/aledquin/aledquin.github.io/tree/main/reader).
3. Re-run the [deploy workflow](https://github.com/aledquin/read_books_translate_learning_app/actions/workflows/deploy-gh-pages-reader.yml) after fixing settings; wait 1–2 minutes for CDN.

The workflow copies **`apps/web/dist`** into **`reader/`** on `aledquin.github.io`. Production **`dist/`** includes **`404.html`** and **`.nojekyll`** under `reader/` for the SPA.

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

## Additional projects

- [`projects/arduino-auto-mouse`](projects/arduino-auto-mouse) - starter Arduino project for a top-mounted ultrasonic USB HID mouse controller with two configurable distance gates and potentiometer-controlled repeat speed.

## Repository tests

- Web app: from `apps/web`, run `npm test`
- Arduino project consistency checks: from the repo root, run `python3 -m unittest discover -s tests -p 'test_*.py'`
