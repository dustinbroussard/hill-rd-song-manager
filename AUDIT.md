# Hill Rd. Song Manager — Codebase Audit (v1)

Date: 2025-10-31

Scope: Current repository at project root. Primarily a static web app (HTML/CSS/JS) with an offline-first PWA, IndexedDB persistence, and an editor sub-app. No Flask/React code is present.

## Summary

Overall quality is solid for a static PWA. IndexedDB is used via `idb`, search via Fuse.js, OCR via Tesseract.js, and DOCX parsing via Mammoth. The service worker implements cache-first strategies with care around redirected responses and heavy assets. A few small runtime risks were identified (notably reliance on CDN for SortableJS), and there was no lint/CI pipeline. This audit adds a CI workflow, ESLint/Prettier configuration, .gitignore improvements, and a defensive fix for Sortable usage to avoid errors when offline.

## Findings

### 1) Reliability: CDN dependency for SortableJS
- Severity: Medium
- Details: `index.html` and `editor/editor.html` load SortableJS from a CDN. If offline or blocked, `Sortable` is undefined, causing runtime errors where used (main app’s setlist drag-and-drop). Editor already guards against missing Sortable; main app did not.
- Fix: Added a guard in `script.js` to check `typeof Sortable === 'undefined'` before creating the sortable list and show a one-time informational toast if unavailable.
- Patch: script.js updated; see diff.
- Recommendation: Vendor a local copy under `lib/sortable.min.js` and add a fallback loader in HTML to preserve offline reordering.

### 2) Linting/Formatting/CI missing
- Severity: Medium
- Details: No ESLint/Prettier config or CI existed. This raises long-term maintenance risks.
- Fix: Added `.eslintrc.json`, `.eslintignore`, `.prettierrc`, and a GitHub Actions workflow to run lint and formatting checks.
- Patch: Added files and updated `package.json` scripts and devDependencies.
- Recommendation: Run `npm ci` locally and in CI; maintain a zero-warnings policy.

### 3) Service Worker: Robustness and scope
- Severity: Low
- Details: SW precaches a list mixing paths with and without leading `/`. This typically resolves correctly; SW strips redirects for cached entries and avoids caching `eng.traineddata` which is good.
- Recommendation: Consider normalizing all entries with a leading `/` and adding a fallback for `editor/editor.html` and `performance/performance.html` if navigated directly with query strings. Current logic already handles navigations and ignores search for HTML.

### 4) Data migration flow
- Severity: Low
- Details: On init, the app migrates localStorage to IDB, then calls `loadData()` which reads songs from localStorage (likely empty post-migration), and then loads from IDB and overwrites the earlier state. Behavior is correct but redundant.
- Recommendation: Simplify `loadData()` to avoid reading songs from localStorage now that IDB is authoritative.

### 5) External assets and privacy
- Severity: Low
- Details: FontAwesome and Google Fonts load via external CDNs. `config.js` exposes AI settings; API key remains empty which is good.
- Recommendation: Consider self-hosting fonts/icons for fully offline use and privacy. Keep secrets out of the repo and rely on runtime configuration in `config.js`.

### 6) UX polish
- Severity: Low
- Details: Toasters, modals, and voice features are implemented. Some actions rely on browser features that may not be present.
- Recommendation: Continue graceful degradation: hide or disable voice/clipboard features if unsupported. This is largely done already.

## Performance Notes
- Fuse-based fuzzy search is used selectively; thresholds are sane. Consider limiting search scope when song counts grow large, and debounce search inputs.
- Service worker uses cache-first; consider `stale-while-revalidate` for select assets if desired. Current offline-first posture is reasonable.

## Security Notes
- All data is local; no sensitive writes. The optional OpenRouter integration is client-side; users must provide their own key. Ensure users understand their content may be sent to third parties if that feature is enabled.

## Implemented Changes (Patch Summary)
- script.js: Add global annotations for ESLint; guard Sortable usage with a toast when unavailable.
- package.json: Add `lint` and `format` scripts; devDependencies for ESLint/Prettier.
- .eslintrc.json / .eslintignore / .prettierrc: New configs.
- .github/workflows/ci.yml: New CI workflow to run lint + Prettier check.
- .gitignore: Add common ignores (`node_modules`, `dist`, etc.).

## Suggested Next Steps
- Vendor `Sortable.min.js` locally and add HTML fallback loader.
- Add basic unit tests for small pure functions (e.g., normalization helpers) using a lightweight test runner.
- Consider splitting very large `script.js` into smaller modules for maintainability if a build step is acceptable.
- Add Cypress or Playwright e2e tests for critical flows (import, setlist create/rename/reorder, performance mode) when introducing CI runners.

## How to Run the New Checks
1) Install Node 20+.
2) Run: `npm ci`
3) Lint: `npm run lint`
4) Format check: `npx prettier -c "**/*.{js,css,html,json,md}"`

CI will execute the same steps on pushes and pull requests to `main`/`master`.

